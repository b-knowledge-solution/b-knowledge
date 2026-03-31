# Document Parsers Reference

> Comprehensive reference for all 20 parsers in `advance-rag/rag/app/`. Each parser implements a specific chunking strategy optimized for a document type.

## Parser Overview

| # | Parser | File | Formats | Use Case |
|---|--------|------|---------|----------|
| 1 | [Naive](#1-naive) | `naive.py` | PDF, DOCX, DOC, TXT, MD, HTML, XLSX, CSV, JSON | General-purpose default parser |
| 2 | [Code](#2-code) | `code.py` | 20+ programming languages | Source code with AST awareness (dedicated, internal only) |
| 3 | [Paper](#3-paper) | `paper.py` | PDF | Academic papers (two-column layout) |
| 4 | [Book](#4-book) | `book.py` | DOCX, PDF, TXT, HTML, DOC | Long-form books and documents |
| 5 | [One](#5-one) | `one.py` | DOCX, PDF, XLSX, TXT, MD, HTML, DOC | Entire document as single chunk |
| 6 | [Presentation](#6-presentation) | `presentation.py` | PPT, PPTX, PDF | Slide decks (one chunk per slide) |
| 7 | [Table](#7-table) | `table.py` | XLSX, CSV, TXT | Spreadsheets (one chunk per row) |
| 8 | [Q&A](#8-qa) | `qa.py` | XLSX, CSV, TXT, PDF, MD, DOCX | Question-answer pair extraction |
| 9 | [Manual](#9-manual) | `manual.py` | PDF, DOCX | Technical manuals and documentation |
| 10 | [Picture](#10-picture) | `picture.py` | JPEG, PNG, GIF, MP4, MOV, etc. | Images and videos |
| 11 | [Audio](#11-audio) | `audio.py` | WAV, MP3, AAC, FLAC, OGG, etc. | Speech-to-text transcription |
| 12 | [Email](#12-email) | `email.py` | EML | Email messages with attachments |
| 13 | [OpenAPI](#13-openapi) | `openapi.py` | JSON, YAML | API specifications (OpenAPI/Swagger) |
| 14 | [ADR](#14-adr) | `adr.py` | MD | Architecture Decision Records |
| 15 | [Clinical](#15-clinical) | `clinical.py` | PDF, DOCX, TXT | Clinical/medical documents |
| 16 | [Laws](#16-laws) | `laws.py` | PDF, DOCX, TXT, HTML, DOC | Legal documents and regulations |
| 17 | [Tag](#17-tag) | `tag.py` | XLSX, CSV, TXT | Content-tag pair extraction |
| 18 | [Resume](#18-resume) | `resume.py` | PDF, DOCX | CV/resume structured extraction |
| 19 | [SDLC Checklist](#19-sdlc-checklist) | `sdlc_checklist.py` | MD, XLSX, CSV, TXT, PDF, DOCX | SDLC phase checklists with completion tracking |

---

## Parser Details

### 1. Naive

**File:** `naive.py` (~46KB) — General-purpose default parser

**Description:**
The default parser that handles the widest range of document formats. Uses a naive merge text chunking strategy — it splits documents by configurable delimiters and merges adjacent chunks until they reach the target token count. Supports multiple PDF layout recognition backends.

**Supported Formats:** `.pdf`, `.docx`, `.doc`, `.txt`, `.md`, `.markdown`, `.mdx`, `.html`, `.htm`, `.xlsx`, `.csv`, `.json`

**Parsing Logic:**
- Splits text using configurable delimiters (sentence boundaries, newlines, punctuation)
- Merges adjacent small chunks until reaching target token count
- For PDFs: selects a layout recognition backend (DeepDOC, MinerU, Docling, TCADP, PaddleOCR, Plain Text, Vision LLM)
- Extracts embedded files from containers (ZIP-based formats) and parses them recursively
- Extracts and resolves hyperlinks from DOCX and PDF
- Normalizes Arabic presentation forms (RTL text support)
- Handles Markdown tables, DOCX images, and HTML content

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Target tokens per chunk |
| `delimiter` | str | `\n!?。；！？` | Characters used to split text into sentences |
| `layout_recognize` | str | `DeepDOC` | PDF backend: DeepDOC / MinerU / Docling / TCADP / PaddleOCR / PlainText / Vision |
| `children_delimiter` | str | _(empty)_ | Custom sub-delimiters for nested splitting within chunks |
| `table_context_size` | int | 0 | Number of surrounding text lines to include with extracted tables |
| `image_context_size` | int | 0 | Number of surrounding text lines to include with extracted images |
| `analyze_hyperlink` | bool | true | Whether to extract and parse hyperlinks from DOCX/PDF |
| `html4excel` | bool | false | Render Excel as HTML tables instead of row-based text |

**Output Chunk Fields:**
- `content_with_weight`: Original text content of the chunk
- `content_ltks`: Tokenized content (for search indexing)
- `content_sm_ltks`: Fine-grained tokenized content
- `docnm_kwd`: Source document filename
- `title_tks`: Tokenized document name

**Use Cases:**
- **Default document ingestion** — when no specialized parser fits the document type
- **Mixed-format knowledge bases** — ingesting a variety of file types with consistent chunking
- **OCR-heavy PDFs** — scanned documents where layout recognition is critical
- **HTML/web content** — parsing saved web pages or HTML exports
- **JSON data files** — ingesting structured data as searchable text

---

### 2. Code

**File:** `code.py` (~29KB) — Source code parser with AST awareness (Dedicated — not user-selectable in dataset options)

**Description:**
Dedicated internal parser for project source code analysis. Not available in the dataset parser dropdown — used programmatically only. Parses source code files using tree-sitter for precise function and class boundary detection. Each function/method becomes a chunk with rich metadata (name, parameters, return type, decorators, docstrings). Large functions are split at inner block boundaries.

**Supported Languages & Extensions:**
`.py`, `.js`, `.ts`, `.tsx`, `.jsx`, `.java`, `.go`, `.rs`, `.rb`, `.cpp`, `.c`, `.cs`, `.php`, `.swift`, `.kt`, `.scala`, `.lua`, `.sh`, `.bash`, `.zsh`, `.r`, `.dart`, `.vue`, `.svelte`

**Parsing Logic:**
- Uses tree-sitter AST parsing to identify function/class boundaries precisely
- Extracts function metadata: name, parameters, return type, decorators, docstrings
- Splits large functions at inner block boundaries (if/for/while/try statements)
- File-level imports stored as metadata on the first chunk
- Module-level code (outside functions/classes) extracted as separate chunks
- Falls back to naive line-based chunking for unsupported file extensions

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Maximum tokens per function chunk (large functions get split) |

**Output Chunk Metadata:**
- `function_name`: Name of the function/method
- `class_name`: Enclosing class name (if applicable)
- `parameters`: Function parameter list
- `return_type`: Return type annotation
- `decorators`: Applied decorators/annotations
- `tag_kwd`: `["code", "<language_name>"]`
- `imports`: File-level import statements (first chunk only)

**Use Cases:**
- **Code search and retrieval** — find functions by name, parameters, or docstring content
- **Developer knowledge bases** — indexing internal codebases for AI-assisted development
- **Code review preparation** — retrieving relevant function implementations
- **API discovery** — finding function signatures across a codebase
- **Multi-language repositories** — consistent parsing across 20+ languages

---

### 3. Paper

**File:** `paper.py` (~13KB) — Academic paper parser

**Description:**
Specialized for parsing academic papers, particularly two-column PDF layouts common in conference and journal publications. Extracts structured metadata (title, authors, abstract) and chunks by section.

**Supported Formats:** `.pdf`

**Parsing Logic:**
- Detects and sorts two-column text blocks into reading order
- Performs title frequency analysis to identify section headings
- Extracts structured metadata: title, authors, abstract
- Preserves the abstract as a single dedicated chunk
- Merges body text based on detected title hierarchy (sections → subsections)
- Uses configurable PDF layout backend for text extraction

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `layout_recognize` | str | `DeepDOC` | PDF layout engine selection |

**Output Chunk Metadata:**
- `authors_tks`: Tokenized author names
- `title_tks`: Tokenized paper title
- `important_kwd`: Set on abstract chunk for priority retrieval

**Use Cases:**
- **Academic research knowledge bases** — indexing papers from arXiv, PubMed, IEEE, etc.
- **Literature review systems** — searching across paper collections by topic, author, or abstract
- **Research assistants** — retrieving relevant sections from academic publications
- **Citation management** — building searchable paper repositories with author/title metadata

---

### 4. Book

**File:** `book.py` (~8KB) — Long-form book parser

**Description:**
Optimized for parsing books and lengthy documents. Automatically removes table-of-contents sections, uses bullet pattern detection for hierarchical merging, and supports configurable page ranges for PDFs.

**Supported Formats:** `.docx`, `.pdf`, `.txt`, `.html`, `.doc`

**Parsing Logic:**
- For PDFs: handles long books with configurable page ranges
- Automatically detects and removes table of contents
- Uses bullet pattern detection for hierarchical merging (numbered lists, outlines)
- Supports cross-reference context attachment
- Merges text into chunks respecting chapter/section boundaries

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Target tokens per chunk |
| `delimiter` | str | `\n!?。；！？` | Sentence boundary delimiters |
| `layout_recognize` | str | `DeepDOC` | PDF layout engine |
| `table_context_size` | int | 0 | Context lines around tables |
| `image_context_size` | int | 0 | Context lines around images |

**Use Cases:**
- **Digital library ingestion** — indexing ebooks, textbooks, and reference manuals
- **Training material knowledge bases** — chunking educational books for retrieval
- **Long report analysis** — parsing annual reports, whitepapers, or government documents
- **Novel/literary analysis** — indexing fiction with chapter-aware chunking

---

### 5. One

**File:** `one.py` (~7KB) — Single-chunk parser

**Description:**
Treats the entire document as a single atomic chunk with no splitting. Useful when the full document context must be preserved as one unit.

**Supported Formats:** `.docx`, `.pdf`, `.xlsx`, `.txt`, `.md`, `.markdown`, `.mdx`, `.html`, `.doc`

**Parsing Logic:**
- Concatenates all extracted content vertically into one chunk
- Still performs OCR, layout analysis, and table extraction for PDFs
- Preserves original text order
- No token limit enforcement (entire document = one chunk)

**Use Cases:**
- **Short documents** — memos, single-page policies, brief announcements
- **Atomic retrieval** — when partial chunks would lose critical context (e.g., contracts, certificates)
- **Summary documents** — executive summaries or abstracts that must be returned whole
- **Template documents** — forms, checklists, or templates where structure matters

---

### 6. Presentation

**File:** `presentation.py` (~10KB) — Slide deck parser

**Description:**
Parses slide presentations with each slide/page becoming a separate chunk paired with its thumbnail image. Optimized for visual content where slide context matters.

**Supported Formats:** `.ppt`, `.pptx`, `.pdf`

**Parsing Logic:**
- Each slide = one chunk with associated thumbnail image
- For PPTX: uses RAGFlowPptParser, falls back to Tika
- For PDF: page-by-page reassembly in reading order with layout detection
- Tables and figures placed on their respective page/slide
- Generates slide thumbnails for visual preview

**Output Chunk Metadata:**
- `page_num_int`: Slide/page number
- `top_int`: Vertical position
- `position_int`: Sequential position
- `image`: Slide thumbnail (PIL Image)
- `doc_type_kwd`: `"image"`

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `layout_recognize` | str | `DeepDOC` | PDF backend selection |

**Use Cases:**
- **Meeting material search** — finding specific slides across presentation libraries
- **Training deck indexing** — making slide content searchable by text and visuals
- **Conference presentation archives** — indexing talk slides with speaker notes
- **Visual knowledge bases** — when slide thumbnails aid retrieval relevance

---

### 7. Table

**File:** `table.py` (~22KB) — Spreadsheet parser

**Description:**
Specialized for structured tabular data where each row becomes a separate chunk. Handles complex headers (merged cells, multi-level), detects column data types, and creates typed metadata fields per column.

**Supported Formats:** `.xlsx`, `.csv`, `.txt` (tab-delimited)

**Parsing Logic:**
- Each row becomes a separate chunk
- Complex header detection: merged cells, multi-level headers
- Column data type detection: int, float, text, datetime, bool
- Handles sparse data and inherited values from merged cells
- Extracts images embedded in spreadsheet cells
- Supports Pinyin conversion for Chinese column headers

**Output Chunk Metadata:**
- `field_map`: Dynamic field-to-display-name mapping
- `chunk_data`: JSON object with all columns (for Infinity/OceanBase backends)
- Column-specific fields with type suffixes: `_tks` (text), `_long` (integer), `_kwd` (keyword), `_flt` (float), `_dt` (datetime)

**Backend-Specific Behavior:**
- **Elasticsearch/OpenSearch**: Column values stored as typed fields
- **Infinity**: Data stored as JSON in `chunk_data`
- **OceanBase**: Data stored as JSON in `chunk_data`

**Use Cases:**
- **Structured data search** — product catalogs, inventories, price lists
- **Financial data** — spreadsheets with numeric columns for filtering (revenue > X)
- **HR data** — employee directories, org charts in spreadsheet format
- **Scientific data tables** — experimental results, measurement logs
- **CRM exports** — customer lists with typed fields for faceted search

---

### 8. Q&A

**File:** `qa.py` (~21KB) — Question-answer pair parser

**Description:**
Extracts question-answer pairs from various document formats. For spreadsheets, column 1 = question and column 2 = answer. For PDFs and documents, uses bullet/heading detection to identify Q&A boundaries.

**Supported Formats:** `.xlsx`, `.csv`, `.txt`, `.pdf`, `.md`, `.markdown`, `.mdx`, `.docx`

**Parsing Logic:**
- **Excel/CSV/TXT**: First column = question, second column = answer
- **PDF**: Bullet pattern detection identifies question boundaries
- **Markdown**: Heading levels separate questions from answers
- **DOCX**: Heading styles indicate question levels
- Output format: `"Question: Q\tAnswer: A"`

**Output Chunk Metadata:**
- `content_with_weight`: Combined Q&A text in `"Question: Q\tAnswer: A"` format
- `content_ltks`: Tokenized question text (question is the search target)
- `image`: Extracted figures from PDF/DOCX (if present)
- `top_int`: Row/position number

**Use Cases:**
- **FAQ knowledge bases** — importing existing FAQ documents for retrieval
- **Customer support bots** — indexing Q&A pairs from support documentation
- **Interview preparation** — technical interview question banks
- **Educational Q&A** — exam questions, study guides, flashcard content
- **Compliance Q&A** — regulatory FAQs and policy clarifications

---

### 9. Manual

**File:** `manual.py` (~13KB) — Technical manual parser

**Description:**
Designed for technical manuals and documentation with section-based chunking. Uses title frequency analysis to detect heading patterns and merges sections based on heading hierarchy.

**Supported Formats:** `.pdf`, `.docx`

**Parsing Logic:**
- Section-based chunking driven by title frequency analysis
- DOCX: heading-based hierarchical parsing (Heading 1 → 2 → 3)
- PDF: uses MANUAL parser type for layout model selection
- Merges sections based on heading hierarchy depth
- Attaches table context to surrounding text chunks
- Section IDs track logical groupings for retrieval

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Target tokens per chunk |
| `delimiter` | str | `\n!?。；！？` | Sentence boundary delimiters |
| `table_context_size` | int | 0 | Context lines around tables |
| `image_context_size` | int | 0 | Context lines around images |

**Use Cases:**
- **Product documentation** — user guides, installation manuals, API docs
- **Internal wikis** — company knowledge base articles with clear section structure
- **Standard operating procedures** — SOPs with numbered sections
- **Technical specifications** — engineering specs with hierarchical headings
- **Troubleshooting guides** — step-by-step guides with section navigation

---

### 10. Picture

**File:** `picture.py` (~6KB) — Image and video parser

**Description:**
Handles images via OCR text extraction with Vision LLM fallback for description, and videos via Vision LLM transcription. Each media file becomes a single chunk.

**Supported Formats:**
- **Images:** `.jpeg`, `.jpg`, `.png`, `.gif`, and other common image formats
- **Videos:** `.mp4`, `.mov`, `.avi`, `.flv`, `.mpeg`, `.mpg`, `.webm`, `.wmv`, `.3gp`, `.3gpp`, `.mkv`

**Parsing Logic:**
- **Images**: OCR text extraction first → if result is too short, falls back to Vision LLM for image description
- **Videos**: Vision LLM generates text description (uses Gemini MIME types)
- Single chunk output per media file

**Output Chunk Metadata:**
- `image`: PIL Image object (for images)
- `doc_type_kwd`: `"image"` or `"video"`

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `image_context_size` | int | 0 | Context for image descriptions |
| `video_prompt` | str | _(empty)_ | Custom prompt for video LLM description |

**Use Cases:**
- **Image search** — finding images by OCR text or AI-generated descriptions
- **Video library indexing** — making video content searchable via transcribed descriptions
- **Photo documentation** — indexing photos of whiteboards, receipts, signage
- **Visual asset management** — searching across design assets, screenshots, diagrams

---

### 11. Audio

**File:** `audio.py` (~4KB) — Audio transcription parser

**Description:**
Transcribes audio files to text using Speech-to-Text LLM, producing a single chunk with the full transcription.

**Supported Formats:** `.wav`, `.wave`, `.mp3`, `.aac`, `.flac`, `.ogg`, `.aiff`, `.au`, `.midi`, `.wma`, `.realaudio`, `.vqf`, `.oggvorbis`, `.ape`

**Parsing Logic:**
- Full audio file sent to Speech2Text LLM for transcription
- Language-aware transcription
- Single chunk output with full transcribed text
- Graceful fallback on transcription failure

**Use Cases:**
- **Meeting recordings** — transcribing and indexing meeting audio
- **Podcast indexing** — making podcast episodes searchable by content
- **Voice memos** — converting voice notes into searchable text
- **Call center recordings** — indexing customer service call transcriptions
- **Lecture recordings** — making educational audio content searchable

---

### 12. Email

**File:** `email.py` (~5KB) — Email message parser

**Description:**
Parses EML email files, extracting headers, body content (plain text + HTML), and recursively parsing attachments using the naive chunker.

**Supported Formats:** `.eml`

**Parsing Logic:**
- Extracts email headers (From, To, Subject, Date) as text
- Combines plain text and HTML body content
- Handles multipart MIME messages
- Recursively parses attachments using the naive chunker
- Auto-detects character encoding (UTF-8, GB2312, GBK, GB18030, Latin1)

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Target tokens per chunk |
| `delimiter` | str | `\n!?。；！？` | Sentence boundary delimiters |

**Use Cases:**
- **Email archives** — indexing corporate email for compliance or discovery
- **Support ticket history** — making email-based support conversations searchable
- **Project communication** — archiving project-related email threads
- **Newsletter indexing** — making newsletter content searchable

---

### 13. OpenAPI

**File:** `openapi.py` (~11KB) — API specification parser

**Description:**
Parses OpenAPI 3.x and Swagger 2.0 specifications, creating one chunk per API endpoint with resolved schemas, parameters, and request/response documentation.

**Supported Formats:** `.json`, `.yaml`, `.yml` (OpenAPI/Swagger specs)

**Parsing Logic:**
- Resolves `$ref` references via the prance library
- Each API endpoint (path + HTTP method) = one chunk
- Flattens schemas with recursion depth limit to prevent infinite loops
- Extracts parameters (required, type, format)
- Formats request/response body documentation
- Produces human-readable endpoint documentation

**Output Chunk Metadata:**
- `path`: API endpoint path
- `method`: HTTP method (GET, POST, etc.)
- `operation_id`: Operation identifier
- `tags`: API tags
- `summary`, `description`: Endpoint documentation
- `parameter_count`: Number of parameters
- `response_codes`: Documented response status codes

**Use Cases:**
- **API documentation search** — finding endpoints by description, parameters, or response types
- **Developer onboarding** — making API specs searchable for new team members
- **API governance** — indexing all organizational APIs for discovery and audit
- **Integration planning** — searching across multiple API specs for compatible endpoints

---

### 14. ADR

**File:** `adr.py` (~14KB) — Architecture Decision Record parser

**Description:**
Parses Architecture Decision Records in multiple Markdown formats (MADR, Nygard, Y-statement). Auto-detects the format and extracts structured sections (Context, Decision, Status, Options, Consequences).

**Supported Formats:** `.md`, `.markdown` (ADR-formatted)

**Parsing Logic:**
- Auto-detects ADR format: Y-statement → MADR → Nygard
- **Y-statement**: Parses pattern `"In context of X, facing Y, decided Z to achieve W"`
- **MADR**: Section-based with `## Decision Drivers`, `## Considered Options`, etc.
- **Nygard**: Classic Status/Context/Decision/Consequences sections
- Regex-based heading pattern matching (case-insensitive)

**Output Chunk Metadata:**
- `adr_title`: Decision title
- `adr_status`: Status (Proposed, Accepted, Deprecated, Superseded)
- `adr_date`: Decision date
- `superseded_by`: Reference to replacing ADR (if superseded)
- `section_type`: Section category (context, decision, options, consequences)

**Use Cases:**
- **Architecture knowledge bases** — searching past decisions by context or rationale
- **Technical governance** — auditing decision history across projects
- **Onboarding** — helping new engineers understand why architectural choices were made
- **Decision impact analysis** — finding related decisions when proposing changes

---

### 15. Clinical

**File:** `clinical.py` (~8KB) — Clinical document parser

**Description:**
Parses clinical and medical documents with naive paragraph-based splitting, followed by LLM-based post-parse classification into categories (regulatory, protocol, research, administrative).

**Supported Formats:** `.pdf`, `.docx`, `.txt`

**Parsing Logic:**
- Naive paragraph-based splitting (similar to naive parser)
- LLM-based post-parse classification into document categories:
  - Regulatory
  - Protocol
  - Research
  - Administrative
- Tag-based filtering support for category-specific retrieval

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Target tokens per paragraph chunk |

**Output Chunk Metadata:**
- `tag_kwd`: `["clinical"]` plus classification category

**Use Cases:**
- **Clinical trial document management** — indexing protocols, regulatory filings, study reports
- **Medical knowledge bases** — hospital SOPs, clinical guidelines, drug information
- **Regulatory compliance** — searching across regulatory submissions and approvals
- **Research literature** — indexing clinical research papers with category filtering

---

### 16. Laws

**File:** `laws.py` (~9KB) — Legal document parser

**Description:**
Parses legal documents using tree-structured merging that respects legal hierarchies (articles, sections, subsections). Detects article/section numbering patterns and preserves legal structure.

**Supported Formats:** `.pdf`, `.docx`, `.txt`, `.html`, `.htm`, `.doc`

**Parsing Logic:**
- Tree-structured merging for legal document hierarchies
- Article and section number detection (e.g., "Article 1", "Section 2.3")
- DOCX: heading-level-based tree building
- PDF: uses LAWS parser type for layout model selection
- Automatic table-of-contents removal
- Bullet and numbering pattern preservation

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Target tokens per chunk |
| `delimiter` | str | `\n!?。；！？` | Sentence boundary delimiters |
| `layout_recognize` | str | `DeepDOC` | PDF layout engine |

**Use Cases:**
- **Legal knowledge bases** — statutes, regulations, ordinances, treaties
- **Contract analysis** — indexing contract clauses with structural awareness
- **Compliance search** — finding relevant legal provisions by topic
- **Policy management** — internal policies formatted as legal documents
- **Court document analysis** — judgments, rulings, legal opinions

---

### 17. Tag

**File:** `tag.py` (~7KB) — Content-tag pair parser

**Description:**
Similar to Q&A parser but treats the second column as comma-separated tags instead of an answer. Creates content-tag pairs for tag-based retrieval and classification.

**Supported Formats:** `.xlsx`, `.csv`, `.txt`

**Parsing Logic:**
- Column 1 = content text, Column 2 = comma-separated tags
- Each content-tag pair = one chunk
- Tags normalized (dots → underscores)
- Supports `label_question()` function that maps queries to tags using tag knowledge bases
- Cache-based tag lookup optimization

**Output Chunk Metadata:**
- `tag_kwd`: List of parsed and normalized tags

**Use Cases:**
- **Content classification** — pre-tagged content for category-based retrieval
- **Product catalogs with tags** — products tagged with categories, features, attributes
- **Document tagging systems** — documents with manual classification labels
- **Training data preparation** — labeled datasets for retrieval augmentation
- **Tag-based filtering** — knowledge bases where users filter by predefined categories

---

### 18. Resume

**File:** `resume.py` (~117KB) — Resume/CV parser (SmartResume)

**Description:**
The most complex parser, implementing the SmartResume architecture (ref: arXiv:2510.09722). Uses YOLOv10 layout segmentation, dual-path text extraction (metadata + OCR), 3-way parallel LLM extraction, and 4-stage post-processing for structured resume data extraction.

**Supported Formats:** `.pdf`, `.docx`

**Parsing Logic:**
1. **Text Fusion**: Dual-path extraction combining PDF metadata and OCR
2. **Layout Segmentation**: YOLOv10-based layout detection with hierarchical sorting
3. **Parallel LLM Extraction**: 3 concurrent extraction tasks:
   - Basic info (name, contact, skills)
   - Work experience (companies, positions, durations)
   - Education (schools, degrees, majors)
4. **Index Pointer Mechanism**: LLM returns line ranges instead of full text (reduces hallucination)
5. **Post-Processing** (4 stages): text re-extraction, normalization, deduplication, validation

**Output Chunk Metadata (40+ fields):**

| Category | Fields |
|----------|--------|
| Basic Info | `name_kwd`, `gender_kwd`, `age_int`, `phone_kwd`, `email_kwd`, `location_kwd`, `url_kwd` |
| Education | `school_name_kwd`, `degree_kwd`, `major_kwd`, `start_dt`, `end_dt`, `edu_details_tks` |
| Work | `company_kwd`, `position_kwd`, `duration`, `work_details_tks` |
| Skills | `skill_kwd` (multi-valued) |
| Projects | `project_name_kwd`, `project_description_tks` |

**Special Features:**
- Parallel task decomposition with `concurrent.futures`
- Long random string filtering (40+ character patterns)
- JSON repair for malformed LLM responses
- Tiktoken-based token counting
- Select field restrictions and forbidden fields

**Use Cases:**
- **Recruitment systems** — structured resume search by skills, experience, education
- **Talent management** — building searchable employee skill databases
- **HR analytics** — extracting structured data from resume collections
- **Job matching** — matching candidate profiles to job requirements via typed fields

---

### 19. SDLC Checklist

**File:** `sdlc_checklist.py` — Software Development Life Cycle checklist parser

**Description:**
Parses SDLC checklist documents used across all software development phases: requirements gathering, design review, code review, testing, security review, deployment, UAT, and maintenance. Each checklist item becomes a separate chunk with structured metadata including SDLC phase, completion status, priority, and assignee. Supports multiple checklist formats: Markdown checkboxes, Excel/CSV tabular layouts, and status-prefix patterns in plain text.

Includes an LLM-based post-parse phase classifier that auto-detects the SDLC phase when keyword-based detection is insufficient.

**Supported Formats:** `.md`, `.markdown`, `.mdx`, `.xlsx`, `.csv`, `.txt`, `.pdf`, `.docx`

**Parsing Logic:**
- **Markdown**: Detects GitHub-style checkboxes (`- [ ]`, `- [x]`, `- [~]`), splits by headings to assign phases per section
- **Excel/CSV/TXT (tabular)**: Expects columns — item, status, phase, priority, assignee; auto-detects headers and column mapping
- **Plain text / PDF / DOCX**: Detects status-prefix patterns (`[DONE]`, `[PASS]`, `[FAIL]`, `[TODO]`, `[N/A]`), falls back to bullet-list detection
- **Phase detection**: Keyword scoring across 8 SDLC phases, with LLM fallback for unclassified items
- **Priority extraction**: Inline patterns `(P0)`–`(P4)`, `[CRITICAL]`, `[HIGH]`, `[MEDIUM]`, `[LOW]`
- **Assignee extraction**: `@username` or `assigned to: Name` patterns
- **Fallback**: Paragraph-based chunking with phase tagging when no checklist patterns are detected

**SDLC Phases Detected:**

| Phase | Keywords Matched |
|-------|-----------------|
| `requirements` | requirement, functional spec, user story, acceptance criteria, business rule, use case |
| `design_review` | design review, architecture, system design, HLD, LLD, API design, data model |
| `code_review` | code review, peer review, pull request, coding standard, static analysis |
| `testing` | test case, test plan, unit test, integration test, regression, QA checklist |
| `security` | security, vulnerability, OWASP, threat model, access control, encryption |
| `deployment` | deploy, release, rollback, CI/CD, staging, production readiness, go-live |
| `uat` | UAT, user acceptance, sign-off, stakeholder review, demo, client validation |
| `maintenance` | post-deploy, monitoring, runbook, incident, support handoff, knowledge transfer |

**Configuration:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunk_token_num` | int | 512 | Target tokens per chunk (used in fallback mode) |
| `group_by_section` | bool | false | Group items by section heading instead of one-per-chunk |
| `sdlc_phase` | str | _(empty)_ | Override auto-detection with explicit SDLC phase |

**Output Chunk Metadata:**

| Field | Type | Description |
|-------|------|-------------|
| `tag_kwd` | list | `["sdlc_checklist", "<phase>"]` |
| `sdlc_phase_kwd` | str | SDLC phase (requirements, testing, deployment, etc.) |
| `sdlc_status_kwd` | str | Item status: `checked`, `unchecked`, or `na` |
| `sdlc_priority_kwd` | str | Priority level: critical, high, medium, low |
| `sdlc_assignee_kwd` | str | Assigned person (from @mention or column) |
| `sdlc_checked_int` | int | Checked item count (section-grouped mode only) |
| `sdlc_total_int` | int | Total item count (section-grouped mode only) |

**Post-Parse LLM Classification:**
When keyword-based phase detection produces `unclassified`, the task executor triggers an LLM-based classifier (following the same pattern as clinical document classification). The LLM analyzes the document title and first 2000 tokens to determine the SDLC phase, storing it as metadata on all unclassified chunks.

**Use Cases:**
- **Requirements validation** — tracking which requirements have been reviewed and approved before development starts
- **Design review gates** — ensuring all architecture review items are checked off before moving to implementation
- **Code review compliance** — verifying coding standards, security checks, and peer review completion on PRs
- **QA test tracking** — monitoring test case execution status, tracking pass/fail rates across test plans
- **Security audit checklists** — OWASP compliance checks, vulnerability assessment completion, penetration test sign-offs
- **Release readiness** — deployment checklists ensuring CI/CD, rollback plans, and monitoring are in place before go-live
- **UAT sign-off** — tracking user acceptance testing completion with stakeholder approval status
- **Post-deployment monitoring** — runbook verification, monitoring setup, and support handoff checklists
- **SDLC process compliance** — auditing which SDLC gates have been completed across projects for governance
- **Sprint completion tracking** — importing sprint checklists from project management tools for searchable history

**Example Input Formats:**

Markdown with checkboxes:
```markdown
## Code Review Checklist
- [x] All unit tests pass
- [x] No hardcoded credentials (P1) @alice
- [ ] Error handling covers edge cases [HIGH]
- [ ] API documentation updated
- [~] Performance benchmarks (N/A for this PR)
```

Excel/CSV columns:
```
Item | Status | Phase | Priority | Assignee
Verify SSL certificates | Done | deployment | high | bob
Database migration tested | Pending | deployment | critical | alice
Rollback procedure documented | Done | deployment | medium | charlie
```

Status-prefix format:
```
[PASS] Authentication flow tested
[PASS] Authorization rules verified
[FAIL] Rate limiting under load — needs fix
[TODO] API versioning check
[N/A] Mobile-specific tests (web-only release)
```

---

## Cross-Cutting Concerns

### PDF Layout Recognition Backends

All PDF-capable parsers support configurable layout backends via `layout_recognize`:

| Backend | Description | Best For |
|---------|-------------|----------|
| **DeepDOC** | Default layout engine (PdfParser) | General PDFs, good balance of speed/accuracy |
| **MinerU** | OCR model via LLMBundle | Scanned documents, heavy OCR needs |
| **Docling** | DoclingParser | Complex layouts, academic papers |
| **TCADP** | TCADPParser | Specialized document types |
| **PaddleOCR** | LLMBundle-based OCR | Chinese/multilingual documents |
| **PlainText** | PlainParser | Text-heavy PDFs, fast extraction |
| **Vision** | VisionParser (LLM-based) | Complex visual layouts, diagrams |

### Tokenization Pipeline

All parsers use `rag_tokenizer` for consistent search indexing:
- `content_ltks`: Standard tokenized content
- `content_sm_ltks`: Fine-grained tokenization for precise matching

### Progress Reporting

All parsers accept a `callback(progress: float, message: str)` function for progress tracking during long-running parse operations.

### Metadata Standards

Every chunk includes these base fields:
- `docnm_kwd`: Source document filename
- `title_tks`: Tokenized document name

---

## File Extension → Parser Mapping

```
.pdf        → naive, paper, book, one, presentation, manual, clinical, laws, resume, sdlc_checklist
.docx       → naive, book, one, qa, manual, clinical, laws, resume, sdlc_checklist
.doc        → naive, book, one, laws
.txt        → naive, book, one, table, qa, clinical, laws, tag, sdlc_checklist
.md/.mdx    → naive, one, qa, adr, sdlc_checklist
.html/.htm  → naive, book, one, laws
.xlsx       → naive, one, table, qa, tag, sdlc_checklist
.csv        → naive, table, qa, tag, sdlc_checklist
.json       → naive, openapi
.yaml/.yml  → openapi
.pptx/.ppt  → presentation
.eml        → email
.py/.js/... → code (dedicated, not user-selectable — 20+ language extensions)
.jpg/.png   → picture
.mp4/.mov   → picture (video)
.wav/.mp3   → audio
```

> **Note:** When multiple parsers support a format, the choice depends on the knowledge base's `parser_id` configuration. Users select the parser type when creating a knowledge base or uploading documents.
>
> **Dedicated parsers:** The `code` parser is a dedicated internal parser not available in the dataset parser dropdown. It is used programmatically for project source code analysis only.
