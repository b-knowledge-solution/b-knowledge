# Presentation Parser — Detail Design

> **Module**: `advance-rag/rag/app/presentation.py`
> **Parser Type**: `ParserType.PRESENTATION`
> **Category**: Document Parsing
> **Role**: Parser for slide decks (PPT/PPTX) and PDF presentations

---

## 1. Overview

The Presentation Parser treats each slide as an independent chunk — it never splits content within a single slide. This design reflects the nature of presentations where each slide is a self-contained unit of information. The parser handles both PowerPoint files (PPTX/PPT) and PDF presentations, extracting slide text, tables, and storing page images as thumbnails.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Slide deck indexing** | Index corporate presentations for knowledge search |
| **Training materials** | Course slides uploaded to knowledge base |
| **Meeting decks** | Project updates, status reports in PPT format |
| **Conference talks** | Exported presentation slides |
| **PDF slide decks** | Presentations exported as PDF |

---

## 3. Supported Formats

| Format | Parser Used | Notes |
|--------|-------------|-------|
| PPTX | `RAGFlowPptParser` (python-pptx) | Primary format |
| PPT | `RAGFlowPptParser` → Tika fallback | Legacy format |
| PDF | Custom `Pdf` class (page-by-page) | PDF slide decks |

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
              │  (PPTX/PPT vs PDF)      │
              └────┬──────────────┬─────┘
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │   PPTX/PPT Path      │  │   PDF Path        │
    └──────────────┬────────┘  └─┬────────────────┘
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │ RAGFlowPptParser      │  │ Page-by-page      │
    │ extract slide text    │  │ layout parse      │
    │ (python-pptx)         │  │ reassemble text   │
    │                       │  │ + tables/figures  │
    │ Fallback: Tika JAR    │  │                   │
    └──────────────┬────────┘  └─┬────────────────┘
                   │              │
                   │           ┌──▼────────────────┐
                   │           │ Store page image  │
                   │           │ as thumbnail      │
                   │           └──┬────────────────┘
                   │              │
                   └──────┬───────┘
                          │
              ┌───────────▼───────────┐
              │  ONE SLIDE = ONE CHUNK│
              │  (no splitting)       │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  tokenize_chunks()    │
              │  + page_num_int       │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Return chunk list    │
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

### 5.1 Core Principle: One Slide = One Chunk

**Each slide/page produces exactly one chunk.** This is a fundamental design decision:

- **Rationale**: Slides are designed as atomic units of information. Splitting a slide would break visual/logical coherence. Merging slides would combine unrelated topics.
- **Implementation**: After extracting text from each slide, no merge or split operation is applied
- **Page number tracking**: Each chunk stores its absolute page number in `page_num_int`

### 5.2 PPTX/PPT Processing

**Primary path (python-pptx)**:
1. `RAGFlowPptParser` opens the PPTX file
2. Iterates through slides, extracting text from:
   - Title placeholders
   - Body text placeholders
   - Text boxes
   - Table cells
   - Notes (optional)
3. Each slide's combined text becomes one chunk

**Fallback path (Tika)**:
- If python-pptx fails (corrupt file, unsupported features), falls back to Apache Tika
- Tika extracts plain text from the slide deck
- Text is split by slide boundaries (detected via page break markers)

### 5.3 PDF Presentation Processing

For PDF slide decks:

1. **Page-by-page parsing**: Uses a custom `Pdf` class (not the standard PdfParser)
2. **Content reassembly**: For each page:
   - Extract text blocks
   - Extract tables (as structured data)
   - Extract figures/images
   - Reassemble in reading order (top-to-bottom, left-to-right)
3. **Thumbnail storage**: Each page is rendered as an image and stored as the chunk's `image` field
4. **Position metadata**: Text positions on the page are recorded for frontend highlighting

### 5.4 Page Numbering

Absolute page numbers are tracked:

```python
chunk["page_num_int"] = [page_number]  # 0-indexed
```

This enables:
- Frontend page navigation
- "Go to slide" functionality
- Page-range filtering in search results

### 5.5 Table Handling in Slides

Tables within slides are converted to text:
- Each row is formatted as "| cell1 | cell2 | cell3 |"
- The text representation is included in the chunk's content
- This ensures table content is searchable

---

## 6. Output Example

```python
{
    "content_with_weight": "Q3 2024 Revenue Update\n\n• Total revenue: $12.5M (+15% YoY)\n• Key growth areas: Cloud services, Enterprise\n• Churn rate: 2.1% (down from 3.4%)\n\n| Region | Revenue | Growth |\n| APAC | $4.2M | +22% |\n| EMEA | $3.8M | +12% |",
    "content_ltks": ["revenue", "update", "total", "growth", "cloud", "enterprise"],
    "content_sm_ltks": ["rev", "upd", "tot", ...],
    "docnm_kwd": "q3-2024-update.pptx",
    "title_tks": ["revenue", "update"],
    "image": "<PIL.Image of slide>",
    "page_num_int": [5],
    "position_int": [(5, 0, 720, 0, 540)]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Presentation | Naive | Paper |
|--------|-------------|-------|-------|
| Chunking strategy | 1 slide = 1 chunk | Token-limited merge | Section-based |
| Splitting | Never | Yes (at token limit) | Yes (at section boundary) |
| Merging | Never | Yes (adjacent paragraphs) | Yes (within sections) |
| Page images | Yes (thumbnails) | No | No |
| Table handling | Inline text | Structured extraction | Structured extraction |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Corrupt PPTX | Falls back to Tika extraction |
| Tika unavailable | Returns empty chunk list, logs error |
| Slides with only images | Chunk with empty text + image thumbnail |
| Very large slide deck | Processes all slides; no limit on slide count |
| Password-protected PPT | Returns error via callback |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/ppt_parser.py` | PPTX/PPT text extraction |
| `python-pptx` | Primary PPTX parsing library |
| `tika` | Fallback PPT parser (requires JRE) |
| `rag/nlp/` | tokenize_chunks() |
