# Phase 2: Migration Memory Feature from RAGFlow to B-Knowledge - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate RAGFlow's memory system into B-Knowledge. Memory is a persistent knowledge store that agents and chat conversations use to remember facts, experiences, and procedures across sessions. The system includes: 4 memory types (Raw, Semantic, Episodic, Procedural) via bitmask, 2 storage backends (table + graph), LLM-powered memory extraction from conversations with configurable prompts, FIFO forgetting policies, hybrid vector+text memory search, integration with both chat assistants and agent workflows, conversation history import, and a full management UI (list, message browser, settings).

</domain>

<decisions>
## Implementation Decisions

### Memory Types & Extraction
- **D-01:** All 4 memory types: Raw (verbatim messages, bitmask=1), Semantic (facts/definitions, bitmask=2), Episodic (events/experiences, bitmask=4), Procedural (how-to/workflows, bitmask=8). Bitmask enables combining types per pool.
- **D-02:** Configurable extraction mode: batch extract on session end (default) + optional real-time extraction after each conversation turn (per memory pool setting).
- **D-03:** Port RAGFlow's PromptAssembler prompt templates as defaults, with per-pool customization via system_prompt + user_prompt fields.
- **D-04:** Temporal validity timestamps (valid_at, invalid_at) on all memory items. Enables forgetting stale facts and time-scoped queries.

### Storage & Retrieval
- **D-05:** Memory messages stored in OpenSearch with embedding vectors for hybrid vector+text search. Reuses B-Knowledge's existing OpenSearch infrastructure.
- **D-06:** Both table and graph storage types. Table = flat messages in OpenSearch. Graph = knowledge graph relationships using B-Knowledge's existing GraphRAG infrastructure.
- **D-07:** FIFO forgetting policy only. When memory pool reaches memory_size limit, oldest items are removed.
- **D-08:** Memory usable from both Chat and Agents. Chat assistants link to memory pools for auto-save + context injection. Agent canvas gets Memory operator node for explicit read/write.

### Agent Integration
- **D-09:** Both auto-inject and explicit Memory node. Auto-injection retrieves relevant memories into LLM context window by default. Memory operator node in canvas for advanced control (specific queries, writes, cross-pool access).
- **D-10:** Flexible memory pool scoping: user-scoped, agent-scoped, or team-scoped. Users choose scope when creating a pool. Permissions model matches RAGFlow (me/team).
- **D-11:** Import option for existing chat history. One-click import processes past conversations through memory extraction pipeline to retroactively build memory.

### Memory Management UI
- **D-12:** Memory grouped under existing Agents nav group in sidebar (not a separate top-level item). Agents nav group contains: Agent list, Memory list.
- **D-13:** All 3 views: Memory list page (card grid with create/edit/delete), message browser (table with search/filter per pool), settings panel (embedding model, LLM, prompts, forgetting policy).
- **D-14:** Per-pool model selection for both embedding and LLM models. Each memory pool can choose its own models (embd_id, llm_id).

### Claude's Discretion
- OpenSearch index naming strategy for memory (e.g., `memory_{tenant_id}`)
- Memory search ranking algorithm (vector weight vs text weight)
- Graph storage implementation details (reuse GraphRAG or separate graph schema)
- Memory extraction LLM prompt tuning for B-Knowledge domains
- Import UI design (bulk import dialog, progress tracking)
- Memory operator node form design in agent canvas

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### RAGFlow Memory Source (migration source)
- `ragflow/memory/` — Memory module root (services, utils)
- `ragflow/memory/services/messages.py` — MessageService: OpenSearch CRUD for memory messages (insert, update, delete, list, search)
- `ragflow/memory/services/query.py` — MsgTextQuery: hybrid text+vector search for memory retrieval
- `ragflow/memory/utils/prompt_util.py` — PromptAssembler: LLM prompt templates for memory extraction (Semantic, Episodic, Procedural, Raw types)
- `ragflow/memory/utils/es_conn.py` — Elasticsearch/OpenSearch connection utilities for memory storage
- `ragflow/memory/utils/msg_util.py` — Message parsing utilities
- `ragflow/memory/utils/aggregation_utils.py` — Memory aggregation helpers
- `ragflow/memory/utils/highlight_utils.py` — Search result highlighting

### RAGFlow Memory API (migration source)
- `ragflow/api/apps/restful_apis/memory_api.py` — REST API endpoints (CRUD, message management)
- `ragflow/api/apps/services/memory_api_service.py` — API service layer (create, update, delete, query)
- `ragflow/api/db/services/memory_service.py` — Database service (Memory model queries)
- `ragflow/api/db/joint_services/memory_message_service.py` — Joint service (save_to_memory, query_message)
- `ragflow/api/utils/memory_utils.py` — Utility functions (format_ret_data_from_memory, memory type conversion)
- `ragflow/api/db/db_models.py` §Memory class (line 1304) — Memory model definition (fields, types, defaults)
- `ragflow/common/constants.py` §MemoryType (line 174) — Enum with bitmask values (RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8)

### RAGFlow Memory Prompts
- `ragflow/rag/prompts/summary4memory.md` — LLM prompt for summarizing tool call responses into memory
- `ragflow/rag/prompts/rank_memory.md` — LLM prompt for ranking memory relevance

### RAGFlow Memory Frontend (migration source)
- `ragflow/web/src/pages/memory/` — Memory detail page (settings, message table)
- `ragflow/web/src/pages/memories/` — Memory list page (card grid)
- `ragflow/web/src/pages/home/memory-list.tsx` — Memory list on home page
- `ragflow/web/src/hooks/use-memory-request.ts` — Memory API hooks
- `ragflow/web/src/interfaces/database/memory.ts` — TypeScript interfaces

### B-Knowledge Target Architecture
- `be/src/modules/agents/` — Existing agent module (pattern for new memory module)
- `be/src/shared/models/factory.ts` — ModelFactory for registering Memory model
- `fe/src/features/agents/` — Existing agents feature (pattern for memory feature)
- `fe/src/layouts/sidebarNav.ts` — Sidebar navigation (add Memory under Agents group)
- `advance-rag/rag/agent/node_executor.py` — Agent node executor (add memory read/write handler)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `be/src/modules/agents/` — Full agent module pattern (models, services, controllers, routes, schemas) — replicate for memory module
- `be/src/shared/services/crypto.service.ts` — Not needed for memory (no credentials to encrypt)
- `fe/src/features/agents/` — Feature structure pattern (API split, TanStack Query hooks, pages, components)
- `advance-rag/rag/agent/node_executor.py` — Dispatch table pattern for adding memory read/write handlers
- OpenSearch infrastructure already configured in B-Knowledge for document chunks — reuse for memory vectors

### Established Patterns
- Factory Pattern for Knex models via ModelFactory singleton
- API layer split: `memoryApi.ts` + `memoryQueries.ts`
- Zustand not needed for memory (no canvas — use TanStack Query for all state)
- i18n in 3 locales (en, vi, ja)

### Integration Points
- `be/src/app/routes.ts` — Register memory module routes
- `fe/src/layouts/sidebarNav.ts` — Add Memory under Agents nav group
- `be/src/shared/models/factory.ts` — Register MemoryModel, MemoryMessageModel
- `be/src/modules/chat/services/chat-conversation.service.ts` — Hook memory save into chat pipeline
- `advance-rag/rag/agent/node_executor.py` — Add memory_read/memory_write handlers
- `fe/src/features/agents/components/canvas/NodeConfigPanel.tsx` — Add MemoryForm to FORM_MAP

</code_context>

<specifics>
## Specific Ideas

- Memory pools grouped under Agents nav section (user explicitly requested this grouping)
- Import existing chat history into memory pools is a key feature — users want to retroactively build knowledge from past conversations
- Both chat and agents use memory — chat for auto-save/inject, agents for explicit read/write via canvas node
- Flexible scoping (user/agent/team) chosen over simpler per-user model — covers SDLC team collaboration and healthcare team knowledge sharing

</specifics>

<deferred>
## Deferred Ideas

- LRU or relevance-based forgetting policies — keep FIFO for now, add sophisticated policies later
- Memory analytics dashboard (most accessed memories, extraction success rate)
- Cross-tenant memory sharing — out of scope, memory stays within tenant isolation
- Memory import from external sources (Notion, Confluence) — future integration phase

</deferred>

---

*Phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge*
*Context gathered: 2026-03-23*
