# Roadmap: B-Knowledge RAG Platform

## Overview

B-Knowledge is a production-grade RAG platform migrated from RAGFlow and being evolved into a multi-tenant, access-controlled knowledge base for SDLC and healthcare organizations. The roadmap proceeds in a strict dependency order: stabilize the migrated pipeline first, then build security foundations (ABAC), then versioning, then advanced retrieval (GraphRAG, Deep Research) which depends on both. Multi-tenant project scoping and observability close out the milestone, layering on top of the completed security and retrieval foundations.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Migration Stabilization** - Fix known and discovered bugs in the RAG pipeline and user-facing chat/search experience
- [ ] **Phase 2: Access Control** - Implement org-level tenant isolation, RBAC, ABAC, document-level permissions, and audit logging
- [x] **Phase 3: Document Management** - Add document version history, metadata tagging, auto-extraction, and bulk operations (completed 2026-03-19)
- [ ] **Phase 4: Domain-Specific Parsers** - Add code-aware, API spec, ADR, and clinical document parsers for SDLC and healthcare corpora
- [ ] **Phase 5: Advanced Retrieval** - Wire GraphRAG and Deep Research pipelines with cross-dataset retrieval and cost controls
- [ ] **Phase 6: Projects and Observability** - Complete multi-tenant project scoping and surface RAG quality analytics

## Phase Details

### Phase 1: Migration Stabilization
**Goal**: The existing RAG pipeline and user-facing chat/search experience are production-reliable — users can create datasets, upload documents, parse and chunk them, and get accurate cited answers with no known bugs blocking normal use
**Depends on**: Nothing (first phase)
**Requirements**: STAB-01, STAB-02, STAB-03, STAB-04, STAB-05, CHAT-01, CHAT-02, CHAT-03
**Success Criteria** (what must be TRUE):
  1. User can create, update, and delete a knowledge base without error
  2. User can upload a document, select a parser, trigger parsing, and see chunks appear in the dataset with no silent failures
  3. User can trigger chunking and embedding and search results reflect the indexed content
  4. User can chat with an assistant and receive streamed, cited answers with working conversation history and no broken citation display
  5. User can perform a search and receive filtered, paginated results; user can submit a thumbs-up or thumbs-down on any answer
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — Set up Playwright E2E infrastructure; write and fix dataset CRUD tests (STAB-01, STAB-04)
- [ ] 01-02-PLAN.md — Write document upload and parsing E2E tests; fix pipeline bugs (STAB-02, STAB-05)
- [ ] 01-03-PLAN.md — Write chunk/embedding/indexing E2E tests; verify OpenSearch (STAB-03, STAB-04)
- [ ] 01-04-PLAN.md — Stabilize chat and search E2E; add answer feedback table and UI (CHAT-01, CHAT-02, CHAT-03)

### Phase 2: Access Control
**Goal**: Every user in the system operates within a strictly isolated org and project scope — access to documents, datasets, and retrieval results is enforced by role and attribute at both the API layer and the data (OpenSearch query) layer
**Depends on**: Phase 1
**Requirements**: ACCS-01, ACCS-02, ACCS-03, ACCS-04, ACCS-05, ACCS-06
**Success Criteria** (what must be TRUE):
  1. A user in Org A cannot access, search, or receive any content belonging to Org B — even via direct API call
  2. An admin can assign roles (super-admin, admin, leader, user) within their org; a user cannot mutate datasets or documents
  3. An attribute-based rule (e.g., "department=clinical sees clinical docs") correctly restricts which documents appear in chat and search results for that user
  4. Document permissions inherit from their parent dataset by default; an admin can override permissions on individual documents
  5. Every document access, search query, and generated answer is written to the audit log with user identity and timestamp
**Plans**: 7 plans

Plans:
- [ ] 02-00-PLAN.md — Wave 0 test scaffolds for ability service, tenant middleware, auth middleware (ACCS-01, ACCS-02, ACCS-03, ACCS-04)
- [ ] 02-01-PLAN.md — Consolidate SYSTEM_TENANT_ID reads into config; create access control schema migration (ACCS-01)
- [ ] 02-02-PLAN.md — Install CASL, build ability service with Valkey caching, evolve RBAC to 4 roles, create tenant middleware, add auth API endpoints (ACCS-01, ACCS-02)
- [ ] 02-03-PLAN.md — Add mandatory tenant_id filter on OpenSearch queries, update all callers; implement ABAC policy CRUD on datasets (ACCS-03, ACCS-04)
- [ ] 02-04-PLAN.md — Install CASL React, create AbilityProvider, RoleBadge, OrgSwitcher, permission-gated sidebar (ACCS-02)
- [ ] 02-05-PLAN.md — Build PolicyRuleEditor and RoleManagementTable UI components (ACCS-02, ACCS-03, ACCS-04)
- [ ] 02-06-PLAN.md — Create role assignment API, extend audit logging, add ABAC to project routes (ACCS-02, ACCS-05, ACCS-06)

### Phase 3: Document Management
**Goal**: Users can manage the full lifecycle of a document including uploading new versions, searching across version history, tagging documents with custom metadata, and having metadata extracted automatically during parsing
**Depends on**: Phase 2
**Requirements**: DOCM-01, DOCM-02, DOCM-03, DOCM-04, DOCM-05, DOCM-06
**Success Criteria** (what must be TRUE):
  1. User can upload a new version of an existing document; previous versions remain stored and searchable
  2. User can search specifically against historical document versions and get accurate results from those older chunks
  3. Each document version displays its author, upload timestamp, and change summary
  4. User can apply custom metadata tags to documents (e.g., sdlc_phase=design, department=clinical) that can be used to filter search results
  5. Metadata fields are automatically populated from document content during parsing; user can bulk-edit tags across multiple documents
**Plans**: 8 plans

Plans:
- [ ] 03-00-PLAN.md — Wave 0 test scaffolds: version-history and metadata-tagging test stubs (DOCM-01..06)
- [ ] 03-01-PLAN.md — BE version history: DB migration, version creation service, upload API endpoint (DOCM-01, DOCM-03)
- [ ] 03-02-PLAN.md — FE version UI: upload dialog, version badges, dataset card/overview extensions, i18n (DOCM-01, DOCM-03)
- [ ] 03-03-PLAN.md — Version-aware search with rank_feature boost, chunk detail page, three document viewer patterns (DOCM-02)
- [ ] 03-04-PLAN.md — BE metadata: bulk metadata API, tag aggregation endpoint, cron parsing scheduler (DOCM-04, DOCM-05, DOCM-06)
- [ ] 03-05-PLAN.md — FE metadata: parser settings, schema builder, bulk dialog, tag filter chips, cron UI, i18n (DOCM-04, DOCM-05, DOCM-06)
- [ ] 03-06-PLAN.md — Gap closure: custom version_label support (DB migration, BE service/API, FE dialog/badge) (DOCM-01, DOCM-03)
- [ ] 03-07-PLAN.md — Gap closure: dataset-aware FIFO parsing scheduler (DOCM-06)

### Phase 4: Domain-Specific Parsers
**Goal**: Documents from SDLC workflows (code files, API specs, ADRs) and healthcare corpora (clinical documents) are parsed into semantically meaningful chunks that preserve the structure unique to each document type
**Depends on**: Phase 3
**Requirements**: PRSR-01, PRSR-02, PRSR-03, PRSR-04
**Success Criteria** (what must be TRUE):
  1. A code file is chunked by function and class boundaries with import context preserved; searching for a function name returns the correct chunk
  2. An OpenAPI/Swagger spec is parsed into per-endpoint chunks; a user asking "how do I call the /users endpoint?" gets the correct request/response schema
  3. An ADR document is parsed with context, decision, and consequences sections as distinct chunk types; searching for "why we chose PostgreSQL" surfaces the decision section
  4. Uploading a clinical document triggers automatic classification into one of regulatory, protocol, research, or administrative categories
**Plans**: 3 plans

Plans:
- [ ] 04-01-PLAN.md — Infrastructure setup (deps, ParserType enum, FACTORY) + code-aware parser with tree-sitter AST chunking (PRSR-01)
- [ ] 04-02-PLAN.md — OpenAPI/Swagger endpoint parser + ADR template-aware section parser (PRSR-02, PRSR-03)
- [ ] 04-03-PLAN.md — Clinical document LLM classifier + FE registration of all four parser types (PRSR-04)

### Phase 5: Advanced Retrieval
**Goal**: Users can pose complex multi-hop questions that require reasoning across entities and relationships in a knowledge graph, and can trigger deep recursive research queries that retrieve iteratively — all with cross-dataset scope and hard cost controls
**Depends on**: Phase 2, Phase 3
**Requirements**: RETR-01, RETR-02, RETR-03, RETR-04, RETR-05, RETR-06, RETR-07
**Success Criteria** (what must be TRUE):
  1. A user can enable "Knowledge Graph" mode on an assistant; asking a multi-hop question (e.g., "What are the relationships between Project A dependencies and their known issues?") returns a graph-augmented answer that cites entity relationships
  2. Knowledge graph construction completes for a dataset and surfaces entity counts and community summaries in the Data Studio UI
  3. A user can enable "Deep Research" mode on an assistant; a complex question triggers recursive sub-queries and the user sees intermediate results streamed progressively before the final answer
  4. Deep Research respects a configurable per-tenant token budget — a query that would exceed the cap truncates gracefully with a partial answer rather than failing or running uncapped
  5. Cross-dataset search across multiple authorized knowledge bases returns results that respect ABAC rules — a user cannot receive chunks from a KB they are not authorized to access
**Plans**: TBD

Plans:
- [ ] 05-01: Wire GraphRAG indexing pipeline — backend service integration, task type routing, entity resolution as auditable stage (RETR-01, RETR-02)
- [ ] 05-02: Wire GraphRAG retrieval — graph+vector hybrid retrieval at query time, assistant toggle in Data Studio (RETR-03)
- [ ] 05-03: Wire Deep Research pipeline — recursive query decomposition, SSE streaming of intermediate results (RETR-04, RETR-05)
- [ ] 05-04: Implement cross-dataset retrieval with ABAC enforcement; add token budget and call limits for Deep Research (RETR-06, RETR-07)

### Phase 6: Projects and Observability
**Goal**: SDLC teams can organize knowledge bases into access-controlled projects with team-scoped membership, and platform administrators can view query analytics and RAG quality metrics that surface retrieval gaps and answer quality trends
**Depends on**: Phase 2, Phase 5
**Requirements**: PROJ-01, PROJ-02, PROJ-03, PROJ-04, OBSV-01, OBSV-02, OBSV-03
**Success Criteria** (what must be TRUE):
  1. An org admin can create a project, bind datasets to it, and add/remove team members with project-scoped roles
  2. A project member can search and chat within their project's bound datasets and cannot access datasets bound to other projects they are not a member of
  3. A user with cross-project access can search across multiple authorized projects in a single query
  4. An admin can view a query analytics dashboard showing most common queries, failed retrievals, and low-confidence answer rates
  5. Answer feedback (thumbs up/down) is aggregated and visible in the RAG quality dashboard alongside retrieval precision metrics
**Plans**: TBD

Plans:
- [ ] 06-01: Complete project CRUD backend and Data Studio UI — create, update, delete projects (PROJ-01)
- [ ] 06-02: Implement project-dataset binding and project member management with roles (PROJ-02, PROJ-03)
- [ ] 06-03: Implement cross-project search with ABAC enforcement for authorized users (PROJ-04)
- [ ] 06-04: Build query analytics dashboard — most common queries, failed retrievals, low-confidence rates (OBSV-01)
- [ ] 06-05: Build RAG quality metrics dashboard; wire answer feedback aggregation into quality signals (OBSV-02, OBSV-03)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Migration Stabilization | 4/4 | Complete |  |
| 2. Access Control | 6/7 | In Progress|  |
| 3. Document Management | 8/8 | Complete   | 2026-03-19 |
| 4. Domain-Specific Parsers | 0/3 | Not started | - |
| 5. Advanced Retrieval | 0/4 | Not started | - |
| 6. Projects and Observability | 0/5 | Not started | - |

---
*Roadmap created: 2026-03-18*
*Last updated: 2026-03-19 after Phase 4 planning*
