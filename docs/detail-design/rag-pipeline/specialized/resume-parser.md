# Resume Parser — Detail Design

> **Module**: `advance-rag/rag/app/resume.py`
> **Parser Type**: `ParserType.RESUME`
> **Category**: Specialized
> **Role**: Multi-stage resume parser based on SmartResume architecture

---

## 1. Overview

The Resume Parser implements the **SmartResume** architecture (arXiv:2510.09722), a sophisticated multi-stage pipeline for extracting structured information from resumes. It uses dual-path extraction (metadata + OCR), YOLOv10 layout detection, parallel LLM extraction with an index pointer mechanism (reducing hallucination), and four-stage post-processing. It extracts 80+ structured fields from resumes.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Recruitment** | Parse candidate resumes for searchable talent databases |
| **HR analytics** | Extract structured data for workforce analytics |
| **Candidate matching** | Match resume fields against job requirements |
| **Talent management** | Index employee resumes for internal mobility |
| **Compliance** | Verify credential information extraction |

---

## 3. Supported Formats

| Format | Notes |
|--------|-------|
| PDF | Primary format; uses layout detection |
| DOCX | Text + style extraction |

---

## 4. Design

### 4.1 Architecture Diagram (SmartResume 5-Stage Pipeline)

```
                    ┌──────────────────┐
                    │    chunk()       │
                    └────────┬─────────┘
                             │
              ┌──────────────▼──────────────┐
              │  STAGE 1: Dual-Path         │
              │  Extraction                 │
              │                             │
              │  ┌───────────┬───────────┐  │
              │  │ Metadata  │ OCR Text  │  │
              │  │ extraction│ extraction│  │
              │  └─────┬─────┴─────┬─────┘  │
              │        └─────┬─────┘        │
              │              │ Fusion        │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  STAGE 2: Layout Analysis   │
              │  YOLOv10 layout detector    │
              │  (lazy-loaded model)        │
              │  → Structured reconstruction│
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  STAGE 3: Parallel LLM      │
              │  Extraction (3-way split)   │
              │                             │
              │  ┌─────────┬────────┬─────┐ │
              │  │ Basic   │ Work   │ Edu │ │
              │  │ Info    │ Exp    │     │ │
              │  └────┬────┴───┬────┴──┬──┘ │
              │       │        │       │    │
              │  Index pointer mechanism:   │
              │  LLM returns line ranges    │
              │  not full text (reduces     │
              │  hallucination)             │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  STAGE 4: Post-Processing   │
              │  (4 sub-stages)             │
              │                             │
              │  4a. Source text             │
              │      re-extraction          │
              │  4b. Domain normalization   │
              │      (school rank, industry)│
              │  4c. Context deduplication  │
              │  4d. Source text validation  │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  STAGE 5: Field Mapping     │
              │  80+ fields → chunk fields  │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │  Return structured chunks   │
              └─────────────────────────────┘
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

### 5.1 Stage 1: Dual-Path Extraction

Two parallel extraction paths produce complementary data:

**Path A — Metadata extraction**:
- Extract PDF metadata (author, creation date, software used)
- Extract text layer from PDF (if text-based, not scanned)
- Extract DOCX properties and text

**Path B — OCR text extraction**:
- Render each page as an image
- Run OCR to extract visual text
- This catches text in images, headers, footers, sidebars

**Fusion**: Results from both paths are merged, with metadata path taking precedence for structured fields and OCR filling gaps.

### 5.2 Stage 2: Layout Analysis (YOLOv10)

A YOLOv10 object detection model (lazy-loaded on first use) analyzes the page layout:

- **Region detection**: Identifies regions like "Personal Info", "Work Experience", "Education", "Skills", "Projects"
- **Reading order**: Determines the correct reading order across columns and sections
- **Structured reconstruction**: Rebuilds the document into logical sections

### 5.3 Stage 3: Parallel LLM Extraction

The extracted text is split into three parallel LLM extraction tasks:

| Task | Extracted Fields | Example |
|------|-----------------|---------|
| **Basic Info** | Name, gender, age, phone, email, location, nationality | "John Smith, Male, 32, +84-123-456-789" |
| **Work Experience** | Company, position, dates, responsibilities, achievements | "Senior Engineer at TechCorp, 2020-2024" |
| **Education** | School, degree, major, dates, GPA | "MIT, M.S. Computer Science, 2018-2020" |

**Index Pointer Mechanism** (key innovation):
- Instead of asking the LLM to reproduce text, it returns **line number ranges**
- Example: LLM returns `{work_description: lines 15-23}` instead of the full text
- The system then extracts the original text from those line ranges
- **Rationale**: Eliminates LLM hallucination of resume content; the source text is always the original document

### 5.4 Stage 4: Four-Stage Post-Processing

**4a. Source text re-extraction**:
- Using the line pointers from Stage 3, extract actual text from the OCR/metadata output
- Verify the extracted text matches the pointer ranges

**4b. Domain normalization**:
- **School ranking**: Map school names to known rankings (QS, THE, etc.)
- **Industry mapping**: Normalize company/industry names to standard categories
- **Degree normalization**: Map "B.S.", "Bachelor's", "学士" to standard degree levels
- **Location normalization**: Standardize city/country names

**4c. Context deduplication**:
- Remove duplicate entries (e.g., same work experience listed under different section names)
- Merge overlapping date ranges for the same employer

**4d. Source text validation**:
- Verify extracted fields against the original document
- Flag potential extraction errors

### 5.5 Stage 5: Field Mapping (80+ Fields)

**Basic Information Fields**:
| Field | Type | Example |
|-------|------|---------|
| name | text | "John Smith" |
| gender | keyword | "male" |
| age | integer | 32 |
| phone | text | "+84-123-456-789" |
| email | text | "john@example.com" |
| location | text | "Ho Chi Minh City" |
| nationality | keyword | "Vietnamese" |

**Work Experience Fields**:
| Field | Type | Example |
|-------|------|---------|
| position | text | "Senior Software Engineer" |
| company | text | "TechCorp International" |
| work_years | float | 4.5 |
| work_description | text | "Led team of 8 engineers..." |
| industry | keyword | "Technology" |

**Education Fields**:
| Field | Type | Example |
|-------|------|---------|
| degree | keyword | "Master's" |
| major | text | "Computer Science" |
| school | text | "MIT" |
| school_rank | integer | 1 |
| graduation_year | integer | 2020 |

**Skills & Other Fields**:
| Field | Type | Example |
|-------|------|---------|
| technical_skills | text list | ["Python", "TypeScript", "PostgreSQL"] |
| languages | text list | ["English", "Vietnamese"] |
| certifications | text list | ["AWS SAA", "PMP"] |
| projects | text | "Led migration project..." |

### 5.6 Filtered/Forbidden Fields

Some fields are extracted but not exposed as user-selectable filters in the frontend, for privacy or relevance reasons.

---

## 6. Output Example

```python
{
    "content_with_weight": "John Smith | Senior Software Engineer | 5 years experience\n\nWork Experience:\nTechCorp International (2020-2024): Led a team of 8 engineers developing microservices architecture. Reduced API response times by 40% through optimization.\n\nEducation:\nMIT - M.S. Computer Science (2018-2020)\nGPA: 3.8/4.0\n\nSkills: Python, TypeScript, PostgreSQL, Docker, Kubernetes",
    "content_ltks": ["john", "smith", "senior", "software", "engineer", "techcorp"],
    "docnm_kwd": "john-smith-resume.pdf",
    "name_tks": ["john", "smith"],
    "position_tks": ["senior", "software", "engineer"],
    "company_tks": ["techcorp", "international"],
    "work_years_flt": 4.5,
    "degree_kwd": "master",
    "school_tks": ["mit"],
    "school_rank_int": 1,
    "technical_skills_tks": ["python", "typescript", "postgresql", "docker", "kubernetes"],
    "page_num_int": [0, 1]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Resume | Naive | Table | Manual |
|--------|--------|-------|-------|--------|
| Extraction method | 5-stage SmartResume | Text merge | Column mapping | Heading merge |
| LLM required | Yes (3 parallel calls) | No | No | No |
| Layout detection | YOLOv10 model | PDF layout engine | N/A | PDF layout engine |
| Structured fields | 80+ typed fields | None | Column-based | None |
| Hallucination prevention | Index pointer mechanism | N/A | N/A | N/A |
| Post-processing | 4-stage pipeline | None | Data type detection | None |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| YOLOv10 model not loaded | Falls back to text-only extraction |
| LLM extraction fails | Partial fields returned; errors logged |
| Scanned resume (no text layer) | OCR path handles extraction |
| Non-standard resume format | Best-effort extraction; may miss fields |
| Very short resume (<1 page) | All stages still applied |
| Multi-page resume | All pages processed and merged |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/pdf_parser.py` | PDF text + layout extraction |
| `deepdoc/parser/docx_parser.py` | DOCX text extraction |
| `deepdoc/vision/` | YOLOv10 layout detector (ONNX) |
| `LLMBundle` | CHAT model for structured extraction |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |

---

## 10. Performance Considerations

- **YOLOv10 model**: Lazy-loaded; first resume takes longer (model init)
- **3 parallel LLM calls**: Concurrent execution reduces total time
- **Post-processing**: CPU-bound; fast for typical resumes
- **Index pointer mechanism**: Reduces LLM output tokens (faster response)
- **Typical processing time**: 10-30 seconds per resume (depends on LLM speed)
