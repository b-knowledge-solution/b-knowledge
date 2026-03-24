# ADR Parser — Detail Design

> **Module**: `advance-rag/rag/app/adr.py`
> **Parser Type**: `ParserType.ADR`
> **Category**: Developer Tools
> **Role**: Parser for Architecture Decision Records (Markdown)

---

## 1. Overview

The ADR Parser processes Architecture Decision Records — structured Markdown documents that capture important architectural decisions in software projects. It understands multiple ADR formats (MADR, Nygard, Y-statement) and produces section-based chunks with rich metadata (title, status, date, superseded-by references). Each canonical section (Context, Decision, Options, Consequences) becomes a separate chunk.

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Decision search** | Find past architectural decisions by topic or context |
| **Decision tracking** | Index all ADRs for a project to track decision history |
| **Onboarding** | New team members search ADRs to understand "why" decisions were made |
| **Impact analysis** | Find ADRs affected by proposed changes |
| **Compliance** | Verify decision documentation completeness |

---

## 3. Supported Formats

| Format | ADR Style | Detection |
|--------|-----------|-----------|
| Markdown | MADR (Markdown ADR) | Heading patterns (## Context, ## Decision, etc.) |
| Markdown | Nygard format | Section keywords (Context, Decision, Status, Consequences) |
| Markdown | Y-statement | "In the context of..." / "facing..." / "we decided..." / "to achieve..." |

---

## 4. Design

### 4.1 Architecture Diagram

```
                    ┌──────────────┐
                    │   chunk()    │
                    └──────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Parse Markdown         │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Extract metadata       │
              │  - Title (H1)           │
              │  - Status               │
              │  - Date                 │
              │  - Superseded-by refs   │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │  Detect ADR format      │
              │  (MADR / Nygard /       │
              │   Y-statement)          │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                  ▼
  ┌────────────┐   ┌────────────┐    ┌────────────┐
  │ MADR       │   │ Nygard     │    │ Y-statement│
  │ Section    │   │ Section    │    │ Quadrant   │
  │ headings   │   │ keywords   │    │ extraction │
  └─────┬──────┘   └─────┬──────┘    └─────┬──────┘
        │                 │                  │
        └─────────────────┼──────────────────┘
                          │
              ┌───────────▼───────────┐
              │  Map to canonical      │
              │  sections:             │
              │  - Context             │
              │  - Decision            │
              │  - Options             │
              │  - Consequences        │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  1 section = 1 chunk   │
              │  + metadata fields     │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  tokenize_chunks()    │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Return ADR chunks    │
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

### 5.1 Metadata Extraction

From the ADR document, the parser extracts:

| Field | Source | Example |
|-------|--------|---------|
| `adr_title` | First H1 heading | "ADR-042: Use PostgreSQL for primary storage" |
| `adr_status` | "Status:" line or metadata block | "accepted", "deprecated", "superseded" |
| `adr_date` | "Date:" line or metadata block | "2024-03-15" |
| `superseded_by` | "Superseded by:" reference | "ADR-058" |

### 5.2 MADR Format Detection

MADR uses standard Markdown headings:

```markdown
# ADR-042: Use PostgreSQL for Primary Storage

## Status
Accepted

## Context
We need a relational database that supports...

## Decision
We will use PostgreSQL 17 because...

## Consequences
### Good
- Strong ACID compliance
### Bad
- Requires more operational expertise
```

**Detection**: Regex patterns match heading text (case-insensitive):
- `## Context`, `## Background`, `## Problem`
- `## Decision`, `## Decided`, `## Resolution`
- `## Options`, `## Alternatives`, `## Considered Options`
- `## Consequences`, `## Implications`, `## Impact`

### 5.3 Nygard Format Detection

The original ADR format by Michael Nygard:

```markdown
# 42. Use PostgreSQL for Primary Storage

Date: 2024-03-15

## Status
Accepted

## Context
We need a relational database...

## Decision
We will use PostgreSQL...

## Consequences
Strong ACID compliance but more operational work...
```

**Detection**: Similar heading patterns, often with numbered title.

### 5.4 Y-Statement Format Detection

Y-statements follow a specific sentence structure:

```markdown
In the context of [situation],
facing [problem],
we decided [decision],
to achieve [goal],
accepting [tradeoff].
```

**Detection**: Scans for patterns starting with "In the context of", "facing", "we decided", "to achieve".

**Extraction**: Each quadrant maps to a canonical section:
- "In the context of..." → Context
- "we decided..." → Decision
- "to achieve..." → Consequences (positive)
- "accepting..." → Consequences (negative)

### 5.5 Section-per-Chunk Strategy

Each canonical section produces one chunk:

| Section | Chunk Content |
|---------|--------------|
| Context | Problem description, background, constraints |
| Decision | The chosen solution and rationale |
| Options | Alternatives that were considered |
| Consequences | Good and bad outcomes of the decision |

### 5.6 Metadata in Every Chunk

All chunks from the same ADR share the same metadata:

```python
{
    "content_with_weight": "Context: We need a relational database that supports JSONB columns...",
    "adr_title": "ADR-042: Use PostgreSQL for Primary Storage",
    "adr_status": "accepted",
    "adr_date": "2024-03-15",
    "superseded_by": None
}
```

This enables filtering:
- "Show me all accepted decisions"
- "Find deprecated ADRs"
- "What decisions were made about databases?"

---

## 6. Output Example

```python
# Context chunk
{
    "content_with_weight": "Context: We need a relational database for the B-Knowledge platform that supports complex queries, JSONB columns for flexible schema storage, and full-text search capabilities. The database must handle 10K+ concurrent connections and support horizontal read scaling.",
    "content_ltks": ["context", "relational", "database", "jsonb", "full-text", "search"],
    "docnm_kwd": "adr-042-use-postgresql.md",
    "title_tks": ["context", "postgresql", "primary", "storage"],
    "adr_title": "ADR-042: Use PostgreSQL for Primary Storage",
    "adr_status": "accepted",
    "adr_date": "2024-03-15",
    "superseded_by": None,
    "page_num_int": [0]
}

# Decision chunk
{
    "content_with_weight": "Decision: We will use PostgreSQL 17 as our primary database. Key factors: 1) Native JSONB support with GIN indexing, 2) pg_trgm extension for fuzzy text search, 3) Mature replication ecosystem (Patroni, pgBouncer), 4) Strong community and enterprise support.",
    "content_ltks": ["decision", "postgresql", "jsonb", "gin", "indexing", "replication"],
    "docnm_kwd": "adr-042-use-postgresql.md",
    "title_tks": ["decision", "postgresql"],
    "adr_title": "ADR-042: Use PostgreSQL for Primary Storage",
    "adr_status": "accepted",
    "adr_date": "2024-03-15",
    "page_num_int": [0]
}
```

---

## 7. Differences from Other Parsers

| Aspect | ADR | Naive (Markdown) | Manual |
|--------|-----|-------------------|--------|
| Structure detection | ADR-specific sections | Generic headings | DOCX headings |
| Metadata fields | adr_title, adr_status, adr_date | None | Section IDs |
| Format awareness | 3 ADR formats | None | None |
| Y-statement support | Yes | No | No |
| Chunk boundary | Canonical section | Token limit | Section boundary |

---

## 8. Error Handling

| Scenario | Behavior |
|----------|----------|
| No ADR sections detected | Falls back to naive markdown chunking |
| Missing status | adr_status set to None |
| Missing date | adr_date set to None |
| Mixed ADR format | Best-effort section matching |
| Non-ADR markdown | May produce partial/incorrect sections |
| Very long sections | Not split; one section = one chunk |

---

## 9. Dependencies

| Dependency | Purpose |
|------------|---------|
| `re` (stdlib) | Regex pattern matching for section detection |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |
