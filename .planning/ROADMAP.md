# Roadmap: B-Knowledge RAG Platform

## Milestones

- ✅ **v1.0 B-Knowledge RAG Platform** — Phases 1-7 (shipped 2026-03-19)

## Phases

<details>
<summary>✅ v1.0 (Phases 1-7) — SHIPPED 2026-03-19</summary>

- [x] Phase 1: Migration Stabilization (4 plans) — E2E tests, pipeline bug fixes, chat/search stabilization
- [x] Phase 2: Access Control (7 plans) — CASL ABAC, 4-role RBAC, tenant isolation, audit logging
- [x] Phase 3: Document Management (8 plans) — versioning, metadata tagging, chunk viewers, cron scheduler
- [x] Phase 4: Domain-Specific Parsers (3 plans) — code (tree-sitter), OpenAPI, ADR, clinical classifier
- [x] Phase 5: Advanced Retrieval (4 plans) — GraphRAG, Deep Research, cross-dataset search, language detection
- [x] Phase 6: Projects and Observability (5 plans) — project management, query analytics, RAG quality dashboard
- [x] Phase 7: Milestone Gap Closure (2 plans) — document viewer wiring, Deep Research progress, ABAC filter fix

</details>

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Migration Stabilization | 6/10 | In Progress|  | 2026-03-18 |
| 2. Access Control | v1.0 | 2/6 | In Progress|  |
| 3. Document Management | v1.0 | 8/8 | Complete | 2026-03-19 |
| 4. Domain-Specific Parsers | v1.0 | 3/3 | Complete | 2026-03-19 |
| 5. Advanced Retrieval | v1.0 | 4/4 | Complete | 2026-03-19 |
| 6. Projects and Observability | v1.0 | 5/5 | Complete | 2026-03-19 |
| 7. Milestone Gap Closure | v1.0 | 2/2 | Complete | 2026-03-19 |

**Total: 7 phases, 33 plans — all complete**

### Phase 1: Migrate agent features from RAGFlow to B-Knowledge

**Goal:** Full parity migration of RAGFlow's agent/workflow system into B-Knowledge — visual ReactFlow canvas builder, 23 operators, 23 tools, 24 templates, hybrid Node.js/Python execution engine, debug mode, versioning, webhooks, MCP integration, sandbox code execution, embeddable widgets, and ABAC access control.
**Requirements**: AGENT-DATA-MODEL, AGENT-FE-FOUNDATION, AGENT-CRUD-API, AGENT-LIST-UI, AGENT-CANVAS-UI, AGENT-EXECUTION-ENGINE, AGENT-DEBUG-MODE, AGENT-VERSIONING-WEBHOOKS-TEMPLATES, AGENT-MCP-SANDBOX-TOOLS, AGENT-EMBED-ABAC-FORMS
**Depends on:** v1.0 milestone
**Plans:** 6/10 plans executed

Plans:
- [ ] 01-01-PLAN.md — Database schema + Knex models (agents, runs, steps, credentials, templates)
- [ ] 01-02-PLAN.md — FE foundation (types, Zustand canvas store, query keys, dependencies)
- [ ] 01-03-PLAN.md — BE Agent CRUD API (service, controller, routes, Zod schemas, versioning)
- [ ] 01-04-PLAN.md — FE Agent list page (API layer, card grid, templates, sidebar nav, i18n)
- [ ] 01-05-PLAN.md — Canvas UI (ReactFlow wrapper, CanvasNode, NodePalette, toolbar, config panel)
- [ ] 01-06-PLAN.md — Execution engine (graph orchestrator, Redis dispatch, Python consumer)
- [ ] 01-07-PLAN.md — Debug mode (step-by-step execution, Socket.IO events, debug panel UI)
- [ ] 01-08-PLAN.md — Versioning UI, webhooks, run history, 24 template seeds
- [ ] 01-09-PLAN.md — MCP integration, Docker sandbox, tool credentials, Tavily/Wikipedia tools
- [ ] 01-10-PLAN.md — Embed widgets, ABAC enforcement, 5 core operator forms

### Phase 2: Migration memory feature from RAGFlow to B-Knowledge

**Goal:** Full parity migration of RAGFlow's memory system — 4 memory types (Raw/Semantic/Episodic/Procedural) via bitmask, OpenSearch storage with hybrid vector+text search, LLM-powered extraction pipeline with configurable prompts, FIFO forgetting, chat auto-save/inject integration, agent canvas Memory operator node, chat history import, and management UI (pool list, message browser, settings panel).
**Requirements**: MEM-SCHEMA, MEM-CRUD-API, MEM-MESSAGES, MEM-EXTRACTION, MEM-CHAT-INTEGRATION, MEM-AGENT-INTEGRATION, MEM-FE-TYPES, MEM-LIST-UI, MEM-DETAIL-UI, MEM-IMPORT, MEM-SIDEBAR-NAV
**Depends on:** Phase 1
**Plans:** 2/6 plans executed

Plans:
- [x] 02-01-PLAN.md — Database migration + Knex model + Zod schemas + extraction prompts + FE types
- [x] 02-02-PLAN.md — BE memory service + message service (OpenSearch) + controller + routes
- [x] 02-03-PLAN.md — FE API layer + Memory list page + sidebar nav + routing + i18n
- [x] 02-04-PLAN.md — Memory extraction pipeline + chat integration (auto-save/inject)
- [x] 02-05-PLAN.md — FE detail page (message browser + settings panel + import dialog)
- [x] 02-06-PLAN.md — Agent Memory operator (Python handlers + canvas form) + import endpoint

### Phase 3: Standardize UUID generation between advance-rag and backend

**Goal:** Standardize all advance-rag UUID generation from UUID1 (time+MAC based) to UUID4 (random) to match the Node.js backend, eliminating MAC address leakage and cross-service UUID version mismatch. Python-only changes — no data migration, no BE modifications.
**Requirements**: UUID-STD-01, UUID-STD-02, UUID-STD-03
**Depends on:** Phase 2
**Plans:** 1 plan

Plans:
- [x] 03-01-PLAN.md — Switch get_uuid() to UUID4, replace html_parser uuid1 calls, add validation tests

---
*Roadmap created: 2026-03-18*
*v1.0 shipped: 2026-03-19*
