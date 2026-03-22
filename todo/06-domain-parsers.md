# 06 — Domain-Specific Parsers (SDLC + Healthcare)

## Context

### Current Domain-Specific Parsers

The system has 19 parser types in `rag/app/`, but none specifically for SDLC documents:

| Existing Parser | Purpose | Relevant? |
|----------------|---------|-----------|
| `clinical.py` | Medical/clinical docs | Yes — needs enhancement |
| `naive.py` | Generic fallback | Used for SDLC docs today |
| `table.py` | Tabular data | Partially for SDLC matrices |
| `manual.py` | Technical manuals | Partially for tech specs |
| `laws.py` | Legal documents | Pattern for regulatory text |

### Problems with Current Approach

**SDLC Documents (using naive parser):**
- Requirement IDs (REQ-001, US-001, FR-3.2.1) not extracted as metadata
- Traceability matrices lose structure (which req maps to which test)
- Status fields (Draft, Approved, Deprecated) not searchable
- Priority levels not extracted
- Section cross-references break ("See Section 3.2") with no linking

**Healthcare Documents (using clinical parser):**
- `clinical.py` only does document-level classification (regulatory/protocol/research/administrative)
- No ICD/CPT code extraction
- No drug name/dosage detection
- No evidence level tagging
- No regulatory reference preservation (FDA 21 CFR, HIPAA §164.xxx)

---

## Implementation Plan

### Part A: SDLC Parser

#### Step 1: Create SDLC Parser

**New file**: `advance-rag/rag/app/sdlc.py`

```python
"""SDLC document parser for software engineering artifacts.

Handles SRS, SDD, test plans, requirements matrices, ADR documents,
and other SDLC artifacts. Extracts structured metadata including
requirement IDs, priority, status, and traceability relationships.

Supported document types:
- Software Requirements Specification (SRS)
- Software Design Document (SDD)
- Test Plan / Test Case documents
- Architecture Decision Records (ADR)
- Traceability matrices
- Sprint/iteration planning docs
"""

import re
import copy
import logging
from rag.nlp import rag_tokenizer, tokenize, naive_merge, tokenize_table
from deepdoc.parser.pdf_parser import RAGFlowPdfParser


# Requirement ID patterns for various naming conventions
REQ_PATTERNS = [
    r'(REQ[-_]?\d+(?:\.\d+)*)',           # REQ-001, REQ_3.2.1
    r'(FR[-_]?\d+(?:\.\d+)*)',             # FR-001 (Functional Req)
    r'(NFR[-_]?\d+(?:\.\d+)*)',            # NFR-001 (Non-Functional Req)
    r'(US[-_]?\d+(?:\.\d+)*)',             # US-001 (User Story)
    r'(UC[-_]?\d+(?:\.\d+)*)',             # UC-001 (Use Case)
    r'(TC[-_]?\d+(?:\.\d+)*)',             # TC-001 (Test Case)
    r'(BUG[-_]?\d+)',                       # BUG-001
    r'(ADR[-_]?\d+)',                       # ADR-001
    r'(EPIC[-_]?\d+)',                      # EPIC-001
]

# Status indicators in SDLC documents
STATUS_PATTERNS = [
    r'\b(Draft|Approved|Rejected|Deprecated|In Review|Implemented|Verified|Closed)\b',
    r'\b(TODO|DONE|IN PROGRESS|BLOCKED|CANCELLED)\b',
    r'\b(Must|Should|Could|Won\'t)\b',     # MoSCoW priority
    r'\b(P[0-4]|Critical|High|Medium|Low)\b',  # Priority levels
]


def extract_requirement_ids(text: str) -> list[str]:
    """Extract all requirement/artifact IDs from text.

    Args:
        text: Text content to scan.

    Returns:
        Deduplicated list of requirement ID strings.
    """
    ids = []
    for pattern in REQ_PATTERNS:
        ids.extend(re.findall(pattern, text, re.IGNORECASE))
    return list(dict.fromkeys(ids))  # Deduplicate preserving order


def extract_status(text: str) -> str | None:
    """Extract status/priority indicator from text.

    Args:
        text: Text to scan for status keywords.

    Returns:
        First matching status string, or None.
    """
    for pattern in STATUS_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def extract_section_refs(text: str) -> list[str]:
    """Extract cross-references to other sections.

    Args:
        text: Text to scan for section references.

    Returns:
        List of referenced section identifiers.
    """
    patterns = [
        r'[Ss]ee [Ss]ection\s+([\d.]+)',
        r'[Rr]efer(?:ence)?\s+(?:to\s+)?[Ss]ection\s+([\d.]+)',
        r'§\s*([\d.]+)',
        r'[Ss]ection\s+([\d.]+(?:\.\d+)*)',
    ]
    refs = []
    for pattern in patterns:
        refs.extend(re.findall(pattern, text))
    return list(set(refs))


def chunk(filename, binary=None, from_page=0, to_page=100000,
          lang="English", callback=None, **kwargs):
    """Parse and chunk SDLC documents with metadata extraction.

    Splits documents by sections/requirements, extracts requirement IDs,
    status, priority, and cross-references as searchable metadata.

    Args:
        filename: Document filename.
        binary: File binary content.
        from_page: Start page (for PDF).
        to_page: End page (for PDF).
        lang: Document language.
        callback: Progress callback function.
        **kwargs: Additional parser config.

    Returns:
        List of chunk dicts with SDLC metadata.
    """
    # Use naive parser for initial text extraction
    from rag.app.naive import chunk as naive_chunk
    base_chunks = naive_chunk(
        filename, binary, from_page, to_page, lang, callback, **kwargs
    )

    eng = lang.lower() == "english"
    res = []

    for chunk_dict in base_chunks:
        content = chunk_dict.get("content_with_weight", "")

        # Extract SDLC metadata
        req_ids = extract_requirement_ids(content)
        status = extract_status(content)
        section_refs = extract_section_refs(content)

        # Add metadata as searchable fields
        if req_ids:
            chunk_dict["important_kwd"] = req_ids
            # Also add to content for better retrieval
            chunk_dict["question_kwd"] = req_ids

        if status:
            chunk_dict["status_kwd"] = status.lower()

        if section_refs:
            chunk_dict["section_ref_kwd"] = section_refs

        # Boost requirement-containing chunks
        if req_ids:
            # Prepend requirement context for embedding quality
            req_prefix = f"[Requirements: {', '.join(req_ids[:5])}] "
            if status:
                req_prefix += f"[Status: {status}] "
            chunk_dict["content_with_weight"] = req_prefix + content

        res.append(chunk_dict)

    return res
```

#### Step 2: Register SDLC Parser

**File**: `advance-rag/rag/svr/task_executor.py`

Add SDLC parser to the parser registry:

```python
# In the parser selection logic:
PARSER_MAP = {
    # ... existing parsers ...
    "sdlc": "rag.app.sdlc",
}
```

**File**: `advance-rag/db/` — Add `sdlc` to parser type enum.

### Part B: Enhanced Healthcare Parser

#### Step 3: Enhance Clinical Parser

**File**: `advance-rag/rag/app/clinical.py`

Add medical entity extraction:

```python
# Medical code patterns
ICD_PATTERN = r'\b([A-Z]\d{2}(?:\.\d{1,4})?)\b'  # ICD-10: A00.0, M54.5
CPT_PATTERN = r'\b(\d{5})\b'  # CPT codes: 99213
NDC_PATTERN = r'\b(\d{4,5}-\d{3,4}-\d{1,2})\b'  # NDC drug codes
LOINC_PATTERN = r'\b(\d{4,5}-\d)\b'  # LOINC lab codes

# Regulatory references
REGULATORY_PATTERNS = [
    r'(21\s*CFR\s*(?:Part\s*)?\d+(?:\.\d+)*)',      # FDA: 21 CFR Part 820
    r'(HIPAA\s*§?\s*\d+(?:\.\d+)*)',                  # HIPAA sections
    r'(ISO\s*\d+(?:[-:]\d+)*)',                        # ISO standards
    r'(IEC\s*\d+(?:[-:]\d+)*)',                        # IEC standards
    r'(FDA\s+\d+(?:\.\d+)*)',                          # FDA guidance
    r'(GDPR\s+Art(?:icle)?\s*\d+)',                    # GDPR articles
]

# Evidence levels
EVIDENCE_LEVELS = [
    r'(Level\s+[IV]{1,3}[ab]?\s+evidence)',
    r'(Grade\s+[A-D]\s+recommendation)',
    r'(Class\s+[I]{1,3}[ab]?\s+indication)',
    r'(Evidence\s+Level\s+[1-5][ab]?)',
]


def extract_medical_codes(text: str) -> dict:
    """Extract medical codes (ICD, CPT, NDC, LOINC) from text.

    Args:
        text: Clinical text content.

    Returns:
        Dict mapping code types to lists of found codes.
    """
    return {
        "icd_codes": re.findall(ICD_PATTERN, text),
        "cpt_codes": [c for c in re.findall(CPT_PATTERN, text) if 10000 <= int(c) <= 99999],
        "regulatory_refs": [ref for p in REGULATORY_PATTERNS for ref in re.findall(p, text)],
        "evidence_levels": [ev for p in EVIDENCE_LEVELS for ev in re.findall(p, text, re.IGNORECASE)],
    }


def enhance_clinical_chunk(chunk_dict: dict) -> dict:
    """Add medical metadata to a parsed chunk.

    Args:
        chunk_dict: Base chunk dictionary.

    Returns:
        Enhanced chunk with medical metadata fields.
    """
    content = chunk_dict.get("content_with_weight", "")
    codes = extract_medical_codes(content)

    # Add codes as searchable keywords
    all_codes = []
    for code_type, code_list in codes.items():
        all_codes.extend(code_list)

    if all_codes:
        existing_kwd = chunk_dict.get("important_kwd", [])
        if isinstance(existing_kwd, str):
            existing_kwd = [existing_kwd]
        chunk_dict["important_kwd"] = existing_kwd + all_codes

    # Add regulatory refs for boosted search
    if codes["regulatory_refs"]:
        chunk_dict["regulatory_ref_kwd"] = codes["regulatory_refs"]

    # Add evidence level
    if codes["evidence_levels"]:
        chunk_dict["evidence_level_kwd"] = codes["evidence_levels"][0]

    return chunk_dict
```

#### Step 4: Integrate Enhancement into Clinical chunk()

Modify the existing `chunk()` function in `clinical.py`:

```python
# After base chunking, enhance each chunk:
for chunk_dict in res:
    enhance_clinical_chunk(chunk_dict)
```

### Part C: OpenSearch Schema Updates

#### Step 5: Add Custom Fields to Index Schema

**File**: Backend migration or OpenSearch index template

Add fields for domain-specific metadata:

```json
{
  "status_kwd": { "type": "keyword" },
  "section_ref_kwd": { "type": "keyword" },
  "regulatory_ref_kwd": { "type": "keyword" },
  "evidence_level_kwd": { "type": "keyword" }
}
```

These fields should be added dynamically when a KB uses the SDLC or clinical parser.

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `rag/app/sdlc.py` | SDLC document parser with req ID extraction |
| MODIFY | `rag/app/clinical.py` | Add medical code and regulatory ref extraction |
| MODIFY | `rag/svr/task_executor.py` | Register SDLC parser in parser registry |
| MODIFY | OpenSearch index template | Add domain-specific keyword fields |
| MODIFY | Backend KB model | Add `sdlc` to parser type enum |
| MODIFY | Frontend KB settings | Add SDLC parser option in dropdown |

---

## Expected Impact

### SDLC Documents

| Query Type | Before | After |
|-----------|--------|-------|
| "What is REQ-042?" | Keyword search, may miss | Direct lookup via `important_kwd` |
| "Show requirements with status Draft" | No filtering | Filter by `status_kwd` |
| "What tests cover REQ-042?" | Poor — no traceability | Graph RAG entity linking |
| "Requirements in Section 3.2" | Naive text match | Section ref metadata search |

### Healthcare Documents

| Query Type | Before | After |
|-----------|--------|-------|
| "What does ICD M54.5 mean?" | Generic text search | Direct code lookup |
| "HIPAA requirements for PHI" | Keyword match only | Regulatory ref boosted search |
| "Level I evidence for treatment X" | May miss | Evidence level metadata filter |
| "21 CFR Part 820 compliance" | Naive match | Regulatory ref exact match |

---

## Acceptance Criteria

- [ ] SDLC parser extracts requirement IDs with >95% precision
- [ ] Status/priority metadata is searchable and filterable
- [ ] Clinical parser extracts ICD/CPT codes correctly
- [ ] Regulatory references are preserved as searchable keywords
- [ ] Domain fields appear in OpenSearch without manual schema changes
- [ ] Existing naive parser behavior unchanged for non-domain docs
- [ ] End-to-end: "What is REQ-042?" returns the correct requirement chunk as top result
