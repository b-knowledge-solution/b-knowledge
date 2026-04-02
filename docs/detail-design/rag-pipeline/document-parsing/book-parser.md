# Book Parser — Detail Design

> **Module**: `advance-rag/rag/app/book.py`
> **Parser Type**: `ParserType.BOOK`
> **Category**: Document Parsing
> **Role**: Optimized parser for long-form books and documents

---

## 1. Overview

The Book Parser is designed for processing long-form documents such as books, technical guides, and lengthy reports. It shares many similarities with the Naive Parser but includes additional optimizations for handling table-of-contents removal, bullet/heading detection, and colon-as-title heuristics that are common in book-style documents.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Technical books** | PDF or DOCX books with chapters and sections |
| **Long reports** | Multi-page reports with structured headings |
| **Training materials** | Course materials, guides, handbooks |
| **Reference manuals** | Product reference documents |
| **E-books** | EPUB or PDF format electronic books |

---

## 3. Supported Formats

| Format | Parser Used | Notes |
|--------|-------------|-------|
| PDF | Pluggable layout engine | Same engines as Naive parser |
| DOCX | `RAGFlowDocxParser` | Text + images + heading styles |
| DOC | `RAGFlowDocxParser` (via LibreOffice) | Converts to DOCX first |
| TXT | Direct text read | UTF-8 with fallback |
| HTML | `RAGFlowHtmlParser` | DOM extraction |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │   Format Detection      │
              │   Route by extension    │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                  ▼
    ┌─────────┐      ┌─────────┐       ┌─────────┐
    │  DOCX   │      │   PDF   │       │  TXT/   │
    │  Path   │      │  Path   │       │  HTML   │
    └────┬────┘      └────┬────┘       └────┬────┘
         │                │                  │
    ┌────▼────┐      ┌────▼────┐       ┌────▼────┐
    │ Extract │      │ Layout  │       │ Read    │
    │ text +  │      │ Engine  │       │ text    │
    │ images  │      │ Parse   │       │         │
    └────┬────┘      └────┬────┘       └────┬────┘
         │                │                  │
         └────────────────┼──────────────────┘
                          │
              ┌───────────▼───────────┐
              │  Remove TOC sections  │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Bullet Detection     │
              │  bullets_category()   │
              └───────────┬───────────┘
                          │
              ┌─────Yes───┴───No──────┐
              ▼                       ▼
    ┌──────────────────┐   ┌──────────────────┐
    │ hierarchical     │   │  naive_merge()   │
    │ _merge(depth=5)  │   │  with delimiters │
    └────────┬─────────┘   └────────┬─────────┘
             │                      │
             └──────────┬───────────┘
                        │
              ┌─────────▼──────────┐
              │ Colon-as-title     │
              │ heuristic          │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │ tokenize_chunks()  │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │ Return chunks      │
              └────────────────────┘
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

### 5.1 DOCX-Specific Processing

When processing DOCX files, the Book Parser:

1. **Extracts text and images** via `RAGFlowDocxParser`
2. **Removes table-of-contents** sections — detected by patterns like "Table of Contents", "目录", or sequences of dotted page references
3. **Handles vision figures** — images are extracted and can be described via CV LLM
4. **Detects heading levels** from DOCX paragraph styles

### 5.2 TOC Removal

Books commonly include a table of contents that would pollute search results. The parser identifies and removes TOC sections by detecting:
- Heading text matching TOC patterns ("Contents", "Table of Contents", "目录")
- Lines with page number references (e.g., "Chapter 1 .......... 15")
- Consecutive lines that are primarily dot-leaders or tab-leaders

### 5.3 Bullet Detection & Chunking

The same dual-strategy as Naive:

**Bullets detected** → `hierarchical_merge(depth=5)`:
- Preserves chapter → section → subsection hierarchy
- Merges leaf sections up to token limit
- Maintains parent heading context in each chunk

**No bullets** → `naive_merge()`:
- Token-limited merging with delimiter-based splitting
- Keeps paragraphs intact when possible

### 5.4 Colon-as-Title Heuristic

A unique post-processing step for book content:
- Lines ending with `:` (colon) followed by content are treated as title-body pairs
- The colon-terminated line becomes the chunk's title
- This captures patterns like "Key Concept: The explanation of the concept..."

### 5.5 Image and Table Context

After chunking, if configured:
- `table_context_size > 0`: Attaches tables from nearby pages to text chunks
- `image_context_size > 0`: Attaches images from nearby pages to text chunks

---

## 6. Output Example

```python
{
    "content_with_weight": "Chapter 3: Data Structures\nArrays are the most fundamental...",
    "content_ltks": ["chapter", "data", "structures", "arrays", "fundamental"],
    "content_sm_ltks": ["cha", "pte", "dat", ...],
    "docnm_kwd": "algorithms-textbook.pdf",
    "title_tks": ["chapter", "data", "structures"],
    "title_sm_tks": ["cha", "pte", "dat"],
    "image": None,
    "position_int": [(45, 72, 540, 80, 720)],
    "page_num_int": [45]
}
```

---

## 7. Differences from Naive Parser

| Aspect | Naive | Book |
|--------|-------|------|
| TOC removal | No | Yes — detects and removes table of contents |
| Colon-as-title | No | Yes — treats "X:" patterns as section titles |
| Hierarchical merge depth | Variable | Fixed at depth=5 |
| Target use case | General / mixed | Long-form structured documents |
| JSON/EPUB support | Yes | No |
| Excel/CSV support | Yes | No |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Corrupt DOCX | Falls back to text extraction via Tika |
| PDF layout failure | Falls back to PlainText engine |
| Empty document | Returns empty list |
| No headings detected | Uses naive_merge without hierarchy |
| Image extraction failure | Continues without images, logs warning |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/pdf_parser.py` | PDF layout recognition |
| `deepdoc/parser/docx_parser.py` | DOCX parsing |
| `deepdoc/parser/html_parser.py` | HTML parsing |
| `rag/nlp/` | Tokenization, merge strategies, bullet detection |
