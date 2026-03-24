# Paper Parser — Detail Design

> **Module**: `advance-rag/rag/app/paper.py`
> **Parser Type**: `ParserType.PAPER`
> **Category**: Document Parsing
> **Role**: Specialized parser for academic and research papers

---

## 1. Overview

The Paper Parser is purpose-built for academic papers, research articles, and conference proceedings. It understands the structural conventions of scholarly documents: title/author blocks, abstracts, two-column layouts, section hierarchies, and reference sections. It preserves the abstract as a single chunk and uses `title_frequency()` analysis for intelligent section boundary detection.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Research paper ingestion** | Upload academic PDFs for knowledge base search |
| **Literature review** | Index large collections of papers for AI-assisted review |
| **Citation analysis** | Extract structured sections for reference tracking |
| **Conference proceedings** | Process multi-paper PDFs with per-paper extraction |
| **Thesis documents** | Long academic documents with formal structure |

---

## 3. Supported Formats

| Format | Notes |
|--------|-------|
| PDF | **Only format supported** — academic papers are almost exclusively PDF |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  PdfParser with         │
              │  ParserType.PAPER model │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Extract layout boxes   │
              │  (text, tables, figures)│
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Title + Author         │
              │  Detection (first 32    │
              │  boxes, large font)     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Abstract Extraction    │
              │  (keyword: "abstract")  │
              │  → Preserve as single   │
              │    chunk (no splitting) │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Two-Column Detection   │
              │  (median column width)  │
              │  → Reorder if needed    │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Section Analysis       │
              │  title_frequency()      │
              │  → Detect heading       │
              │    levels & boundaries  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Section Merge          │
              │  Merge between pivot    │
              │  headings               │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  tokenize_chunks()      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Return: abstract chunk │
              │  + section chunks       │
              └────────────────────────┘
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

### 5.1 PDF Layout Recognition

The Paper Parser uses `PdfParser` with `ParserType.PAPER` to select a layout model optimized for academic paper layouts. This model is trained to recognize:
- Title blocks (large font, centered)
- Author/affiliation blocks
- Abstract sections
- Two-column body text
- Tables and figures with captions
- Reference/bibliography sections

### 5.2 Title and Author Detection

From the first 32 layout boxes on the first page:
1. **Title**: Identified by the largest font size among the initial boxes
2. **Authors**: Detected below the title, typically in a smaller font but larger than body text
3. These are extracted as metadata and used as title tokens for the first chunk

### 5.3 Abstract Extraction (Critical Business Rule)

**The abstract is ALWAYS preserved as a single chunk — it is never split.**

Detection process:
1. Scan text blocks for the keyword "Abstract" (case-insensitive)
2. Extract all text from the abstract start to the next section heading
3. Create a single chunk containing the full abstract text
4. This chunk is marked with the "abstract" title

**Rationale**: The abstract provides a complete summary of the paper. Splitting it would destroy its semantic coherence and reduce retrieval quality for "what is this paper about?" queries.

### 5.4 Two-Column Layout Detection

Academic papers commonly use two-column layouts:

1. **Detection**: Calculate the median width of text blocks. If the median is significantly less than page width (typically < 50% of page width), the document uses a two-column layout
2. **Reordering**: Text blocks are sorted by page first, then rearranged to read left-column-top-to-bottom, then right-column-top-to-bottom
3. **Merge**: Adjacent blocks in the same column are merged into paragraphs

### 5.5 Section Analysis via `title_frequency()`

After extracting all text blocks:

1. **Font analysis**: `title_frequency()` analyzes font sizes, styles (bold/italic), and text patterns across all blocks
2. **Heading detection**: Blocks with distinctive formatting (larger font, bold, numbered like "1.", "2.1") are identified as section headings
3. **Level assignment**: Headings are assigned hierarchical levels (H1 = major sections, H2 = subsections, etc.)
4. **Pivot points**: The detected headings become "pivot" boundaries for chunk merging

### 5.6 Section Merge Strategy

Chunks are created by merging content between section headings:

1. Each section heading starts a new chunk
2. Body text is accumulated until the next heading of the same or higher level
3. If a section exceeds `chunk_token_num`, it is split at paragraph boundaries
4. The section heading is preserved as the chunk's title

### 5.7 References Section

The references/bibliography section at the end of the paper:
- Typically detected by heading "References", "Bibliography", etc.
- Each reference entry can become a separate chunk
- Reference text is tokenized normally for search

---

## 6. Output Example

```python
# Abstract chunk (never split)
{
    "content_with_weight": "Abstract: We present a novel approach to document parsing that combines layout recognition with semantic analysis. Our method achieves 95% accuracy on the DocBank benchmark...",
    "content_ltks": ["abstract", "present", "novel", "approach", "document", "parsing"],
    "docnm_kwd": "paper-2024.pdf",
    "title_tks": ["abstract"],
    "page_num_int": [1]
}

# Section chunk
{
    "content_with_weight": "3. Methodology\nOur approach consists of three stages: layout detection, semantic grouping, and hierarchical chunking...",
    "content_ltks": ["methodology", "approach", "three", "stages", "layout", "detection"],
    "docnm_kwd": "paper-2024.pdf",
    "title_tks": ["methodology"],
    "page_num_int": [3, 4]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Paper | Naive | Book |
|--------|-------|-------|------|
| Format support | PDF only | Multi-format | PDF, DOCX, TXT, HTML |
| Abstract preservation | Yes (single chunk) | No | No |
| Two-column detection | Yes | No | No |
| Section detection | title_frequency() | bullets_category() | bullets_category() |
| Author extraction | Yes | No | No |
| Target content | Academic papers | General | Long-form books |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| No abstract found | Skips abstract chunk; proceeds with section chunks |
| Single-column layout | No reordering needed; processes as-is |
| No section headings | Falls back to naive_merge() strategy |
| Very short paper (1-2 pages) | May produce just abstract + one body chunk |
| Scanned/image PDF | Relies on OCR via layout engine |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/pdf_parser.py` | PDF layout recognition with PAPER model |
| `rag/nlp/` | title_frequency(), tokenize_chunks() |

---

## 10. Performance Notes

- Layout recognition with the PAPER model may be slightly slower than the general model due to specialized detection
- Two-column reordering adds minimal overhead
- Abstract detection is a simple string scan — negligible cost
- Section analysis via `title_frequency()` scales linearly with document length
