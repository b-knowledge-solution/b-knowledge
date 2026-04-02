# Roadmap: B-Knowledge

## Milestones

- ✅ **v0.1 Document Upload Pipeline** - Phases 1-6 (shipped)
- 🚧 **v0.2 Knowledge Base Refactor & Quality** - Phases 7-10 (in progress)

## Phases

<details>
<summary>v0.1 Document Upload Pipeline & v1.0 RAG Core (Phases 1-6) - SHIPPED</summary>

### Phase 1: Migrate latest RAGFlow upstream to b-knowledge

**Goal:** Merge latest RAGFlow upstream (49 commits) into b-knowledge using selective copy, preserving all b-knowledge integration files.
**Plans**: 5 plans

Plans:
- [x] 01-01: Tier 1 -- Safe overwrite of pure RAGFlow directories
- [x] 01-02: Tier 2 -- Manual merge of b-knowledge-modified RAGFlow files
- [x] 01-03: Tier 3 -- Integration layer updates
- [x] 01-04: Tier 4 -- Feature porting
- [x] 01-05: Tier 5 -- Validation & patch doc

### Phase 2: Investigate mem0 for memory feature

**Goal:** Evaluate mem0 as a pluggable backend replacement for b-knowledge's native memory system. Produce a go/no-go ADR.
**Plans**: 3 plans

Plans:
- [x] 02-01: Environment setup + deal-breaker verification
- [x] 02-02: Extraction quality + performance benchmarks
- [x] 02-03: Write ADR document

### Phase 3: Refactor project feature - 3-category tabs

**Goal:** Refactor project feature from 7-tab detail page into streamlined 3-category-tab layout (Documents, Standard, Code).
**Plans**: 5 plans

Plans:
- [x] 03-01: DB migration + BE types + Zod schemas
- [x] 03-02: BE service logic
- [x] 03-03: FE types + API + list page
- [x] 03-04: FE detail page refactor
- [x] 03-05: FE content views + i18n

### Phase 4: Code-Graph-RAG - Tree-sitter Knowledge Graph and Code RAG API

**Goal:** Enhance code parser with full Code-Graph-RAG pipeline: Memgraph, 12-language parsers, graph API, visualization UI, Code tab redesign.
**Plans**: 6 plans

Plans:
- [x] 04-01: Memgraph Infrastructure Setup
- [x] 04-02: Code Graph Parser Pipeline
- [x] 04-03: Task Executor Integration + Tests
- [x] 04-04: Node.js Code-Graph API
- [x] 04-05: Frontend Graph Visualization
- [x] 04-06: Code Tab UI Redesign

### Phase 5: Assistant response evaluation

**Goal:** Add assistant response evaluation (thumb up/down with comment) to chat, search, and agent runs. Enhance admin Histories page.
**Plans**: 5 plans

Plans:
- [x] 05-01: DB migration + BE feedback APIs
- [x] 05-02: FE FeedbackCommentPopover
- [x] 05-03: FE Histories enhancements
- [x] 05-04: FE Dashboard verification
- [x] 05-05: Fix review findings

### Phase 6: Prompt builder for chat

**Goal:** Integrate glossary-based PromptBuilderModal into chat interface.
**Plans**: 2 plans

Plans:
- [x] 06-01: Move PromptBuilderModal to shared + ChatInput forwardRef
- [x] 06-02: ChatPage integration + i18n

</details>

### v0.2 Knowledge Base Refactor & Quality (In Progress)

**Milestone Goal:** Rename "Project" to "Knowledge Base" across the entire app, enhance chunk data quality with advanced strategies and scoring, add a 3-tier permission system, and prepare extensibility for future KB features.

- [ ] **Phase 7: DB + BE + Python Rename** - Rename database schema, backend module, Python worker prefixes from "Project" to "Knowledge Base"
- [ ] **Phase 8: Frontend Rename** - Rename all FE files, routes, components, i18n from "Project" to "Knowledge Base"; verify full test suite
- [ ] **Phase 9: Permission System** - 3-tier KB-level and category-level permissions with permission-aware retrieval
- [ ] **Phase 10: Chunk Quality Pipeline** - Advanced chunking strategies, heuristic quality scoring, quality UI indicators

## Phase Details

### Phase 7: DB + BE + Python Rename
**Goal**: All backend layers reference "Knowledge Base" instead of "Project" -- database schema, BE module, API routes, Python worker models and prefixes are fully renamed with zero data loss
**Depends on**: Nothing (first phase of v0.2)
**Requirements**: REN-02, REN-03, REN-05
**Success Criteria** (what must be TRUE):
  1. Database tables are renamed (`projects` -> `knowledge_base`, all `project_*` -> `knowledge_base_*`, all `project_id` FK columns -> `knowledge_base_id`) and the application starts without errors
  2. Backend API serves routes at `/api/knowledge-base/*` and the old `/api/projects/*` routes no longer exist
  3. Python worker models reference renamed tables and all `ragflow_doc_meta_` prefixes are replaced with `knowledge_doc_meta_`
  4. TypeScript backend build passes with zero `project`-named imports in the knowledge-base module
**Plans**: 3 plans

Plans:
- [x] 07-01-PLAN.md -- DB migration + Python prefix cleanup
- [x] 07-02-PLAN.md -- BE module directory/file rename with content updates
- [x] 07-03-PLAN.md -- Shared code + agents module updates + build verification

### Phase 8: Frontend Rename
**Goal**: Users see "Knowledge Base" everywhere in the UI -- all pages, navigation, labels, URLs, and i18n strings reflect the new naming across all 3 locales
**Depends on**: Phase 7
**Requirements**: REN-01, REN-04, REN-06
**Success Criteria** (what must be TRUE):
  1. User sees "Knowledge Base" (not "Project") on every page, navigation item, breadcrumb, and label in English, Vietnamese, and Japanese
  2. Browser URL paths use `/knowledge-base/` instead of `/projects/`
  3. FE feature directory is renamed and all TanStack Query keys reference new entity names
  4. Full test suite (BE + FE) passes after rename with zero grep hits for stale `project` references in active code
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md -- Core feature directory rename + types + API + query keys + routes
- [x] 08-02-PLAN.md -- i18n key rename (3 locales) + cross-feature reference updates
- [ ] 08-03-PLAN.md -- Test file rename + full suite verification + stale reference audit

### Phase 9: Permission System
**Goal**: Admins can control who accesses each Knowledge Base and at what level, with permissions enforced across UI, API, and search retrieval
**Depends on**: Phase 7
**Requirements**: PERM-01, PERM-02, PERM-03, PERM-04, PERM-05
**Success Criteria** (what must be TRUE):
  1. Admin can grant a user or team Read, Write, or Admin access to a specific Knowledge Base
  2. Admin can set independent Read/Write/Admin permissions per category (Documents, Code, Standard) within a KB
  3. KB creator has implicit Admin access; system super-admin and admin roles bypass KB-level permissions entirely
  4. Search and chat results are filtered by the requesting user's KB and category permissions -- unauthorized KB content never appears
  5. User can view and manage permission grants from the KB settings UI
**Plans**: TBD
**UI hint**: yes

### Phase 10: Chunk Quality Pipeline
**Goal**: Users have access to advanced chunking strategies and can see quality indicators on their chunks, improving RAG retrieval quality
**Depends on**: Phase 7
**Requirements**: CHUNK-01, CHUNK-02, CHUNK-03, CHUNK-04, CHUNK-05, CHUNK-06, KB-01
**Success Criteria** (what must be TRUE):
  1. User can select from table-aware, semantic, and recursive chunking strategies when configuring a document's parser
  2. System computes heuristic quality scores (token count, TTR, dedup, truncation, language coherence) for every chunk at ingestion time
  3. User can see quality indicators (score badges, flagged chunk highlighting) on the chunk list UI
  4. Quality scores are stored as OpenSearch metadata fields and available for future query-time filtering
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10
Note: Phases 8, 9, and 10 all depend on Phase 7 but are independent of each other.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. RAGFlow Merge | v0.1 | 5/5 | Complete | - |
| 2. mem0 Evaluation | v0.1 | 3/3 | Complete | - |
| 3. Project Refactor | v0.1 | 5/5 | Complete | - |
| 4. Code-Graph-RAG | v0.1 | 6/6 | Complete | - |
| 5. Response Evaluation | v0.1 | 5/5 | Complete | - |
| 6. Prompt Builder | v0.1 | 2/2 | Complete | - |
| 7. DB + BE + Python Rename | v0.2 | 0/3 | Not started | - |
| 8. Frontend Rename | v0.2 | 2/3 | In Progress|  |
| 9. Permission System | v0.2 | 0/? | Not started | - |
| 10. Chunk Quality Pipeline | v0.2 | 0/? | Not started | - |
