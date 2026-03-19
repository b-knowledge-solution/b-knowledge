# Phase 5: Advanced Retrieval - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire GraphRAG (entity extraction, community detection, graph+vector hybrid retrieval) and Deep Research (recursive query decomposition with iterative retrieval) pipelines from existing Python implementations. Add cross-dataset retrieval with ABAC enforcement, token budget controls, chat assistant dataset access modes (dedicated + RBAC toggle), and user language detection for forced LLM response language matching.

</domain>

<decisions>
## Implementation Decisions

### GraphRAG Mode Selection
- **LazyGraphRAG (light mode) as default** — lower cost, faster indexing. Full GraphRAG available as opt-in
- **Graph indexing only when explicitly enabled** — user enables "Knowledge Graph" toggle on a dataset in Data Studio. Indexing runs as a separate task after parsing. No graph construction by default
- **Rebuild from scratch on mode switch** — when switching from Light to Full GraphRAG, graph is rebuilt entirely. No incremental enhancement

### Deep Research Cost Controls
- **Default budget: 50K tokens + 15 LLM calls** per session. Configurable per org by admin
- **Partial answer with disclaimer on budget cap** — synthesize best answer from completed sub-queries with visible disclaimer: "Research was limited by budget. {N} of {M} sub-queries completed."
- **Progressive SSE streaming** — each sub-query result streams as it completes. User sees "Researching: [sub-question]..." then results progressively. Final synthesis streams at the end

### Cross-Dataset Search UX
- **Dataset access toggle in assistant config** — "Allow user's RBAC datasets" toggle in Data Studio chat assistant settings. When ON, assistant searches both dedicated datasets AND user's RBAC-accessible datasets. Default OFF
- **Results mixed by relevance** — cross-dataset results ranked by relevance score regardless of source. Source dataset shown as label on each result
- **ABAC enforcement at query time** — existing Phase 2 ABAC filters applied to all cross-dataset queries. User cannot receive chunks from unauthorized KBs

### GraphRAG Data Studio UI
- **Extend existing KnowledgeGraphTab** — show entity count, relationship count, community count, indexing status (building/complete/error), last built timestamp. No interactive graph visualization — just metrics and status
- **Toggles in chat assistant config** — "Knowledge Graph mode" and "Deep Research mode" toggles in ChatAssistantConfig. Admin controls which modes are available per assistant

### Language Detection + Response Language
- **Detect user input language** — analyze the user's prompt to detect language
- **Force LLM response language via system prompt variable** — add a variable in the system prompt template that instructs the LLM to respond in the detected language. Ensures answers match the user's input language

### Claude's Discretion
- Language detection library/approach (could be LLM-based, langdetect, or fasttext)
- System prompt template format for language instruction
- GraphRAG entity resolution merge strategy
- Deep Research sub-query generation prompt design
- SSE event format for intermediate Deep Research results
- Cross-dataset query routing (parallel vs sequential)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### GraphRAG (Python Implementation)
- `advance-rag/rag/graphrag/general/` — Full GraphRAG: entity extraction, community reports, Leiden clustering, mind maps
- `advance-rag/rag/graphrag/light/` — LazyGraphRAG: lighter entity extraction
- `advance-rag/rag/graphrag/search.py` — Graph-augmented search
- `advance-rag/rag/graphrag/entity_resolution.py` — Entity deduplication

### Deep Research (Python Implementation)
- `advance-rag/rag/advanced_rag/tree_structured_query_decomposition_retrieval.py` — Recursive query decomposition
- `advance-rag/rag/raptor.py` — RAPTOR hierarchical summarization

### Backend Services (TypeScript)
- `be/src/modules/rag/services/rag-graphrag.service.ts` — Existing backend GraphRAG service
- `be/src/modules/rag/services/rag-deep-research.service.ts` — Existing backend Deep Research service
- `be/src/modules/rag/services/rag-search.service.ts` — Hybrid search with tenant_id + ABAC filters
- `be/src/modules/chat/services/chat-conversation.service.ts` — Chat pipeline (retrieval → rerank → LLM → citations)

### Frontend
- `fe/src/features/datasets/components/KnowledgeGraphTab.tsx` — Existing KG tab to extend
- `fe/src/features/chat/components/ChatAssistantConfig.tsx` — Assistant config (add toggles)
- `fe/src/features/chat/hooks/useChatStream.ts` — SSE stream handling

### Prior Phase Integrations
- Phase 2: ABAC enforcement in rag-search.service.ts (mandatory tenant_id + policy filters)
- Phase 3: Metadata tags searchable via tag filter chips
- `be/src/shared/prompts/index.ts` — System prompt templates (add language variable here)

### Concerns (STATE.md)
- Deep Research token cost spiral — maxDepth:3 guard insufficient; 50K token + 15 call hard caps mandatory
- GraphRAG indexing cost — LazyGraphRAG default selected to mitigate

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **rag-graphrag.service.ts**: Backend service already exists — wire to Python worker task routing
- **rag-deep-research.service.ts**: Backend service already exists — wire to Python worker
- **KnowledgeGraphTab.tsx**: Frontend tab component — extend with metrics and status
- **ChatAssistantConfig.tsx**: Config component — add Knowledge Graph, Deep Research, and RBAC dataset toggles
- **useChatStream.ts**: SSE streaming — extend for Deep Research intermediate results
- **graphrag/general/ and light/**: Full Python implementations ready to wire
- **tree_structured_query_decomposition_retrieval.py**: Deep Research implementation ready

### Established Patterns
- Task routing via Redis queue (rag-redis.service.ts → task_executor.py FACTORY)
- SSE streaming for chat/search via fetch + ReadableStream
- ABAC filters injected at service layer via buildOpenSearchAbacFilters()
- System prompts in be/src/shared/prompts/index.ts with template variables

### Integration Points
- **Task type routing**: task_executor.py has TASK_TYPE_TO_PIPELINE_TASK_TYPE mapping — add graphrag task type
- **Assistant config**: ChatAssistantConfig already has retrieval settings — add mode toggles
- **System prompts**: Template variable injection point for language instruction
- **Redis pub/sub**: Deep Research intermediate results can use existing progress event pattern

</code_context>

<specifics>
## Specific Ideas

- GraphRAG and Deep Research are migration tasks — existing Python code just needs wiring, not reimplementation
- The RBAC dataset toggle on assistants enables a powerful pattern: assistants can be configured to either stay scoped to specific datasets or expand to the user's full access scope
- Language detection should be lightweight (not an extra LLM call) — something like langdetect or a simple heuristic
- Progressive SSE streaming for Deep Research follows the existing chat streaming pattern but adds intermediate result events

</specifics>

<deferred>
## Deferred Ideas

None — language detection and RBAC dataset toggle were explicitly included in Phase 5 scope per user decision.

</deferred>

---

*Phase: 05-advanced-retrieval*
*Context gathered: 2026-03-19*
