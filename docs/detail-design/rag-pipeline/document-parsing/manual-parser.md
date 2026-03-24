# Manual Parser — Detail Design

> **Module**: `advance-rag/rag/app/manual.py`
> **Parser Type**: `ParserType.MANUAL`
> **Category**: Document Parsing
> **Role**: Specialized parser for technical manuals and documentation

---

## 1. Overview

The Manual Parser is optimized for technical manuals, user guides, and structured documentation. It excels at detecting heading hierarchies, building question-answer tree structures from DOCX headings, and preserving section boundaries. It produces section-aware chunks that maintain the document's logical structure, making it ideal for "how to" queries against technical documentation.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Product manuals** | User guides, installation manuals, API documentation |
| **Technical SOPs** | Standard operating procedures with numbered steps |
| **How-to guides** | Step-by-step instructions with headings |
| **Configuration docs** | Settings documentation with section hierarchy |
| **FAQ-style manuals** | Documents structured as heading → explanation |

---

## 3. Supported Formats

| Format | Parser Used | Notes |
|--------|-------------|-------|
| PDF | `PdfParser` with `ParserType.MANUAL` model | Layout-aware with vertical merge |
| DOCX | `RAGFlowDocxParser` + heading level detection | Best format for manuals |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Detect format          │
              │  (PDF vs DOCX)          │
              └────┬──────────────┬─────┘
                   │              │
         ┌─────────▼──────┐  ┌───▼───────────┐
         │   PDF Path     │  │   DOCX Path   │
         └─────────┬──────┘  └───┬───────────┘
                   │              │
         ┌─────────▼──────┐  ┌───▼───────────────┐
         │ PdfParser with │  │ Extract text +     │
         │ MANUAL model   │  │ heading levels     │
         │ + vertical     │  │ docx_question      │
         │   merge        │  │ _level()           │
         └─────────┬──────┘  └───┬───────────────┘
                   │              │
         ┌─────────▼──────┐  ┌───▼───────────────┐
         │ Section-aware  │  │ Build Q&A tree     │
         │ merge by       │  │ heading = question │
         │ position       │  │ body = answer      │
         └─────────┬──────┘  └───┬───────────────┘
                   │              │
                   └──────┬───────┘
                          │
              ┌───────────▼───────────┐
              │  Assign section IDs   │
              │  (heading level       │
              │   change detection)   │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Merge short          │
              │  paragraphs (<32 tok) │
              │  with previous chunk  │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Sort by page +       │
              │  position             │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  tokenize_chunks()    │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Return chunks with   │
              │  position metadata    │
              └───────────────────────┘
```

### 4.2 Function Signature

```python
def chunk(
    filename: str,
    binary: bytes,
    from_page: int = 0,
    to_page: int = 100000,
    lang: str = "English",
    callback=None,
    **kwargs
) -> list[dict]:
```

---

## 5. Business Logic

### 5.1 DOCX Processing — Heading Hierarchy Detection

The DOCX path is the primary path for manuals and uses `docx_question_level()`:

1. **Heading level extraction**: Reads DOCX paragraph styles (Heading 1, Heading 2, etc.)
2. **Level mapping**: Maps DOCX heading levels to a normalized hierarchy (1=top, 2=sub, etc.)
3. **Question-answer tree**: Each heading becomes a "question" and the body text below it becomes the "answer"
4. **Inline images**: Images within paragraphs are extracted and concatenated with text

**Tree structure example**:
```
Heading 1: Installation Guide        → Level 1 (top section)
  Heading 2: Prerequisites           → Level 2
    Body: You need Python 3.10+...   → Content
  Heading 2: Steps                   → Level 2
    Body: 1. Clone the repository... → Content
    Heading 3: Configuration         → Level 3
      Body: Edit config.yaml...      → Content
```

### 5.2 PDF Processing — Vertical Merge

The PDF path uses the `ParserType.MANUAL` layout model:

1. **Layout recognition**: Detects text blocks, tables, figures with manual-optimized model
2. **Vertical merge**: Adjacent text blocks on the same page with similar formatting are merged vertically (important for manuals where text flows across columns)
3. **Section detection**: Font size and style changes indicate section boundaries
4. **Position-aware sorting**: Blocks sorted by page number, then by vertical position

### 5.3 Section ID Assignment

Section IDs are assigned based on heading level changes:

```python
# Pseudocode
section_id = 0
prev_level = 0

for block in blocks:
    if block.heading_level != prev_level:
        section_id += 1
    block.section_id = section_id
    prev_level = block.heading_level
```

This allows chunks within the same section to be grouped for context expansion during retrieval.

### 5.4 Short Paragraph Padding

Paragraphs with fewer than 32 tokens are merged with the previous chunk:

- **Rationale**: Very short paragraphs (e.g., "Note:", "Important:", single-line items) lack sufficient context for meaningful embedding
- **Behavior**: The short paragraph's text is appended to the preceding chunk
- **Exception**: If it's the first chunk, it stands alone

### 5.5 Position Tags in Chunk Text

The Manual Parser embeds position tags directly in chunk text:

```
##1$$ Installation Guide
You need Python 3.10 or higher to run this application.
##2$$ Prerequisites
- Python 3.10+
- PostgreSQL 15+
```

The `##N$$` tags represent section positions, enabling the frontend to reconstruct document navigation.

---

## 6. Output Example

```python
{
    "content_with_weight": "##1$$ Prerequisites\nYou need Python 3.10+, PostgreSQL 15+, and Redis 7+ installed on your system. Ensure all services are running before proceeding.",
    "content_ltks": ["prerequisites", "python", "postgresql", "redis", "installed", "system"],
    "content_sm_ltks": ["pre", "req", "pyt", ...],
    "docnm_kwd": "installation-manual.docx",
    "title_tks": ["prerequisites"],
    "title_sm_tks": ["pre", "req"],
    "image": None,
    "position_int": [(3, 72, 540, 120, 280)],
    "page_num_int": [3]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Manual | Naive | Book | Paper |
|--------|--------|-------|------|-------|
| Heading detection | DOCX styles + PDF font analysis | Bullet patterns | Bullet patterns | title_frequency() |
| Q&A tree structure | Yes | No | No | No |
| Position tags | Yes (##N$$) | No | No | No |
| Short paragraph merge | Yes (<32 tokens) | No | No | No |
| Section IDs | Yes | No | No | No |
| Vertical merge (PDF) | Yes | No | No | No |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| No headings in DOCX | Treats entire document as single section |
| Deeply nested headings (>5 levels) | Flattens to max depth |
| PDF without clear sections | Falls back to position-based splitting |
| Empty sections | Skipped (no empty chunks produced) |
| Image extraction failure | Logs warning, continues with text only |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/pdf_parser.py` | PDF with MANUAL model |
| `deepdoc/parser/docx_parser.py` | DOCX heading + text extraction |
| `rag/nlp/` | docx_question_level(), tokenize_chunks() |
