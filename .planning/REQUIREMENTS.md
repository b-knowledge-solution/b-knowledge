# Requirements: B-Knowledge

**Defined:** 2026-04-02
**Core Value:** Unified AI knowledge management — one platform for document ingestion, RAG-powered search, and conversational AI with full control over parsing, chunking, and embedding.

## v0.2 Requirements

Requirements for v0.2 milestone: Knowledge Base Refactor & Quality.

### Rename (Project → Knowledge Base)

- [ ] **REN-01**: User sees "Knowledge Base" instead of "Project" across all UI pages, navigation, and labels (3 locales: en, vi, ja)
- [x] **REN-02**: All DB tables renamed (`projects` → `knowledge_base`, `project_*` → `knowledge_base_*`, all `project_id` FK columns → `knowledge_base_id`)
- [x] **REN-03**: All BE module files, routes, models renamed (`/api/projects/*` → `/api/knowledge-base/*`, module directory `modules/knowledge-base/`, barrel exports)
- [x] **REN-04**: All FE feature files, routes, components renamed (`/projects/:id` → `/knowledge-bases/:id`, feature directory, API layer)
- [x] **REN-05**: Python worker `ragflow_doc_meta_` prefix renamed to `knowledge_doc_meta_` in all connector files
- [ ] **REN-06**: All test files updated to use new naming, full test suite passes after rename

### Chunk Quality

- [ ] **CHUNK-01**: User can select table-aware chunking strategy for documents containing tables (adaptive row batching)
- [ ] **CHUNK-02**: User can select semantic chunking strategy that splits at topic boundaries using embedding similarity
- [ ] **CHUNK-03**: User can select recursive chunking strategy (hierarchy of separators: paragraph → line → sentence → word)
- [ ] **CHUNK-04**: System computes heuristic quality scores per chunk at ingestion (token count, TTR, dedup detection, truncation flag, language coherence)
- [ ] **CHUNK-05**: User can view chunk quality indicators on the chunk list UI (flagged chunks highlighted)
- [ ] **CHUNK-06**: Quality scores stored as OpenSearch metadata fields for future query-time filtering

### Permissions

- [ ] **PERM-01**: Admin can grant KB-level access to users/teams with Read/Write/Admin tier (first gate)
- [ ] **PERM-02**: Admin can grant category-level permissions (Documents, Code, Standard) with independent Read/Write/Admin per category
- [ ] **PERM-03**: KB creator has implicit Admin access; system super-admin/admin bypasses KB permissions
- [ ] **PERM-04**: Permission-aware retrieval filters OpenSearch search/chat results based on user's KB + category access
- [ ] **PERM-05**: User can view and manage permission grants in KB settings UI

### New KB Features

- [ ] **KB-01**: Placeholder for future Knowledge Base features (plans to be defined later)

## Future Requirements

Deferred to v0.3+. Tracked but not in current roadmap.

### Chunk Quality (Advanced)

- **CHUNK-F01**: LLM-based chunk quality scoring (coherence/completeness/density via LLM judge, opt-in per KB)
- **CHUNK-F02**: Parent-child (small-to-big) chunking strategy with hierarchical retrieval
- **CHUNK-F03**: Adaptive chunking (content-density aware, dynamic chunk sizing)
- **CHUNK-F04**: Chunk quality dashboard with admin UI for browsing, filtering, and re-chunking
- **CHUNK-F05**: Corrective RAG quality gate (filter low-quality chunks at retrieval time)

### Permissions (Advanced)

- **PERM-F01**: Document-level permission grants within a KB (per-document access control)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mobile app | Web-first approach |
| Self-hosted model training | Use external providers |
| API versioning for rename | No external API consumers, clean big-bang rename is sufficient |
| Expand-migrate-contract rename | Overkill for internal app with no published SDK |
| Per-chunk embedding model selection | Different models per chunk makes vector search incoherent; model set at KB level |
| Fine-grained field-level permissions | Over-engineering; if user can access a doc, they see all of it |
| Custom permission DSL/policy engine | Overkill for 3-tier RBAC; simple role-permission mapping via CASL |
| Real-time chunk quality scoring at query time | Too slow; score at ingestion, filter by threshold at query time |
| Automatic re-chunking without user approval | Silently re-chunking breaks existing references; provide manual trigger instead |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REN-01 | Phase 8 | Pending |
| REN-02 | Phase 7 | Complete |
| REN-03 | Phase 7 | Complete |
| REN-04 | Phase 8 | Complete |
| REN-05 | Phase 7 | Complete |
| REN-06 | Phase 8 | Pending |
| CHUNK-01 | Phase 10 | Pending |
| CHUNK-02 | Phase 10 | Pending |
| CHUNK-03 | Phase 10 | Pending |
| CHUNK-04 | Phase 10 | Pending |
| CHUNK-05 | Phase 10 | Pending |
| CHUNK-06 | Phase 10 | Pending |
| PERM-01 | Phase 9 | Pending |
| PERM-02 | Phase 9 | Pending |
| PERM-03 | Phase 9 | Pending |
| PERM-04 | Phase 9 | Pending |
| PERM-05 | Phase 9 | Pending |
| KB-01 | Phase 10 | Pending |

**Coverage:**
- v0.2 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-04-02*
*Last updated: 2026-04-02 after roadmap creation*
