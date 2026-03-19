# Phase 1: Migration Stabilization - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix known and undiscovered bugs in the RAG pipeline (dataset creation, document parsing, chunking/embedding/indexing) and stabilize the user-facing chat and search experiences. Add answer quality feedback (thumbs up/down). The core migrated pipeline must be production-reliable before any new features are built on top.

</domain>

<decisions>
## Implementation Decisions

### Bug Discovery Strategy
- **Write E2E tests first** using Playwright — let test failures reveal bugs
- **Dataset lifecycle is the first E2E target**: Create KB → upload PDF → parse with deepdoc → verify chunks appear in OpenSearch
- Chat and search E2E tests come **after** the dataset pipeline is proven stable
- Known bugs exist (mix of known and undiscovered) — E2E tests will surface both
- Focus on E2E flows, not unit/integration tests in this phase

### Parser Testing
- **Test deepdoc with PDF format first** — this is the existing parser, not a new integration
- PDF is the priority format for validating the full pipeline end-to-end
- Other parser types (DOCX, Excel/CSV) are important but come after PDF works
- Remaining RAGFlow parser migration deferred until PDF pipeline is proven

### Chat/Search Stabilization
- **Not yet tested** — no known specific bugs; E2E tests will reveal issues
- **Dataset pipeline takes priority** — chat/search testing comes after dataset CRUD + parse + chunk is stable
- Both chat and search need E2E coverage eventually in this phase

### Answer Feedback
- Thumbs up/down on **both chat answers and search AI summaries**
- Feedback captures: vote + optional user comment + retrieved chunks (for correlating bad answers with bad retrieval)
- Store feedback linked to the query, response, and chunks used

### Claude's Discretion
- Playwright test structure and helpers
- Specific E2E test scenarios beyond the core flows
- Feedback database schema design
- Error handling and retry patterns in tests

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### RAG Pipeline
- `advance-rag/rag/svr/task_executor.py` — Main task executor that orchestrates parsing → chunking → embedding → indexing
- `advance-rag/rag/app/naive.py` — General/naive parser (deepdoc-based) used for PDF processing
- `be/src/modules/rag/services/rag-search.service.ts` — Hybrid search service querying OpenSearch

### Chat System
- `be/src/modules/chat/services/chat-conversation.service.ts` — Full streaming RAG chat pipeline (retrieval → rerank → LLM → citations)
- `fe/src/features/chat/hooks/useChatStream.ts` — Frontend SSE stream handling for chat

### Search System
- `be/src/modules/search/services/search.service.ts` — Search app execution (retrieval + optional LLM summary)
- `fe/src/features/search/hooks/useSearchStream.ts` — Frontend SSE stream handling for search

### Testing Infrastructure
- `fe/tests/test-utils.tsx` — Existing test utilities (renderWithProviders, renderWithRouter)
- `.planning/codebase/TESTING.md` — Current test coverage status (Playwright available but not configured)

### Concerns
- `.planning/codebase/CONCERNS.md` — No Python tests, RAGFlow derivation complexity, dual ORM risk

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Vitest (BE + FE)**: Test runners already configured for both workspaces
- **Playwright**: Available as dependency in FE but not configured for E2E
- **chat feedback endpoint**: `POST /api/chat/conversations/:id/feedback` already exists in routes — may have partial implementation
- **Langfuse tracing**: Already wraps chat and search pipelines — feedback could link to trace IDs

### Established Patterns
- **BE test structure**: Tests mirror module structure under `be/tests/` (chat, search, rag directories exist)
- **FE test structure**: Tests under `fe/tests/` with test-utils providing provider wrappers
- **SSE streaming**: Both chat and search use raw `fetch()` + `ReadableStream` for SSE — same pattern to test

### Integration Points
- **Redis queues**: Parse tasks go through Redis — E2E tests need to wait for async task completion
- **OpenSearch**: Chunks are indexed asynchronously — tests need polling/waiting for index refresh
- **Socket.IO**: Real-time progress updates via Redis pub/sub — can be used to detect task completion in tests

</code_context>

<specifics>
## Specific Ideas

- Test the full "happy path" first: create dataset → upload PDF → parse with deepdoc → verify chunks in OpenSearch → search finds content
- PDF is the reference format because it exercises deepdoc's OCR, layout analysis, and text extraction
- Answer feedback should store enough context to later correlate bad answers with retrieval quality (chunks used, scores)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-migration-stabilization*
*Context gathered: 2026-03-18*
