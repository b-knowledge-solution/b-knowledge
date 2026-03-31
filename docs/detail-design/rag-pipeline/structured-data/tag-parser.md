# Tag Parser — Detail Design

> **Module**: `advance-rag/rag/app/tag.py`
> **Parser Type**: `ParserType.TAG`
> **Category**: Structured Data
> **Role**: Parser for content-tag pair documents

---

## 1. Overview

The Tag Parser extracts content-tag pairs from spreadsheet and text files. It is similar to the QA Parser but treats the second column as **comma-separated tags** instead of an answer. Tags are normalized and stored in the `tag_kwd` field, enabling tag-based filtering and attribute-based access control (ABAC) in knowledge bases.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Content classification** | Tagging articles or documents with categories |
| **ABAC filtering** | Assigning access control tags to content chunks |
| **Product tagging** | Products with multiple category tags |
| **Document metadata** | Adding searchable labels to content |
| **Topic classification** | Assigning topic tags for filtered retrieval |

---

## 3. Supported Formats

| Format | Notes |
|--------|-------|
| Excel (XLSX/XLS) | Column 1 = Content, Column 2 = Tags (comma-separated) |
| CSV | Column 1 = Content, Column 2 = Tags |
| TXT | Tab-delimited: Content \t tag1,tag2,tag3 |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Parse spreadsheet/CSV  │
              │  (same as QA for Excel) │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Column 1 → Content     │
              │  Column 2 → Tags        │
              │  (comma-separated)      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Tag Normalization      │
              │  - Split by comma       │
              │  - Trim whitespace      │
              │  - Replace "." → "_"    │
              │  - Lowercase            │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  One row = One chunk    │
              │  content + tag_kwd list │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  tokenize_chunks()      │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Return tagged chunks   │
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

### 5.1 Input Format

| Column 1 (Content) | Column 2 (Tags) |
|---------------------|------------------|
| Introduction to Python programming | python, programming, beginner |
| Advanced SQL optimization techniques | sql, database, performance, advanced |
| Docker deployment best practices | docker, devops, deployment |

### 5.2 Tag Normalization

Tags undergo normalization before storage:

1. **Split**: Column 2 is split by commas
2. **Trim**: Leading/trailing whitespace removed from each tag
3. **Dot replacement**: Dots (`.`) are replaced with underscores (`_`)
   - Example: `"machine.learning"` → `"machine_learning"`
   - Rationale: Dots conflict with OpenSearch field path notation
4. **Result**: Clean list of normalized tag strings

```python
# Input:  "python, machine.learning, AI "
# Output: ["python", "machine_learning", "ai"]
```

### 5.3 ABAC Integration

Tags stored in `tag_kwd` enable attribute-based access control:

- Knowledge base admins can configure tag-based visibility rules
- Example: Only users with "engineering" role can see chunks tagged "internal.engineering"
- The `tag_kwd` field is indexed as a keyword field in OpenSearch for exact-match filtering

### 5.4 Row-per-Chunk Output

Each row produces one chunk:

```python
{
    "content_with_weight": "Introduction to Python programming",
    "tag_kwd": ["python", "programming", "beginner"],
    "content_ltks": ["introduction", "python", "programming"],
    ...
}
```

---

## 6. Output Example

```python
{
    "content_with_weight": "Docker deployment best practices for microservices architecture",
    "content_ltks": ["docker", "deployment", "best", "practices", "microservices"],
    "content_sm_ltks": ["doc", "dep", "bes", ...],
    "docnm_kwd": "tech-articles.xlsx",
    "tag_kwd": ["docker", "devops", "deployment", "microservices"],
    "title_tks": [],
    "top_int": [5]
}
```

---

## 7. Differences from QA Parser

| Aspect | Tag | QA |
|--------|-----|----|
| Column 2 interpretation | Comma-separated tags | Answer text |
| Output format | content + tag_kwd list | "Question: X\tAnswer: Y" |
| Tag normalization | Yes (dot→underscore) | No |
| ABAC support | Yes (via tag_kwd) | No |
| PDF/Markdown support | No | Yes |
| Use case | Classification/filtering | FAQ/knowledge |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| No tags in Column 2 | Chunk created with empty tag_kwd list |
| Single-column data | Content only, no tags |
| Empty rows | Skipped |
| Tags with special characters | Characters preserved except dots |
| Very long tag lists | All tags included, no limit |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `deepdoc/parser/excel_parser.py` | Excel/CSV parsing |
| `rag/nlp/rag_tokenizer.py` | Content tokenization |
