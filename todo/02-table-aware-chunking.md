# 02 — Table-Aware Chunking (Excel/PDF Table Fix)

## Context

### The Problem

When users convert Excel files to PDF and upload them, the current pipeline produces **oversized table chunks** that waste LLM context:

1. **Excel→PDF conversion** loses row/column structure → becomes visual table in PDF
2. **DeepDoc PDF parser** detects table as single layout region → outputs one giant text block
3. **`naive_merge()`** sees no `\n` delimiters within the table → keeps it as one chunk
4. Result: **Single chunk with 1000-3000+ tokens** for a large table

### Current Table Handling (3 different paths)

#### Path A: Table Parser (direct Excel upload, `table.py:376-522`)
- Parser: `rag/app/table.py` — purpose-built for `.xlsx/.xls/.csv`
- Chunking: **Each row = one chunk** with headers as context
- Batching: 10 rows per chunk (`batch_size=10`, line 395)
- Problem: **10 rows × 20 columns = 200 cells = 1000+ tokens per chunk**
- Format: `"- Field: Value\n- Field: Value\n..."` (line 513)

#### Path B: Naive Parser (Excel→PDF, `naive.py`)
- Parser: DeepDoc PDF parser → `naive_merge()`
- Chunking: Delimiter-based merging with 512-token target
- Problem: **Entire table becomes one chunk** because no row delimiters exist in PDF text
- No table structure awareness at all

#### Path C: tokenize_table (used by both paths, `__init__.py:375-406`)
- Called after parser extracts table rows
- Batches rows: `de.join(rows[i:i + batch_size])` where `batch_size=10`
- No adaptive batching based on row width

### Why This Matters

- Healthcare spreadsheets (patient data, lab results, drug formularies) often have 15-30 columns
- SDLC documents (test matrices, requirement traceability) have wide, dense tables
- Oversized chunks:
  1. Waste LLM context window (1000-token chunk where 200 tokens would suffice)
  2. Dilute relevance (LLM sees 10 rows when only 1 is relevant)
  3. Reduce retrieval precision (vector embedding of 10 rows is less specific)

---

## Implementation Plan

### Step 1: Adaptive Row Batching in `tokenize_table()`

**File**: `advance-rag/rag/nlp/__init__.py` (line 375)

Current:
```python
for i in range(0, len(rows), batch_size):
    r = de.join(rows[i:i + batch_size])
```

New logic:
```python
def tokenize_table(tbls, doc, eng, max_chunk_tokens=400):
    """Chunk table data with adaptive row batching.

    Args:
        tbls: List of (image_rows, positions) tuples.
        doc: Base document dict with metadata.
        eng: Whether content is English.
        max_chunk_tokens: Maximum tokens per table chunk (default 400).

    Returns:
        List of tokenized chunk dicts.
    """
    res = []
    for (img, rows), poss in tbls:
        if not rows:
            continue
        if isinstance(rows, str):
            # Pre-formatted HTML/text table — split by rows if too large
            token_count = num_tokens_from_string(rows)
            if token_count > max_chunk_tokens:
                # Split HTML tables by <tr> tags
                table_rows = re.split(r'(?=<tr)', rows)
                # Re-batch with token budget
                _batch_rows_by_tokens(table_rows, max_chunk_tokens, doc, eng, poss, img, res)
            else:
                d = copy.deepcopy(doc)
                tokenize(d, rows, eng)
                d["content_with_weight"] = rows
                d["doc_type_kwd"] = "table"
                if img:
                    d["image"] = img
                if poss:
                    add_positions(d, poss)
                res.append(d)
            continue

        de = "; " if eng else "； "
        # Adaptive batching: calculate tokens per row, adjust batch size
        _batch_rows_by_tokens(
            [de.join([r]) for r in rows],
            max_chunk_tokens, doc, eng, poss, img, res
        )
    return res


def _batch_rows_by_tokens(rows, max_tokens, doc, eng, poss, img, res):
    """Batch rows into chunks respecting token budget.

    Args:
        rows: List of row strings.
        max_tokens: Maximum tokens per chunk.
        doc: Base document dict.
        eng: Whether English.
        poss: Position metadata.
        img: Associated image.
        res: Output list (mutated).
    """
    current_batch = []
    current_tokens = 0

    for row in rows:
        row_tokens = num_tokens_from_string(row)
        if current_tokens + row_tokens > max_tokens and current_batch:
            # Flush current batch
            _flush_table_batch(current_batch, doc, eng, poss, img, res)
            current_batch = []
            current_tokens = 0
        current_batch.append(row)
        current_tokens += row_tokens

    if current_batch:
        _flush_table_batch(current_batch, doc, eng, poss, img, res)
```

### Step 2: Add Column Header Propagation

Every table chunk should include column headers as prefix for context:

```python
def _flush_table_batch(rows, doc, eng, poss, img, res, headers=None):
    """Create a table chunk from a batch of rows with optional header prefix.

    Args:
        rows: List of row strings for this batch.
        doc: Base document dict.
        eng: Whether English.
        poss: Position metadata.
        img: Associated image.
        res: Output list (mutated).
        headers: Optional column header string to prepend.
    """
    de = "; " if eng else "； "
    d = copy.deepcopy(doc)

    content = de.join(rows)
    if headers:
        # Prepend headers so each chunk has column context
        content = f"[Headers: {headers}]\n{content}"

    tokenize(d, content, eng)
    d["doc_type_kwd"] = "table"
    if img:
        d["image"] = img
    if poss:
        add_positions(d, poss)
    res.append(d)
```

### Step 3: Table Detection in `naive_merge()` for PDF Tables

**File**: `advance-rag/rag/nlp/__init__.py` (line 1070)

When PDF parser detects a table region, the content often contains `|` (markdown table) or `<tr>` (HTML table). Add table-aware splitting:

```python
def naive_merge(sections, chunk_token_num=128, delimiter="\n。；！？", overlapped_percent=0):
    # ... existing logic ...

    for sec, pos in sections:
        # NEW: Detect table content and split differently
        if _is_table_content(sec):
            table_chunks = _split_table_content(sec, chunk_token_num)
            for tc in table_chunks:
                add_chunk("\n" + tc, pos)
        else:
            add_chunk("\n" + sec, pos)

    return cks


def _is_table_content(text: str) -> bool:
    """Detect if text contains table structure.

    Args:
        text: Text content to check.

    Returns:
        True if text appears to be a table.
    """
    # Markdown table: lines with | separators
    pipe_lines = [l for l in text.split('\n') if '|' in l]
    if len(pipe_lines) >= 3:
        return True
    # HTML table
    if '<tr>' in text or '<td>' in text:
        return True
    # Tab-separated with consistent column count
    lines = text.strip().split('\n')
    if len(lines) >= 3:
        tab_counts = [l.count('\t') for l in lines[:5]]
        if tab_counts and min(tab_counts) >= 2 and max(tab_counts) == min(tab_counts):
            return True
    return False


def _split_table_content(text: str, max_tokens: int) -> list[str]:
    """Split table content by rows, preserving header.

    Args:
        text: Table text content.
        max_tokens: Maximum tokens per resulting chunk.

    Returns:
        List of table chunk strings, each with header prefix.
    """
    lines = text.strip().split('\n')
    if not lines:
        return [text]

    # Extract header (first 1-2 lines)
    header = lines[0]
    data_start = 1

    # Check for markdown separator line (|---|---|)
    if len(lines) > 1 and re.match(r'^[\s|:-]+$', lines[1]):
        header = '\n'.join(lines[:2])
        data_start = 2

    header_tokens = num_tokens_from_string(header)
    budget = max_tokens - header_tokens

    # Batch data rows by token budget
    chunks = []
    current = []
    current_tokens = 0

    for line in lines[data_start:]:
        line_tokens = num_tokens_from_string(line)
        if current_tokens + line_tokens > budget and current:
            chunks.append(header + '\n' + '\n'.join(current))
            current = []
            current_tokens = 0
        current.append(line)
        current_tokens += line_tokens

    if current:
        chunks.append(header + '\n' + '\n'.join(current))

    return chunks if chunks else [text]
```

### Step 4: Reduce Default Batch Size in Table Parser

**File**: `advance-rag/rag/app/table.py` (line 376)

Change `chunk()` function to use adaptive batching:

```python
# BEFORE (line 395):
for i in range(0, len(rows), batch_size):  # batch_size=10

# AFTER:
# Calculate adaptive batch size based on average row width
avg_row_tokens = sum(num_tokens_from_string(de.join([str(v) for v in row if v]))
                     for _, row in df.iterrows()) / max(len(df), 1)
adaptive_batch = max(1, min(10, int(400 / max(avg_row_tokens, 1))))
for i in range(0, len(rows), adaptive_batch):
```

### Step 5: Configuration

**File**: `advance-rag/config.py`

```python
# Table chunking settings
TABLE_CHUNK_MAX_TOKENS = int(os.environ.get("TABLE_CHUNK_MAX_TOKENS", "400"))
TABLE_HEADER_PROPAGATION = get_bool_env("TABLE_HEADER_PROPAGATION", True)
```

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `rag/nlp/__init__.py` | Add `_is_table_content()`, `_split_table_content()`, `_batch_rows_by_tokens()`, modify `tokenize_table()` and `naive_merge()` |
| MODIFY | `rag/app/table.py` | Adaptive batch sizing in `chunk()` |
| MODIFY | `config.py` | Add TABLE_CHUNK_* env vars |
| MODIFY | `.env.example` | Document new env vars |

---

## Expected Impact

| Scenario | Before | After |
|----------|--------|-------|
| Excel 20-col × 100-row uploaded directly | 10 chunks, ~1000 tokens each | ~25 chunks, ~400 tokens each |
| Excel→PDF 20-col × 100-row | 1-3 giant chunks, 2000+ tokens | ~25 chunks, ~400 tokens each |
| Healthcare lab results (30 cols) | Oversized, diluted | Row-level precision |
| SDLC test matrix (15 cols) | Structure lost | Headers preserved per chunk |

---

## Acceptance Criteria

- [ ] No table chunk exceeds `TABLE_CHUNK_MAX_TOKENS` (default 400)
- [ ] Every table chunk includes column headers as context
- [ ] Excel→PDF path produces similar chunk quality to direct Excel upload
- [ ] Adaptive batch size adjusts to column count (wide tables = fewer rows per chunk)
- [ ] Existing table parser tests pass unchanged
- [ ] New test: 50-column Excel file produces chunks < 400 tokens each
