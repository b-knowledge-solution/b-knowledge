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
| 1. Migration Stabilization | v1.0 | 4/4 | Complete | 2026-03-18 |
| 2. Access Control | v1.0 | 7/7 | Complete | 2026-03-18 |
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
**Plans:** 10 plans

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

---
*Roadmap created: 2026-03-18*
*v1.0 shipped: 2026-03-19*
