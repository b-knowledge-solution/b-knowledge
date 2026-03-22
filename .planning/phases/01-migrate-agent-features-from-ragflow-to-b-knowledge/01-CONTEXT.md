# Phase 1: Migrate Agent Features from RAGFlow to B-Knowledge - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate RAGFlow's complete agent/workflow system into B-Knowledge. This includes: the visual canvas builder (ReactFlow), all 23 operator/component types, all 23 external tools, 24 pre-built templates, agent + pipeline execution modes, debug/test panel, webhook triggers, agent versioning, MCP integration, sandboxed code execution, embeddable agent widgets, and team-based sharing via ABAC.

Additionally, begin the unification path where new chat assistants and search apps are created via the agent canvas (agent-first for new creations). Existing chat/search configs keep their legacy UI; users can optionally promote to full agent workflows in the future.

</domain>

<decisions>
## Implementation Decisions

### Migration Scope & Priority
- Full parity migration: ALL 23 operators + ALL 23 tools + ALL 24 templates
- Both Agent (conversational) and Pipeline (batch processing) modes
- Webhook-triggered agents included
- Agent versioning included (save/restore canvas versions)
- Full debug mode with step-by-step execution, per-node logs, input/output inspection, and run history
- Sandboxed code execution using Docker containers (ephemeral containers for isolation)
- MCP (Model Context Protocol) integration for tool calling
- Team sharing only — agents shared within team/project via existing ABAC. No public explore/gallery page.
- Agents can optionally be linked to projects (project-scoped via ABAC) or exist at tenant level (unlinked)
- Embeddable agent widgets, reusing B-Knowledge's existing embed infrastructure
- Unification: new chat assistants and search apps created via agent canvas (agent-first). Existing ones keep legacy UI with gradual transition path.

### Execution Architecture
- Hybrid execution model: Node.js (be) orchestrates the graph, dispatches heavy operations (LLM calls, retrieval, code execution) to Python worker (advance-rag) via Redis/Valkey queue
- SSE for agent chat output streaming (consistent with existing chat). Socket.IO for debug/step-by-step execution status updates.
- Tool credentials: shared tenant-level defaults with per-agent overrides (matches LLM provider pattern)
- Full execution log persisted: every node input/output, timing, and errors stored per run in PostgreSQL
- Docker containers for sandbox code execution (ephemeral, isolated)
- Redis queue (existing Valkey infrastructure) for Node.js ↔ Python worker communication

### Canvas UI Approach
- Keep ReactFlow (@xyflow/react) as the canvas library
- Full rewrite of all node forms, panels, and dialogs to shadcn/ui + Tailwind (no Ant Design components)
- Zustand for canvas-specific state (nodes, edges, selections, drag). TanStack Query for server data (agent list, templates, runs).
- Top-level sidebar navigation item for Agents (first-class feature alongside Chat, Search, Datasets, Projects)

### Data Model & Storage
- Agent graph DSL stored as JSONB column in PostgreSQL, with denormalized metadata columns (name, status, category, version)
- Agent versioning uses version-as-row model (new row per version with parent_id reference) — consistent with B-Knowledge's version-as-dataset pattern
- Execution logs in PostgreSQL: agent_runs + agent_run_steps tables
- Tool credentials encrypted in PostgreSQL using existing crypto.service.ts
- Agents have own ABAC policies (policy_rules JSONB column) — consistent with dataset ABAC model
- Incremental Knex migrations per sub-feature (agents table, run/logs tables, tool credentials, templates)

### Claude's Discretion
- Exact operator-by-operator migration order within the full parity scope
- Internal graph execution scheduling algorithm (topological sort, BFS, etc.)
- Redis queue message format for agent operations
- Canvas node visual styling within shadcn/Tailwind constraints
- Debug panel layout and UX details
- Template seeding strategy (migration script vs seed file)
- MCP server discovery and connection management details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### RAGFlow Agent Source (migration source)
- `ragflow/agent/canvas.py` — Graph execution engine, DSL structure, node traversal logic
- `ragflow/agent/component/base.py` — Component base class, parameter system, execution lifecycle
- `ragflow/agent/component/` — All 23 operator implementations (LLM, retrieval, categorize, loop, switch, etc.)
- `ragflow/agent/tools/` — All 23 external tool integrations (Tavily, Wikipedia, GitHub, SQL, etc.)
- `ragflow/agent/templates/` — 24 pre-built agent workflow JSON templates
- `ragflow/agent/sandbox/` — Code execution sandbox implementation
- `ragflow/agent/settings.py` — Agent execution settings and constants
- `ragflow/api/apps/canvas_app.py` — Canvas API endpoints (CRUD, run, debug, templates, versions)

### RAGFlow Agent Frontend (migration source)
- `ragflow/web/src/pages/agent/index.tsx` — Main agent page, toolbar, navigation
- `ragflow/web/src/pages/agent/store.ts` — Zustand store for canvas state (nodes, edges, selections)
- `ragflow/web/src/pages/agent/interface.ts` — TypeScript interfaces for agent system
- `ragflow/web/src/pages/agent/canvas/` — ReactFlow canvas, node renderers, edge components, context menu
- `ragflow/web/src/pages/agent/canvas/node/` — 40+ node type renderers
- `ragflow/web/src/pages/agent/form/` — 40+ operator configuration forms
- `ragflow/web/src/pages/agent/hooks/` — 39 hooks for canvas operations, data fetching, debug, execution
- `ragflow/web/src/pages/agent/explore/` — Agent explore/discovery page
- `ragflow/web/src/pages/agent/debug-content/` — Debug panel with step-by-step execution
- `ragflow/web/src/pages/agent/run-sheet/` — Agent run panel
- `ragflow/web/src/pages/agent/log-sheet/` — Execution log viewer
- `ragflow/web/src/pages/agent/version-dialog/` — Version management dialog
- `ragflow/web/src/pages/agent/webhook-sheet/` — Webhook configuration
- `ragflow/web/src/pages/agent/share/` — Sharing configuration

### B-Knowledge Target Architecture
- `be/CLAUDE.md` — Backend conventions, module structure, factory pattern
- `fe/CLAUDE.md` — Frontend conventions, API layer split, state management
- `be/src/modules/chat/` — Existing chat module (reference for streaming SSE pattern)
- `be/src/modules/search/` — Existing search module (reference for app configuration pattern)
- `be/src/shared/models/factory.ts` — ModelFactory singleton pattern for Knex models
- `be/src/shared/services/crypto.service.ts` — Encryption service for tool credentials
- `fe/src/features/chat/` — Existing chat feature (reference for streaming UI patterns)
- `fe/src/features/search/` — Existing search feature (reference for app config UI)
- `fe/src/features/datasets/` — Reference for ABAC policy UI, versioning UI
- `fe/src/layouts/sidebarNav.ts` — Sidebar navigation configuration

### Existing Infrastructure
- `docs/basic-design/security-architecture.md` — ABAC model, tenant isolation patterns
- `docs/detail-design/chat-completion-generation.md` — SSE streaming architecture
- `docs/detail-design/realtime-communication.md` — Socket.IO + Redis pub/sub patterns
- `docs/detail-design/chat-embed-widget.md` — Embed widget infrastructure

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `crypto.service.ts`: Encryption/decryption for tool credential storage
- `be/src/modules/chat/services/chat-conversation.service.ts`: SSE streaming pattern for agent chat output
- `be/src/shared/middleware/external-auth.middleware.ts`: Embed/widget authentication for agent widgets
- `fe/src/components/ui/`: Full shadcn/ui component library for rebuilding agent forms
- `fe/src/features/chat-widget/`: Embed widget pattern reusable for agent widgets
- `fe/src/features/datasets/components/ChangeParserDialog.tsx`: Reference for complex configuration dialogs
- Existing ABAC infrastructure (CASL, ability service, policy rules JSONB) — directly reusable for agent access control

### Established Patterns
- **Module structure (BE):** `be/src/modules/{domain}/` with controllers, services, models, routes, schemas, index.ts barrel
- **Feature structure (FE):** `fe/src/features/{domain}/` with api/, components/, hooks/, pages/, types/
- **API layer split:** `{domain}Api.ts` (raw HTTP) + `{domain}Queries.ts` (TanStack Query hooks)
- **Factory Pattern:** All Knex models registered via `ModelFactory.register()` singleton
- **Streaming:** SSE via Express response with `text/event-stream` content type
- **Real-time:** Socket.IO rooms per tenant with Redis pub/sub adapter
- **Versioning:** version-as-dataset with parent_id, version_number, page_rank boost

### Integration Points
- `be/src/app/routes.ts`: Register new agent module routes
- `fe/src/layouts/sidebarNav.ts`: Add Agents to sidebar navigation
- `be/src/shared/models/factory.ts`: Register agent models
- `advance-rag/`: Add agent execution handlers to Python worker
- `be/src/shared/db/migrations/`: New migration files for agent tables
- `fe/src/i18n/locales/`: i18n strings for agent UI (en, vi, ja)

</code_context>

<specifics>
## Specific Ideas

- RAGFlow's Graph class (canvas.py) is the core execution engine — it manages DSL traversal, node execution ordering, history tracking, and message passing between nodes
- The hybrid model means Node.js handles graph traversal/orchestration logic while Python handles compute-heavy node execution (LLM calls, retrieval, tool execution)
- Agent-first unification: the agent canvas becomes the "advanced editor" for chat/search, with existing simple config UIs preserved as "quick setup" alternatives
- Version-as-row for agents mirrors the document versioning pattern, enabling consistent UX for version management across the platform
- Templates should be seeded as tenant-level resources, cloneable to create new agents

</specifics>

<deferred>
## Deferred Ideas

- Public explore/gallery page for community agent sharing — future phase
- Auto-migration of existing chat/search configs to agent DSL — future unification phase
- Agent marketplace or import/export between tenants — future phase
- Per-agent billing/metering — out of scope (self-hosted)
- Agent-to-agent orchestration (meta-agents) — future phase

</deferred>

---

*Phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge*
*Context gathered: 2026-03-22*
