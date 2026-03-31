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
**Plans:** 1/3 plans executed

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

### Phase 4: Enhance code parser with Code-Graph-RAG - Tree-sitter Knowledge Graph and Code RAG API

**Goal:** Enhance the code parser with a full Code-Graph-RAG pipeline: add Memgraph graph DB to infrastructure, port all 12-language parsers from code-graph-rag (StructureProcessor, ImportProcessor, DefinitionProcessor, TypeInferenceEngine, CallProcessor), store code knowledge graph in Memgraph with Cypher support, add Node.js API for graph queries via Bolt protocol with AI NL-to-Cypher translation, and provide an interactive graph visualization UI.
**Requirements**: Memgraph infrastructure, 12-language parser pipeline, code graph extraction from AST, deep cross-file relationship detection, Node.js Bolt API, AI Cypher generation, code snippet retrieval, reference-guided optimization, graph visualization with PNG/SVG/JSON export
**Depends on:** Phase 3
**Plans:** 5 plans in 5 waves

Plans:
- [ ] **04-01**: Memgraph Infrastructure Setup — Docker service, env vars, neo4j driver
- [ ] **04-02**: Code Graph Parser Pipeline — Port all code-graph-rag parsers (30+ files, 12 languages), pipeline interface in code.py
- [ ] **04-03**: Task Executor Integration + Tests — Wire chunk_with_graph() into pipeline, 10+ unit tests
- [ ] **04-04**: Node.js Code-Graph API — Express module, Memgraph Bolt queries, AI NL-to-Cypher, code snippets
- [ ] **04-05**: Frontend Graph Visualization — Interactive graph page, node details, PNG/SVG/JSON export

### Phase 5: Assistant response evaluation with thumb up/down on chat and search, admin histories page in agent studio

**Goal:** Add assistant response evaluation (thumb up/down with optional comment) to chat, search, and agent run results. Enhance the admin Histories page with feedback indicators, filters, Agent Runs tab, and CSV export. Verify Dashboard "Response Quality" section includes agent feedback data.
**Requirements**: EVAL-01 (thumb-down comment popover), EVAL-02 (agent run feedback), EVAL-03 (histories feedback enhancements), EVAL-04 (dashboard response quality), EVAL-05 (feedback export)
**Depends on:** Phase 4
**Plans:** 4/4 plans complete

Plans:
- [ ] **05-01**: DB migration + BE feedback APIs — Extend source constraint for 'agent', add list/stats/export endpoints
- [ ] **05-02**: FE FeedbackCommentPopover — Shared thumb-down comment popover, integrate into ChatMessage, SearchResultCard, RunHistorySheet
- [ ] **05-03**: FE Histories enhancements — Feedback indicators, filter, Agent Runs tab, CSV export, BE admin-history enrichment
- [ ] **05-04**: FE Dashboard verification — Enhance feedback components for agent source visibility

---

<!-- phases:start -->
<!-- phases:end -->
