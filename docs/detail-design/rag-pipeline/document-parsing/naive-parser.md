# Naive Parser — Detail Design

> **Module**: `advance-rag/rag/app/naive.py`
> **Parser Type**: `ParserType.NAIVE` / `general`
> **Category**: Document Parsing
> **Role**: Default multi-format parser; widest file format support

---

## 1. Overview

The Naive Parser is the **default and most versatile** parser in the RAG pipeline. It handles the widest range of document formats and serves as the fallback when no specialized parser is configured. It combines multiple PDF layout engines, format-specific deepdoc parsers, and configurable text chunking strategies to produce high-quality searchable chunks.

When a user uploads a document without selecting a specific parser type, or when the `general` type is chosen, this parser is invoked.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **General document upload** | User uploads any supported file without specifying a parser type |
| **Multi-format knowledge base** | Knowledge base containing mixed document types (PDF, DOCX, TXT, etc.) |
| **Markdown/HTML ingestion** | Technical documentation, wiki pages, blog posts |
| **Spreadsheet ingestion** | Excel/CSV files processed as text (not structured table mode) |
| **JSON/EPUB ingestion** | Structured data or e-book files |
| **Knowledge Graph mode** | `ParserType.KG` delegates to naive for initial parsing |

---

## 3. Supported Formats

| Format | Parser Used | Notes |
|--------|-------------|-------|
| PDF | Pluggable layout engine (DeepDOC, MinerU, Docling, PaddleOCR, PlainText, TCADP) | Most complex path |
| DOCX | `RAGFlowDocxParser` | Extracts text + images + styles |
| DOC | `RAGFlowDocxParser` (via LibreOffice conversion) | Converts to DOCX first |
| TXT | Direct text read | UTF-8 with encoding fallback |
| Markdown | `RAGFlowMarkdownParser` | Preserves heading structure |
| HTML | `RAGFlowHtmlParser` | DOM extraction and cleaning |
| Excel (XLSX/XLS/CSV) | `RAGFlowExcelParser` | Text extraction (not structured) |
| JSON | `RAGFlowJsonParser` or `json_to_plain_text()` | Flattened text representation |
| EPUB | `RAGFlowEpubParser` | E-book text extraction |

---

## 4. Design

### 4.1 Architecture Diagram

```
                        ┌─────────────────┐
                        │   chunk()       │
                        │   Entry Point   │
                        └────────┬────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Detect file extension  │
                    │  Route to format handler│
                    └────────────┬────────────┘
                                 │
         ┌───────────┬───────────┼───────────┬───────────┐
         ▼           ▼           ▼           ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │  PDF    │ │  DOCX   │ │  TXT/MD │ │  Excel  │ │  Other  │
    │  Engine │ │  Parser │ │  Parser │ │  Parser │ │  Parser │
    └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
         │           │           │           │           │
         └───────────┴───────────┼───────────┴───────────┘
                                 │
                    ┌────────────▼────────────┐
                    │  Bullet Detection       │
                    │  bullets_category()     │
                    └────────────┬────────────┘
                                 │
                    ┌────────Yes─┴──No────────┐
                    ▼                         ▼
           ┌────────────────┐       ┌────────────────┐
           │ hierarchical   │       │  naive_merge() │
           │ _merge()       │       │  with delimiters│
           └────────┬───────┘       └────────┬───────┘
                    │                         │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼───────────┐
                    │  tokenize_chunks()    │
                    │  Add positions/images │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │  Return chunk list    │
                    └──────────────────────┘
```

### 4.2 Function Signature

```python
def chunk(
    filename: str,           # Original filename (used for format detection)
    binary: bytes,           # Raw file content
    from_page: int = 0,      # Start page (PDF only)
    to_page: int = 100000,   # End page (PDF only)
    lang: str = "English",   # Document language
    callback=None,           # Progress callback (float 0.0-1.0)
    **kwargs                 # parser_config passed as kwargs
) -> list[dict]:
```

### 4.3 Key Configuration Parameters (via `kwargs`)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Maximum tokens per chunk |
| `delimiter` | str | `"\n!?。；！？"` | Sentence boundary characters |
| `layout_recognize` | str | `"DeepDOC"` | PDF layout engine selection |
| `table_context_size` | int | 0 | Tables to attach to surrounding chunks |
| `image_context_size` | int | 0 | Images to attach to surrounding chunks |
| `html4excel` | bool | False | Use HTML rendering for Excel |
| `raptor` | dict | `{}` | RAPTOR hierarchical clustering config |
| `graphrag` | dict | `{}` | GraphRAG entity extraction config |

---

## 5. Business Logic

### 5.1 Format Detection & Routing

The parser determines the processing path based on the file extension extracted from `filename`:

```
filename.lower().endswith(ext) → route to handler
```

Priority order:
1. `.pdf` → PDF engine pipeline
2. `.docx` → DOCX parser
3. `.doc` → Convert to DOCX via LibreOffice, then DOCX parser
4. `.xlsx`, `.xls`, `.csv` → Excel parser
5. `.txt` → Direct text read with encoding detection
6. `.md` → Markdown parser
7. `.html`, `.htm` → HTML parser
8. `.json` → JSON parser
9. `.epub` → EPUB parser

### 5.2 PDF Parsing Pipeline

PDF parsing is the most complex path with 6 pluggable layout engines:

| Engine Function | Layout Engine | Key Behavior |
|----------------|---------------|--------------|
| `by_deepdoc()` | DeepDOC | Built-in OCR + layout model; extracts tables/figures as structured data |
| `by_mineru()` | MinerU | Vision Language Model; higher accuracy for complex layouts |
| `by_docling()` | Docling | Advanced document understanding; best for academic/technical |
| `by_paddleocr()` | PaddleOCR | PaddleOCR with layout analysis; good for Chinese documents |
| `by_plaintext()` | PlainText | Simple text extraction via pdfplumber; fastest but no layout |
| `by_tcadp()` | TCADP | Tencent Cloud Document Processing; cloud-based |

**Selection**: The `layout_recognize` config parameter determines which engine is used.

**Common PDF post-processing**:
1. Extract text blocks with position data (page, x, y, width, height)
2. Detect and extract tables as structured data
3. Detect and extract figures/images
4. Sort blocks in reading order (top-to-bottom, left-to-right)
5. Merge adjacent text blocks belonging to the same paragraph

### 5.3 Bullet Detection & Chunking Strategy

After text extraction, the parser analyzes the content structure:

```python
# Detect if content uses bullet/numbering patterns
bullet_type = bullets_category(text_sections)
```

**If bullets detected** → `hierarchical_merge()`:
- Respects the hierarchy of numbered/bulleted lists
- Merges nested items under their parent heading
- Depth parameter controls merge level (default: 5)
- Preserves list structure in output chunks

**If no bullets** → `naive_merge()`:
- Splits text on configured delimiters (newlines, punctuation)
- Merges adjacent lines until `chunk_token_num` is reached
- Respects sentence boundaries where possible
- Falls back to hard split at token limit

### 5.4 Embedded File Handling

The naive parser can detect and process embedded files within documents:
- PDF attachments within PDF files
- Images embedded in DOCX/HTML
- Linked files referenced in markdown

### 5.5 Post-Processing

After chunking:

1. **tokenize_chunks()**: Tokenizes each chunk's text for search indexing
   - `content_ltks`: Word-level tokens
   - `content_sm_ltks`: Character-level tokens for fuzzy matching
2. **add_positions()**: Embeds page/position metadata in chunk text
3. **attach_media_context()**: If configured, attaches nearby tables/images to text chunks

### 5.6 RAPTOR & GraphRAG Integration

If `raptor` or `graphrag` config is provided:
- **RAPTOR**: After initial chunking, applies hierarchical clustering to create summary chunks at multiple abstraction levels
- **GraphRAG**: Extracts entities and relationships from chunks for graph-based retrieval

---

## 6. Output Example

```python
{
    "content_with_weight": "The system architecture consists of three main components...",
    "content_ltks": ["system", "architecture", "consists", "three", "main", "components"],
    "content_sm_ltks": ["sys", "tem", "arc", "hit", "ect", ...],
    "docnm_kwd": "architecture-overview.pdf",
    "title_tks": ["system", "architecture"],
    "title_sm_tks": ["sys", "tem", "arc"],
    "image": None,
    "position_int": [(1, 72, 540, 100, 350)],
    "page_num_int": [1]
}
```

---

## 7. Error Handling

| Scenario | Behavior |
|----------|----------|
| Unsupported file extension | Returns empty chunk list |
| PDF layout engine failure | Falls back to PlainText extraction |
| Encoding detection failure | Tries UTF-8 → GB2312 → GBK → Latin1 |
| Empty document | Returns empty chunk list |
| Image extraction failure | Logs warning, continues without images |
| Tika unavailable | Skips Tika-dependent formats |

---

## 8. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/pdf_parser.py` | PDF layout + OCR extraction |
| `deepdoc/parser/docx_parser.py` | DOCX text + image extraction |
| `deepdoc/parser/excel_parser.py` | Excel/CSV parsing |
| `deepdoc/parser/html_parser.py` | HTML DOM extraction |
| `deepdoc/parser/markdown_parser.py` | Markdown parsing |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |
| `rag/nlp/search.py` | Merge utilities (naive_merge, hierarchical_merge) |

---

## 9. Performance Considerations

- **PDF parsing** is the most resource-intensive path; DeepDOC uses ONNX models for layout recognition
- **MinerU/Docling** engines are more accurate but significantly slower
- **PlainText** engine is fastest but loses all layout/table/figure information
- **chunk_token_num** directly affects chunk count and search granularity: smaller = more chunks = finer search but higher storage
- **Concurrent parsing** is managed by task_executor semaphores, not within the parser
