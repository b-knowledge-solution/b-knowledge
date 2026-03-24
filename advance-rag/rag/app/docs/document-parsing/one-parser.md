# One Parser — Detail Design

> **Module**: `advance-rag/rag/app/one.py`
> **Parser Type**: `ParserType.ONE`
> **Category**: Document Parsing
> **Role**: Whole-document parser (no splitting)

---

## 1. Overview

The One Parser treats the **entire document as a single chunk**. It extracts all text from the document and produces exactly one output chunk containing the full content. This is the simplest parser in the pipeline and is used when the entire document should be indexed as a single semantic unit.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Short documents** | Brief memos, notices, or announcements that are self-contained |
| **Metadata documents** | Configuration files, manifests, or small reference docs |
| **Summary indexing** | When users want to retrieve whole documents, not fragments |
| **Chat context** | Documents used as full context in chat conversations |
| **Knowledge base descriptions** | Documents that describe a knowledge base topic holistically |

---

## 3. Supported Formats

| Format | Parser Used | Notes |
|--------|-------------|-------|
| DOCX | `RAGFlowDocxParser` | Full text extraction |
| PDF | Pluggable layout engine | All text concatenated |
| Excel | `RAGFlowExcelParser` | All cells as text |
| TXT | Direct text read | Full content |
| Markdown | `RAGFlowMarkdownParser` | Full content |
| HTML | `RAGFlowHtmlParser` | Full content |
| DOC | `RAGFlowDocxParser` (via LibreOffice) | Full content |

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
              │  Extract ALL text       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Sort by page +         │
              │  position (preserve     │
              │  reading order)         │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Concatenate ALL text   │
              │  into SINGLE chunk      │
              │  (no splitting)         │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Return [one_chunk]     │
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

### 5.1 Core Principle: No Splitting

The One Parser **never splits** content:

- All extracted text blocks are sorted in reading order (page → vertical position → horizontal position)
- All text is concatenated with newlines
- The result is returned as a single-element list `[chunk_dict]`

### 5.2 Text Ordering

Preserves original document reading order:
1. Sort by page number (ascending)
2. Within same page, sort by vertical position (top to bottom)
3. Within same vertical position, sort by horizontal position (left to right)

### 5.3 Format-Specific Extraction

Each format uses its standard deepdoc parser for text extraction — the only difference from other parsers is that **no chunking step** is applied afterward.

### 5.4 Token Limit Considerations

**Warning**: This parser ignores `chunk_token_num`. The output chunk may contain thousands of tokens for large documents. This is by design, but users should be aware that:
- Very large chunks may exceed embedding model token limits
- Search precision is lower with larger chunks (the whole document matches or doesn't)
- LLM context windows may be consumed by a single chunk

---

## 6. Output Example

```python
[
    {
        "content_with_weight": "Full document content from page 1 through page N...\n\nAll sections, all text, all tables converted to text...",
        "content_ltks": ["full", "document", "content", ...],
        "content_sm_ltks": ["ful", "doc", "con", ...],
        "docnm_kwd": "company-policy.pdf",
        "title_tks": [],
        "image": None,
        "position_int": [(1, 72, 540, 80, 720), (2, 72, 540, 80, 720), ...],
        "page_num_int": [1, 2, 3, ..., N]
    }
]
```

---

## 7. Differences from Other Parsers

| Aspect | One | Naive | Presentation |
|--------|-----|-------|-------------|
| Output chunk count | Always 1 | Many | 1 per slide |
| Splitting | Never | Token-limited | Never (per slide) |
| Token limit | Ignored | Respected | N/A |
| Use case | Whole-document | Granular search | Slide-level search |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Empty document | Returns empty list |
| Very large document | Returns single large chunk (no limit) |
| Unsupported format | Returns empty list |
| Extraction failure | Logs error, returns empty list |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/*` | Format-specific text extraction |
| `rag/nlp/rag_tokenizer.py` | Token generation for the single chunk |
