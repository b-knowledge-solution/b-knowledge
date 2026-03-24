# SDLC Checklist Parser — Detail Design

> **Module**: `advance-rag/rag/app/sdlc_checklist.py`
> **Parser Type**: `ParserType.SDLC_CHECKLIST`
> **Category**: Developer Tools
> **Role**: Parser for Software Development Life Cycle compliance checklists

---

## 1. Overview

The SDLC Checklist Parser processes development compliance checklists across 8 SDLC phases. It understands GitHub-style checkboxes, priority levels, and assignee annotations. Each checklist item becomes a separate chunk with rich metadata (phase, status, priority, assignee), enabling filtered queries like "show all incomplete security review items assigned to @john".

---

## 2. Use Cases

| Use Case | Description |
|----------|-------------|
| **Compliance tracking** | Track SDLC compliance checklist completion |
| **Code review checklists** | Structured review checklists per PR/release |
| **Security audits** | Security review checklists with assignee tracking |
| **Release readiness** | Pre-release verification checklists |
| **Sprint retrospectives** | Action items tracked as checklist items |
| **QA test plans** | Test case checklists with status tracking |

---

## 3. Supported Formats

| Format | Detection Method | Notes |
|--------|-----------------|-------|
| Markdown | GitHub-style checkboxes (`- [ ]`, `- [x]`, `- [~]`) | Primary format |
| Excel (XLSX/XLS) | Columns: item, status, phase, priority, assignee | Structured format |
| CSV | Same columns as Excel | Text-based |
| TXT | Tab-delimited with same columns | Minimal format |
| PDF | Text extraction → checkbox detection | Extracted text |
| DOCX | Text extraction → checkbox detection | Extracted text |

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
              └────┬──────────────┬─────┘
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │  Markdown Path        │  │  Excel/CSV/       │
    │                       │  │  TXT Path         │
    └──────────────┬────────┘  └─┬────────────────┘
                   │              │
    ┌──────────────▼────────┐  ┌─▼────────────────┐
    │ Parse checkboxes      │  │ Read columns:    │
    │ - [ ] → pending       │  │ item, status,    │
    │ - [x] → done          │  │ phase, priority, │
    │ - [~] → skipped       │  │ assignee         │
    │                       │  │                  │
    │ Detect inline:        │  │                  │
    │ - Priority (P0-P4)    │  │                  │
    │ - Assignee (@user)    │  │                  │
    │ - Phase heading       │  │                  │
    └──────────────┬────────┘  └─┬────────────────┘
                   │              │
                   └──────┬───────┘
                          │
              ┌───────────▼───────────┐
              │  Phase Detection      │
              │  (8 SDLC phases)      │
              │  heading or LLM       │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  1 item = 1 chunk     │
              │  with metadata fields │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  tokenize_chunks()    │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │  Return checklist     │
              │  item chunks          │
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

### 5.1 Eight SDLC Phases

The parser recognizes 8 standard SDLC phases:

| Phase ID | Phase Name | Description |
|----------|-----------|-------------|
| `requirements` | Requirements | Requirements gathering and analysis |
| `design_review` | Design Review | Architecture and design review |
| `code_review` | Code Review | Code review and quality checks |
| `testing` | Testing | Unit, integration, and system testing |
| `security` | Security | Security review and vulnerability assessment |
| `deployment` | Deployment | Deployment procedures and verification |
| `uat` | UAT | User Acceptance Testing |
| `maintenance` | Maintenance | Post-deployment maintenance tasks |

### 5.2 Markdown Checkbox Parsing

GitHub-style checkboxes are parsed:

```markdown
## Security Review

- [x] P0 @alice Run SAST scan on all modules
- [ ] P1 @bob Review authentication flow for OWASP Top 10
- [~] P2 @charlie Check rate limiting configuration (skipped - not applicable)
- [ ] P0 @alice Verify SSL certificate chain
```

**Checkbox states**:
| Syntax | Status | Meaning |
|--------|--------|---------|
| `- [ ]` | `pending` | Not yet completed |
| `- [x]` | `done` | Completed |
| `- [~]` | `skipped` | Intentionally skipped |

### 5.3 Inline Metadata Extraction

Within each checklist line, the parser detects:

**Priority** (regex pattern):
- `P0` → Critical (priority_int: 0)
- `P1` → High (priority_int: 1)
- `P2` → Medium (priority_int: 2)
- `P3` → Low (priority_int: 3)
- `P4` → Minimal (priority_int: 4)

**Assignee** (regex pattern):
- `@username` → Extracted as assignee
- `assigned:Name` → Alternative format

### 5.4 Phase Detection

Phases are detected from:
1. **Markdown headings**: `## Security Review` → `security` phase
2. **Excel column**: Explicit `phase` column value
3. **LLM classification** (optional): If no phase is detected, the configured CHAT LLM can auto-classify the item into one of the 8 phases

### 5.5 Excel/CSV Processing

Spreadsheet format expects columns:

| item | status | phase | priority | assignee |
|------|--------|-------|----------|----------|
| Run SAST scan | done | security | P0 | alice |
| Review auth flow | pending | security | P1 | bob |

Columns are matched by header name (case-insensitive, flexible naming).

### 5.6 Item-per-Chunk Strategy

Each checklist item produces exactly one chunk:

```python
{
    "content_with_weight": "Run SAST scan on all modules",
    "sdlc_phase_kwd": "security",
    "checklist_status_kwd": "done",
    "priority_int": 0,
    "assignee_tks": ["alice"],
    ...
}
```

---

## 6. Output Example

```python
# Pending security item
{
    "content_with_weight": "Review authentication flow for OWASP Top 10 vulnerabilities including injection, broken auth, sensitive data exposure",
    "content_ltks": ["review", "authentication", "flow", "owasp", "top", "vulnerabilities"],
    "content_sm_ltks": ["rev", "aut", "flo", ...],
    "docnm_kwd": "release-checklist-v2.4.md",
    "title_tks": ["security", "review"],
    "sdlc_phase_kwd": "security",
    "checklist_status_kwd": "pending",
    "priority_int": 1,
    "assignee_tks": ["bob"],
    "page_num_int": [0]
}

# Completed deployment item
{
    "content_with_weight": "Verify database migration runs successfully on staging environment",
    "content_ltks": ["verify", "database", "migration", "staging", "environment"],
    "docnm_kwd": "release-checklist-v2.4.md",
    "sdlc_phase_kwd": "deployment",
    "checklist_status_kwd": "done",
    "priority_int": 0,
    "assignee_tks": ["alice"],
    "page_num_int": [0]
}
```

---

## 7. Query Examples

The rich metadata enables powerful filtered queries:

| Query | Filter |
|-------|--------|
| "Show all pending security items" | `sdlc_phase_kwd=security AND checklist_status_kwd=pending` |
| "What's assigned to Alice?" | `assignee_tks=alice` |
| "Critical items not done" | `priority_int=0 AND checklist_status_kwd!=done` |
| "All deployment tasks" | `sdlc_phase_kwd=deployment` |
| "Skipped items in this release" | `checklist_status_kwd=skipped` |

---

## 8. Differences from Other Parsers

| Aspect | SDLC Checklist | QA | Tag | Table |
|--------|---------------|-----|-----|-------|
| Structure | Checklist items | Q&A pairs | Content + tags | Rows with columns |
| Metadata fields | phase, status, priority, assignee | None | tag_kwd | Typed columns |
| Checkbox parsing | Yes | No | No | No |
| Phase classification | 8 SDLC phases | N/A | N/A | N/A |
| LLM classification | Optional (phase detection) | No | No | No |

---

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| No checkboxes detected | Falls back to paragraph-level chunking |
| No phase heading | Phase set to None (or LLM-classified) |
| No priority annotation | priority_int defaults to None |
| No assignee annotation | assignee_tks empty |
| Mixed checkbox and non-checkbox content | Only checkbox items produce chunks |
| LLM classification fails | Phase remains None |

---

## 10. Dependencies

| Dependency | Purpose |
|------------|---------|
| `re` (stdlib) | Regex for checkbox, priority, assignee detection |
| `deepdoc/parser/excel_parser.py` | Excel/CSV parsing |
| `LLMBundle` | Optional CHAT model for phase auto-classification |
| `rag/nlp/rag_tokenizer.py` | Text tokenization |
