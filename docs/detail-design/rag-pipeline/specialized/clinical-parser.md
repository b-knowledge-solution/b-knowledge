# Clinical Parser — Detail Design

> **Module**: `advance-rag/rag/app/clinical.py`
> **Parser Type**: `ParserType.CLINICAL`
> **Category**: Specialized
> **Role**: Parser for clinical and medical documents with LLM classification

---

## 1. Overview

The Clinical Parser handles clinical documents such as regulatory filings, medical protocols, research papers, and administrative healthcare documents. It uses naive-style paragraph chunking for text extraction, then applies a **post-parse LLM classification** step to categorize each document into one of four clinical categories. The classification tags enable role-based access control (ABAC) in the knowledge base.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Regulatory compliance** | Index FDA, EMA, or other regulatory documents |
| **Clinical protocols** | SOPs, trial protocols, treatment guidelines |
| **Medical research** | Clinical research papers and case studies |
| **Hospital admin** | Administrative healthcare documents |
| **Pharmaceutical** | Drug documentation, clinical trial reports |
| **ABAC filtering** | Role-based access to clinical content by category |

---

## 3. Supported Formats

| Format | Notes |
|--------|-------|
| TXT | Plain text clinical documents |
| PDF | PDF clinical documents (text extraction) |
| DOCX | Word-format clinical documents |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Text extraction        │
              │  (format-dependent)     │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Naive-style paragraph  │
              │  chunking with token    │
              │  limit                  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  tokenize_chunks()      │
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │  Return     │
                    │  chunks     │
                    └──────┬──────┘
                           │
              ═════════════╪═════════════
              POST-PARSE (task_executor)
              ═════════════╪═════════════
                           │
              ┌────────────▼────────────┐
              │  classify_document()    │
              │  (LLM classification)   │
              │                         │
              │  Categories:            │
              │  - regulatory           │
              │  - protocol             │
              │  - research             │
              │  - administrative       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Add tags to chunks:    │
              │  tag_kwd = ["clinical", │
              │             <category>] │
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

### 5.1 Text Extraction & Chunking

The parser uses the same approach as the Naive Parser for text extraction:
1. Extract text from the document (format-dependent)
2. Split into paragraphs
3. Merge paragraphs by token limit (naive_merge strategy)
4. Produce standard chunk dicts

### 5.2 Post-Parse LLM Classification

After the chunk function returns, the **task_executor** calls `classify_document()`:

1. **Sample text**: A representative sample of the document text is sent to the CHAT LLM
2. **Prompt**: The LLM is asked to classify the document into exactly one category
3. **Categories**:

| Category | Description | Examples |
|----------|-------------|---------|
| `regulatory` | Government regulations, FDA/EMA filings, compliance docs | FDA 510(k), EMA EPAR, ISO 13485 audits |
| `protocol` | Clinical trial protocols, SOPs, treatment guidelines | ICH E6(R2) GCP, SOPs, treatment algorithms |
| `research` | Clinical research papers, case studies, reviews | RCTs, meta-analyses, case reports |
| `administrative` | Hospital/clinic admin, HR, financial, operational | Staffing plans, budgets, policies |

4. **Tag assignment**: The classification result is added to all chunks:

```python
chunk["tag_kwd"] = ["clinical", classification_result]
# Example: ["clinical", "regulatory"]
```

### 5.3 ABAC Integration

The classification tags enable attribute-based access control:

| Role | Accessible Categories |
|------|----------------------|
| Clinical Researcher | research, protocol |
| Regulatory Affairs | regulatory, protocol |
| Hospital Admin | administrative |
| Medical Director | All categories |

Knowledge base admins configure these rules in the dataset settings.

### 5.4 Classification Prompt

The LLM prompt for classification follows this pattern:

```
Classify the following clinical document into exactly one category:
- regulatory: Government regulations, compliance filings, audit reports
- protocol: Clinical trial protocols, SOPs, treatment guidelines
- research: Clinical research papers, case studies, systematic reviews
- administrative: Administrative healthcare documents, operational docs

Document text:
{sample_text}

Category:
```

---

## 6. Output Example

```python
# Before classification (chunk() output)
{
    "content_with_weight": "Section 3.2: Primary Endpoint Analysis\n\nThe primary endpoint of overall survival was assessed using the Kaplan-Meier method. Median OS was 14.2 months in the treatment arm vs 10.8 months in the control arm (HR 0.72, 95% CI 0.58-0.89, p=0.002).",
    "content_ltks": ["primary", "endpoint", "analysis", "survival", "kaplan", "meier"],
    "docnm_kwd": "clinical-trial-report.pdf",
    "page_num_int": [12]
}

# After classification (task_executor adds tags)
{
    "content_with_weight": "Section 3.2: Primary Endpoint Analysis\n\nThe primary endpoint of overall survival was assessed...",
    "content_ltks": ["primary", "endpoint", "analysis", "survival", "kaplan", "meier"],
    "docnm_kwd": "clinical-trial-report.pdf",
    "tag_kwd": ["clinical", "research"],
    "page_num_int": [12]
}
```

---

## 7. Differences from Other Parsers

| Aspect | Clinical | Naive | Tag | SDLC Checklist |
|--------|----------|-------|-----|---------------|
| Chunking | Naive-style | Naive-style | Row-per-chunk | Item-per-chunk |
| Post-parse step | LLM classification | None | None | Optional LLM |
| Tags | "clinical" + category | None | User-defined | Phase + status |
| ABAC | Via classification | None | Via user tags | Via phase |
| LLM required | Yes (classification) | No | No | Optional |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| LLM classification fails | Chunks tagged with ["clinical"] only (no category) |
| LLM returns unknown category | Falls back to "administrative" |
| Empty document | Returns empty list |
| Very short document | Classification may be less accurate |
| Mixed-category document | Single category assigned (document-level, not chunk-level) |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `rag/app/naive.py` | Text extraction and chunking logic (shared) |
| `LLMBundle` | CHAT model for document classification |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |

---

## 10. Limitations

- **Document-level classification**: The entire document gets one category, not per-chunk classification
- **LLM dependency**: Classification requires an LLM; without one, only "clinical" tag is applied
- **Four categories only**: No custom category support (hardcoded)
- **English/Chinese focus**: Classification prompt optimized for these languages
- **No medical NER**: Does not extract named entities (drugs, conditions, procedures) — only categorizes
