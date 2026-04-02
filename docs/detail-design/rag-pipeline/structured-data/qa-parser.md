# QA Parser — Detail Design

> **Module**: `advance-rag/rag/app/qa.py`
> **Parser Type**: `ParserType.QA`
> **Category**: Structured Data
> **Role**: Parser for question-answer pair documents

---

## 1. Overview

The QA Parser extracts question-answer pairs from various document formats. It is designed for FAQ documents, knowledge base articles, and any content structured as questions followed by answers. Each Q&A pair becomes a single chunk, enabling precise retrieval when users ask questions that match indexed FAQ entries.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **FAQ documents** | Company FAQ sheets in Excel or DOCX |
| **Knowledge base articles** | Q&A-structured help center content |
| **Interview questions** | Technical interview question banks |
| **Exam preparation** | Study materials in Q&A format |
| **Customer support** | Support ticket Q&A pairs for AI chatbot training |
| **Compliance Q&A** | Regulatory FAQ documents |

---

## 3. Supported Formats

| Format | Detection Method | Notes |
|--------|-----------------|-------|
| Excel (XLSX/XLS) | Column 1 = Question, Column 2 = Answer | Primary format |
| CSV | Column 1 = Question, Column 2 = Answer | Tab/comma delimited |
| TXT | Column 1 = Question, Column 2 = Answer | Tab-delimited |
| PDF | Bullet pattern detection (`qbullets_category()`) | Q&A within PDF text |
| Markdown | Heading = Question, Body = Answer | Heading-based Q&A |
| DOCX | Heading = Question, Body = Answer | Heading-based Q&A |

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
              └──┬───┬───┬───┬───┬─────┘
                 │   │   │   │   │
    ┌────────────▼┐ ┌▼──┐│  ┌▼──┐▼──────────┐
    │ Excel/CSV/  │ │PDF││  │MD │ DOCX      │
    │ TXT (2-col) │ │   ││  │   │           │
    └──────┬──────┘ └─┬─┘│  └─┬─┘ └────┬────┘
           │          │   │    │        │
           │     ┌────▼────┐   │   ┌────▼────┐
           │     │ Detect  │   │   │ Heading │
           │     │ Q&A     │   │   │ = Q,    │
           │     │ bullets │   │   │ Body    │
           │     │ qbullets│   │   │ = A     │
           │     │ _cat()  │   │   └────┬────┘
           │     └────┬────┘   │        │
           │          │        │        │
    ┌──────▼──────┐   │   ┌────▼────┐   │
    │ Row = Q&A   │   │   │ Heading │   │
    │ pair chunk  │   │   │ split   │   │
    └──────┬──────┘   │   │ → Q&A   │   │
           │          │   └────┬────┘   │
           └──────────┼────────┼────────┘
                      │        │
              ┌───────▼────────▼────────┐
              │  Format output:         │
              │  "Question: X"          │
              │  "Answer: Y"            │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  tokenize_chunks()      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Return Q&A chunks      │
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

### 5.1 Excel/CSV/TXT Processing (Two-Column Format)

The simplest and most common path:

| Column 1 | Column 2 |
|-----------|----------|
| What is B-Knowledge? | B-Knowledge is an open-source platform for AI search and knowledge management. |
| How do I install it? | Run `npm run setup` to install all dependencies and configure services. |

**Processing**:
1. Parse the spreadsheet/CSV
2. First row may be treated as header (skipped if it matches "Question"/"Answer" patterns)
3. Each subsequent row → one chunk
4. Column 1 → question text
5. Column 2 → answer text
6. Output format: `"Question: {col1}\tAnswer: {col2}"`

**Row number tracking**: Each chunk stores its row number in `top_int` for position reference.

### 5.2 PDF Processing (Bullet-Based Q&A Detection)

For PDF documents containing inline Q&A:

1. **Extract text** via layout engine
2. **Detect Q&A bullets** using `qbullets_category()`:
   - Patterns like "Q:", "Q1.", "Question:", "问:", numbered items
   - Detects the specific bullet style used in the document
3. **Match question starts**: Each detected bullet pattern marks a new question
4. **Extract answer**: All text between the current question bullet and the next becomes the answer
5. **Table handling**: Tables appearing between Q&A pairs are included in the preceding answer

**Example detection**:
```
Q1: What is the maximum file size?
A1: The maximum file size is 100MB. Larger files can be...

Q2: Which formats are supported?
A2: We support PDF, DOCX, Excel, and 15+ other formats.
```

### 5.3 Markdown Processing (Heading-Based Q&A)

For Markdown documents:

1. **Heading detection**: Each heading (##, ###, etc.) is treated as a question
2. **Body extraction**: Content below the heading until the next heading is the answer
3. **Level-aware**: Only the specified heading level triggers Q&A splitting

**Example**:
```markdown
## What is the maximum file size?
The maximum file size is 100MB.

## Which formats are supported?
We support PDF, DOCX, Excel, and more.
```

### 5.4 DOCX Processing (Heading-Based Q&A)

Similar to Markdown:

1. **Heading styles**: DOCX heading levels (Heading 1, Heading 2, etc.) identify questions
2. **Body paragraphs**: Non-heading paragraphs become the answer
3. **Images**: Inline images within answers are extracted and attached to chunks

### 5.5 Output Formatting

All paths produce chunks in the same format:

```python
{
    "content_with_weight": "Question: What is B-Knowledge?\tAnswer: B-Knowledge is an open-source platform...",
    # Tab separator between Q and A for structured parsing
}
```

The tab (`\t`) separator allows downstream systems to split question from answer.

---

## 6. Output Example

```python
# Excel-sourced Q&A
{
    "content_with_weight": "Question: How do I reset my password?\tAnswer: Navigate to Settings > Security > Change Password. Enter your current password and new password twice. Click Save.",
    "content_ltks": ["reset", "password", "navigate", "settings", "security", "change"],
    "content_sm_ltks": ["res", "pas", "nav", ...],
    "docnm_kwd": "customer-faq.xlsx",
    "title_tks": ["reset", "password"],
    "top_int": [15],
    "image": None
}

# PDF-sourced Q&A with embedded table
{
    "content_with_weight": "Question: What are the system requirements?\tAnswer: See the following table:\n| Component | Minimum | Recommended |\n| RAM | 8GB | 16GB |\n| CPU | 4 cores | 8 cores |",
    "content_ltks": ["system", "requirements", "table", "component", "minimum", "recommended"],
    "docnm_kwd": "installation-faq.pdf",
    "title_tks": ["system", "requirements"],
    "page_num_int": [3]
}
```

---

## 7. Differences from Other Parsers

| Aspect | QA | Table | Tag | Naive |
|--------|-----|-------|-----|-------|
| Structure | Question + Answer | Row with typed columns | Content + Tags | Free text |
| Output format | "Q: ...\tA: ..." | "- Field: Value" | Content + tag_kwd | Merged text |
| Typed fields | No | Yes (int, float, etc.) | Tags only | No |
| Bullet detection | qbullets_category() | No | No | bullets_category() |
| Multi-format support | Yes (6 formats) | Excel/CSV only | Excel/CSV/TXT | Yes (10+ formats) |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| Single-column spreadsheet | Treats each row as a standalone Q (no answer) |
| No Q&A bullets in PDF | Falls back to paragraph-based chunking |
| Empty questions or answers | Skipped (no empty Q&A chunks) |
| Very long answers | Not split — one Q&A pair = one chunk regardless of length |
| Mixed Q&A and narrative text | Non-Q&A text may be lost or attached to nearest Q&A |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/excel_parser.py` | Excel/CSV parsing |
| `deepdoc/parser/pdf_parser.py` | PDF layout extraction |
| `deepdoc/parser/docx_parser.py` | DOCX heading extraction |
| `deepdoc/parser/markdown_parser.py` | Markdown heading parsing |
| `rag/nlp/` | qbullets_category(), tokenize_chunks() |
