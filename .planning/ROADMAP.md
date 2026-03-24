# Roadmap — feature/rag-core

## Current Milestone: RAG Core Features

> Migrate and stabilize core RAG features from RAGFlow into b-knowledge, including advance-rag pipeline, datasets, chat, and search.

### Phase 1: Migrate latest RAGFlow upstream to b-knowledge

**Goal:** Merge latest RAGFlow upstream (c732a1c → df2cc32f5, 49 commits) into b-knowledge using selective copy (Option A), preserving all b-knowledge integration files.
**Requirements**: Upstream diff analysis, safe copy of pure RAGFlow dirs, manual merge of modified files, dependency updates, feature porting (EPUB, chunk images, deadlock retry), DB migrations if needed.
**Depends on:** None (standalone)
**Plans:** 5 plans

**Upstream:** RAGFlow local folder (nightly-4-gdf2cc32f5), 60 files changed, +2,697/-1,516 lines

Plans:
- [x] **01-01**: Tier 1 — Safe overwrite of pure RAGFlow directories (deepdoc/, rag/llm/, rag/nlp/, rag/prompts/, rag/utils/, rag/flow/, common/)
- [ ] **01-02**: Tier 2 — Manual merge of ~10-15 b-knowledge-modified RAGFlow files (rag/app/*.py, node_executor.py, task_executor.py, graphrag/*.py)
- [ ] **01-03**: Tier 3 — Integration layer updates (pyproject.toml deps, new EPUB parser registration, chunk image support)
- [ ] **01-04**: Tier 4 — Feature porting (aggregated parsing status, deadlock retry, PDF OCR fallback, similarity threshold bypass)
- [ ] **01-05**: Tier 5 — Validation & patch doc (test pipeline, run tests, create patches/ragflow-port-v<NEW>-df2cc32.md)

### Phase 2: Investigate mem0 for memory feature

**Goal:** Evaluate mem0 as a pluggable backend replacement for b-knowledge's native memory system. Produce a go/no-go Architecture Decision Record with empirical deal-breaker verification, extraction quality comparison, performance benchmarks, full API mapping, and integration plan.
**Requirements**: D-01 through D-26 (deal-breaker verification, API mapping, extraction quality, performance benchmarks, graph store evaluation, ADR document)
**Depends on:** Phase 1
**Plans:** 3 plans

Plans:
- [ ] **02-01**: Environment setup + deal-breaker verification — Install mem0, test OpenSearch/multi-tenant/custom LLM against live infrastructure, check Apache AGE on PG17
- [ ] **02-02**: Extraction quality + performance benchmarks — Compare extraction pipelines, measure add/search latency, test dedup/versioning/forgetting
- [ ] **02-03**: Write ADR document — Synthesize findings into Architecture Decision Record with go/no-go recommendation, API mapping, integration plan

### Phase 3: Refactor project feature - separate project creation, category management (documents/standard/code), and versioned datasets

**Goal:** Refactor the project feature from a 7-tab detail page into a streamlined 3-category-tab layout (Documents, Standard, Code) with settings sidebar. Add category_type discriminator to DB, implement type-aware dataset creation, simplify project list to create+navigate, and add Standard/Code category views with full i18n support.
**Requirements**: D-01 through D-09 (category type tabs, type-discriminated dataset creation, parser defaults, simplified list page, settings sidebar, version management, code parsing)
**Depends on:** Phase 2
**Plans:** 5 plans

Plans:
- [ ] **03-01**: DB migration + BE types + Zod schemas — Add category_type and dataset_id columns, update DocumentCategory interface, extend validation
- [ ] **03-02**: BE service logic — Type-discriminated category creation (auto-create dataset for standard/code), dataset cleanup on category deletion
- [ ] **03-03**: FE types + API + list page — Update FE types for category_type, simplify ProjectListPage to create+navigate only
- [ ] **03-04**: FE detail page refactor — 3 category tabs, CategorySidebar, ProjectSettingsSheet, updated CategoryModal
- [ ] **03-05**: FE content views + i18n — StandardCategoryView, CodeCategoryView, VersionList/VersionCard, all i18n keys in 3 locales

---

<!-- phases:start -->
<!-- phases:end -->
