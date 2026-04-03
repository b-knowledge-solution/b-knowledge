# Phase 7: DB + BE + Python Rename - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Phase:** 07-db-be-python-rename
**Areas discussed:** Naming conventions, Migration strategy, ragflow_ prefix cleanup, Related entity scope

---

## Naming Conventions

### Main Table Name

| Option | Description | Selected |
|--------|-------------|----------|
| knowledge_bases | Plural, matches convention: agents, datasets, users | |
| knowledge_base | Singular (like RAGFlow's 'knowledgebase') | ✓ |
| kb | Short form, compact but less readable | |

**User's choice:** knowledge_base (singular)
**Notes:** Matches RAGFlow convention

### FK Column Prefix

| Option | Description | Selected |
|--------|-------------|----------|
| kb_id | Short: kb_id, kb_categories, kb_permissions | |
| knowledge_base_id | Full: knowledge_base_id. Verbose but explicit | ✓ |
| knowledgebase_id | No separator (RAGFlow style) | |

**User's choice:** knowledge_base_id (full, explicit)

### BE Module/Route Naming

| Option | Description | Selected |
|--------|-------------|----------|
| knowledge-base (singular) | Dir: modules/knowledge-base/, Route: /api/knowledge-base | ✓ |
| knowledge-bases (plural) | Dir: modules/knowledge-bases/, Route: /api/knowledge-bases | |

**User's choice:** knowledge-base (singular)

---

## Migration Strategy

### Atomic vs Staged

| Option | Description | Selected |
|--------|-------------|----------|
| Single atomic migration (Recommended) | One migration renames all tables + columns at once | ✓ |
| Staged migrations | Separate migrations per table group | |
| You decide | Claude picks based on technical trade-offs | |

**User's choice:** Single atomic migration

### Knex Bug Workaround

| Option | Description | Selected |
|--------|-------------|----------|
| Use knex.raw() for all renames | Safe: raw ALTER TABLE RENAME preserves all constraints | ✓ |
| You decide | Claude evaluates per-column | |

**User's choice:** Use knex.raw() for all renames

---

## ragflow_ Prefix Cleanup

### New Prefix

| Option | Description | Selected |
|--------|-------------|----------|
| knowledge_doc_meta_ | Consistent with existing knowledge_ OpenSearch prefix | ✓ |
| kb_doc_meta_ | Shorter, matches kb_ pattern | |
| You decide | Claude picks based on consistency | |

**User's choice:** knowledge_doc_meta_

---

## Related Entity Scope

### Table Rename Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Rename ALL to knowledge_base_* | All project_* tables get full knowledge_base_* names | ✓ |
| Rename ALL to kb_* | Shorter names | |
| Core only + defer rest | Only rename projects, permissions tables | |

**User's choice:** Rename ALL to knowledge_base_*

### document_categories Rename

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as document_categories | Already generic, not project-specific | ✓ |
| Rename to kb_categories | More consistent with KB ownership | |
| You decide | Claude evaluates reference count | |

**User's choice:** Keep as document_categories (avoid unnecessary churn)

---

## Claude's Discretion

- Index and constraint naming in the migration
- Order of operations within the atomic migration
- ModelFactory registration approach
- Test strategy for completeness verification
- Barrel export updates in shared/models/

## Deferred Ideas

None — discussion stayed within phase scope.
