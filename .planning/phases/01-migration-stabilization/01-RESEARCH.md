# Phase 1: Migration Stabilization - Research

**Researched:** 2026-03-18
**Domain:** E2E testing, RAG pipeline stabilization, chat/search streaming, answer feedback
**Confidence:** HIGH

## Summary

Phase 1 is a stabilization phase focused on making the existing migrated RAG pipeline production-reliable. The codebase is a RAGFlow-derived monorepo with a Node.js backend (Express/Knex), React frontend (Vite/TanStack), and Python RAG worker (FastAPI/Peewee). The primary challenge is that the system was migrated from RAGFlow with modifications, creating a dual-ORM risk (Knex in BE, Peewee in Python worker sharing the same PostgreSQL database) and a UUID format mismatch pattern (RAGFlow uses 32-char hex UUIDs without hyphens while PostgreSQL UUID columns store standard 36-char format).

The user's decision is to use Playwright E2E tests as the primary bug discovery mechanism, testing the full happy path: dataset creation, PDF upload, deepdoc parsing, chunk verification in OpenSearch, then chat and search flows. Existing chat feedback (thumbs up/down) is partially implemented on the backend and frontend but search feedback is entirely missing.

**Primary recommendation:** Set up Playwright E2E tests first targeting the dataset lifecycle happy path, then systematically expand to chat and search. Build search answer feedback by mirroring the existing chat feedback pattern. Focus on the full-stack integration points (Redis queues, OpenSearch indexing, SSE streaming) where async timing and UUID format mismatches are the most likely bug sources.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Write E2E tests first** using Playwright -- let test failures reveal bugs
- **Dataset lifecycle is the first E2E target**: Create KB -> upload PDF -> parse with deepdoc -> verify chunks appear in OpenSearch
- Chat and search E2E tests come **after** the dataset pipeline is proven stable
- Known bugs exist (mix of known and undiscovered) -- E2E tests will surface both
- Focus on E2E flows, not unit/integration tests in this phase
- **Test deepdoc with PDF format first** -- this is the existing parser, not a new integration
- PDF is the priority format for validating the full pipeline end-to-end
- Other parser types (DOCX, Excel/CSV) are important but come after PDF works
- Remaining RAGFlow parser migration deferred until PDF pipeline is proven
- **Not yet tested** -- no known specific bugs in chat/search; E2E tests will reveal issues
- **Dataset pipeline takes priority** -- chat/search testing comes after dataset CRUD + parse + chunk is stable
- Both chat and search need E2E coverage eventually in this phase
- Thumbs up/down on **both chat answers and search AI summaries**
- Feedback captures: vote + optional user comment + retrieved chunks (for correlating bad answers with bad retrieval)
- Store feedback linked to the query, response, and chunks used

### Claude's Discretion
- Playwright test structure and helpers
- Specific E2E test scenarios beyond the core flows
- Feedback database schema design
- Error handling and retry patterns in tests

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAB-01 | Fix known bugs in dataset creation workflow (create, update, delete knowledge bases) | Knowledgebase model uses UUID hyphen stripping; dataset model uses standard UUIDs -- potential mismatch. E2E tests will surface CRUD bugs. |
| STAB-02 | Fix known bugs in document parsing pipeline (file upload, parser selection, parse execution) | Task executor consumes Redis queues, uses Peewee ORM. Parser FACTORY maps parser types to modules. E2E must wait for async Redis task completion. |
| STAB-03 | Fix known bugs in chunking pipeline (chunk generation, embedding, OpenSearch indexing) | OpenSearch index naming `knowledge_{SYSTEM_TENANT_ID}`. Chunk fields: `content_with_weight`, `q_vec`, `kb_id`, `doc_id`. UUID format consistency critical. |
| STAB-04 | Systematic testing to discover and fix undocumented bugs across the RAG pipeline | Playwright E2E tests as the bug discovery mechanism. Redis pub/sub + Socket.IO for progress tracking. |
| STAB-05 | Complete migration of remaining document type parsers from RAGFlow | Parser FACTORY already maps all types (naive, paper, book, presentation, manual, laws, qa, table, resume, picture, one, audio, email, tag). Deferred until PDF pipeline proven. |
| CHAT-01 | Chat experience stabilization -- fix bugs in streaming, citation display, conversation management | `chat-conversation.service.ts` implements full RAG pipeline with SSE delta streaming. `useChatStream.ts` handles client-side SSE parsing. |
| CHAT-02 | Search experience stabilization -- fix bugs in search results, filtering, pagination | `search.service.ts` handles multi-dataset search with SSE streaming via `askSearch`. `useSearchStream.ts` client-side. No feedback endpoint exists for search. |
| CHAT-03 | Answer quality feedback -- thumbs up/down on AI-generated answers linked to query + chunks + response | Chat feedback partially exists (BE route + FE component). Search feedback completely missing. Need new `answer_feedback` table for structured storage with chunk correlation. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @playwright/test | ^1.57.0 | E2E browser testing | Already in fe/package.json; locked user decision |
| Vitest | 2.1 (BE) / 3.0 (FE) | Unit test runner | Already configured in both workspaces |
| Express | 4.21 | Backend API | Existing stack |
| React | 19 | Frontend SPA | Existing stack |
| TanStack Query | 5 | Server state | Existing stack |
| Knex | (existing) | BE ORM / migrations | Existing stack; all schema changes go through Knex |
| Peewee | (existing) | Python worker ORM | Existing stack; read-write only, no migrations |
| OpenSearch | 3.5.0 | Vector + text search | Existing infrastructure |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @opensearch-project/opensearch | (existing) | OpenSearch Node.js client | Already used in rag-search.service.ts |
| Langfuse | (existing) | Tracing for chat/search pipelines | Already integrated; feedback can link to trace IDs |
| Socket.IO | (existing) | Real-time progress updates | E2E tests can listen for task completion events |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Playwright | Cypress | Playwright already a dependency; Playwright handles SSE/streaming better |
| New feedback table | Reuse chat_message.citations JSONB | Dedicated table enables cross-module analytics and search feedback |

## Architecture Patterns

### Recommended Playwright Project Structure
```
fe/
├── playwright.config.ts           # Playwright configuration
├── e2e/
│   ├── fixtures/                  # Shared test fixtures
│   │   ├── auth.fixture.ts        # Login state management
│   │   ├── dataset.fixture.ts     # Dataset lifecycle helpers
│   │   └── test-data/             # PDF and other test files
│   │       └── sample.pdf         # Small PDF for parsing tests
│   ├── helpers/
│   │   ├── api.helper.ts          # Direct API calls for setup/teardown
│   │   ├── wait.helper.ts         # Polling helpers for async operations
│   │   └── opensearch.helper.ts   # OpenSearch verification queries
│   ├── dataset/
│   │   ├── dataset-crud.spec.ts   # STAB-01: Create, update, delete KB
│   │   ├── document-upload.spec.ts # STAB-02: Upload and parse documents
│   │   └── chunk-verify.spec.ts   # STAB-03: Verify chunks in OpenSearch
│   ├── chat/
│   │   ├── chat-stream.spec.ts    # CHAT-01: Streaming + citations
│   │   └── chat-feedback.spec.ts  # CHAT-03: Thumbs up/down
│   └── search/
│       ├── search-query.spec.ts   # CHAT-02: Search + filter + paginate
│       └── search-feedback.spec.ts # CHAT-03: Search answer feedback
```

### Pattern 1: Async Task Completion Waiting
**What:** The RAG pipeline processes documents asynchronously via Redis queues. E2E tests must wait for task completion without fixed sleeps.
**When to use:** Any test that triggers parsing, chunking, or embedding.
**Example:**
```typescript
// Poll the document status API until parsing completes or timeout
async function waitForDocumentParsed(
  page: Page,
  datasetId: string,
  docId: string,
  timeoutMs = 60_000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const response = await page.request.get(
      `/api/rag/datasets/${datasetId}/documents/${docId}`
    )
    const data = await response.json()
    // Document status '1' = parsed, progress >= 1.0 = complete
    if (data.run === '1' || data.progress >= 1.0) return
    if (data.run === '-1') throw new Error(`Parse failed: ${data.progress_msg}`)
    await page.waitForTimeout(2000)
  }
  throw new Error(`Document parsing timed out after ${timeoutMs}ms`)
}
```

### Pattern 2: UUID Format Normalization
**What:** RAGFlow-derived tables store UUIDs as 32-char hex (no hyphens). The BE normalizes with `.replace(/-/g, '')` throughout. Tests must account for both formats.
**When to use:** Any assertion comparing IDs across the BE API response and OpenSearch/PostgreSQL.
**Example:**
```typescript
// Normalize UUID to 32-char hex format for comparison with RAGFlow tables
function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, '')
}
```

### Pattern 3: SSE Stream Testing
**What:** Both chat and search use Server-Sent Events for streaming responses. Playwright can test these by intercepting fetch responses.
**When to use:** Chat and search streaming tests.
**Example:**
```typescript
// Collect SSE events from a streaming endpoint
async function collectSseEvents(page: Page, url: string, body: object): Promise<any[]> {
  const events: any[] = []
  const response = await page.request.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
  })
  const text = await response.text()
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (data === '[DONE]') break
    try { events.push(JSON.parse(data)) } catch { /* skip malformed */ }
  }
  return events
}
```

### Pattern 4: Answer Feedback Schema
**What:** Dedicated table for storing answer feedback across both chat and search, linked to query, response, and retrieved chunks.
**When to use:** CHAT-03 implementation.
**Example:**
```typescript
// Migration: create answer_feedback table
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('answer_feedback', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid())
    table.enum('source', ['chat', 'search']).notNullable()
    table.uuid('source_id').notNullable().comment('conversation_id or search_app_id')
    table.string('message_id').nullable().comment('chat message ID, null for search')
    table.uuid('user_id').notNullable()
    table.boolean('thumbup').notNullable()
    table.text('comment').nullable()
    table.text('query').notNullable()
    table.text('answer').notNullable()
    table.jsonb('chunks_used').nullable().comment('Array of {chunk_id, doc_id, score} for retrieval correlation')
    table.string('trace_id').nullable().comment('Langfuse trace ID for linking to observability')
    table.timestamps(true, true)
    table.index(['source', 'source_id'])
    table.index(['user_id'])
    table.index(['thumbup'])
  })
}
```

### Anti-Patterns to Avoid
- **Fixed sleep waits in E2E tests:** Never `await page.waitForTimeout(10000)` for async operations. Always poll for the expected state change with a reasonable timeout.
- **Hardcoded test data IDs:** Always create test data in `beforeAll` and clean up in `afterAll`. Never rely on pre-existing database state.
- **Testing through the Python worker directly:** The E2E tests exercise the full stack through the browser. Do not mock the Python worker -- let it run against real infrastructure.
- **Storing feedback in chat_message.citations JSONB:** The current implementation stuffs feedback into the citations JSON field. A dedicated table is better for cross-module analytics and enables search feedback without a chat message.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| E2E test authentication | Custom login flow per test | Playwright `storageState` (saved auth cookies) | Login once, reuse across tests; official Playwright pattern |
| Waiting for async operations | Sleep-based polling loops | Playwright `expect.poll()` or custom `waitFor` with exponential backoff | Built-in retry logic, better error messages |
| OpenSearch verification | Custom HTTP client in tests | `@opensearch-project/opensearch` client or Playwright `page.request` | Already a project dependency, typed API |
| SSE parsing in tests | Manual string splitting | Playwright's `page.request.fetch` + text parsing | Playwright handles HTTP correctly, including cookies and CORS |

**Key insight:** Playwright's `page.request` API lets tests make authenticated API calls directly (sharing the browser's auth state), which is ideal for setup/teardown and verification steps that don't need the UI.

## Common Pitfalls

### Pitfall 1: UUID Format Mismatch Between BE Models
**What goes wrong:** The `dataset` model (from `shared/models/factory.ts`) uses standard UUIDs, but the `knowledgebase` model (RAGFlow-derived in `rag/models/knowledgebase.model.ts`) strips hyphens. When the same ID is used across both models, lookups fail silently.
**Why it happens:** Two model layers for the same concept -- `Dataset` (Knex BaseModel) and `Knowledgebase` (custom RAGFlow model). Both write to the `knowledgebase` table but handle UUIDs differently.
**How to avoid:** Ensure all IDs passed to RAGFlow-derived models are normalized to 32-char hex. The existing `.replace(/-/g, '')` pattern is pervasive -- E2E tests will expose mismatches.
**Warning signs:** "Document not found" errors despite the document existing. Empty chunk lists for a dataset that was parsed successfully.

### Pitfall 2: OpenSearch Index Refresh Timing
**What goes wrong:** After indexing chunks, OpenSearch queries return stale results because the index hasn't refreshed yet.
**Why it happens:** OpenSearch default refresh interval is 1 second. E2E tests that immediately query after indexing may hit stale data.
**How to avoid:** Use `refresh: true` on write operations (already done in `rag-search.service.ts`) or add a small poll interval in E2E verification steps.
**Warning signs:** Tests pass inconsistently; chunk counts are sometimes zero after parsing.

### Pitfall 3: Redis Queue Consumer Not Running
**What goes wrong:** Documents are uploaded and parse tasks are queued, but nothing processes them because the Python task executor isn't running.
**Why it happens:** `npm run dev:worker` waits for backend health before starting. If the backend isn't fully healthy, the worker never starts.
**How to avoid:** E2E test setup must ensure all services are running. The `waitForDocumentParsed` helper will timeout and give a clear error.
**Warning signs:** Documents stuck in "parsing" status indefinitely. Progress stays at 0%.

### Pitfall 4: Chat Feedback Stored in Wrong Location
**What goes wrong:** Current chat feedback is stored in `chat_message.citations` JSONB field, mixing feedback data with citation data.
**Why it happens:** Quick implementation that avoided schema changes.
**How to avoid:** Create a proper `answer_feedback` table. Migrate existing feedback data if any exists.
**Warning signs:** Citation display breaks when feedback is present in the JSONB. No way to query feedback across conversations.

### Pitfall 5: Playwright Tests Need Running Infrastructure
**What goes wrong:** Playwright tests fail because PostgreSQL, Redis, OpenSearch, or RustFS aren't running.
**Why it happens:** E2E tests require the full infrastructure stack, not just the Node.js backend.
**How to avoid:** Document the prerequisite: `npm run docker:base && npm run dev` before running E2E tests. Consider a `webServer` config in `playwright.config.ts` that starts the dev servers.
**Warning signs:** Connection refused errors. "ECONNREFUSED" in test output.

### Pitfall 6: SYSTEM_TENANT_ID Read from process.env in 5 Files
**What goes wrong:** Multiple files read `SYSTEM_TENANT_ID` directly from `process.env` instead of using the config object, creating inconsistency risk.
**Why it happens:** RAGFlow-derived code predates the centralized config pattern.
**How to avoid:** This is documented as a Phase 2 prerequisite. For Phase 1, be aware that these files exist: `rag-sql.service.ts`, `rag-graphrag.service.ts`, `rag-document.model.ts`, `rag-file.model.ts`, `knowledgebase.model.ts`. Tests should use the same `SYSTEM_TENANT_ID` value.
**Warning signs:** OpenSearch queries returning empty results when the index name doesn't match.

## Code Examples

### Playwright Configuration
```typescript
// fe/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential for stateful E2E flows
  retries: 1,
  workers: 1, // Single worker to avoid race conditions on shared DB
  reporter: 'html',
  timeout: 120_000, // 2 minutes per test (parsing is slow)
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  // Optionally start dev servers (if not running manually)
  // webServer: [
  //   { command: 'npm run dev:be', url: 'http://localhost:3001/health', reuseExistingServer: true },
  //   { command: 'npm run dev:fe', url: 'http://localhost:5173', reuseExistingServer: true },
  // ],
})
```

### Auth Setup Fixture
```typescript
// fe/e2e/fixtures/auth.setup.ts
import { test as setup, expect } from '@playwright/test'

const authFile = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('admin_password')
  await page.getByRole('button', { name: /sign in/i }).click()
  // Wait for redirect to dashboard after login
  await expect(page).toHaveURL(/\/(dashboard|datasets)/)
  await page.context().storageState({ path: authFile })
})
```

### Chat Feedback API Call (Existing Pattern)
```typescript
// Source: fe/src/features/chat/api/chatApi.ts (existing code)
sendFeedback: async (
  conversationId: string,
  messageId: string,
  thumbup: boolean,
  feedback?: string,
): Promise<void> => {
  await api.post(`${BASE_URL}/conversations/${conversationId}/feedback`, {
    message_id: messageId,
    thumbup,
    feedback,
  })
},
```

### Search Feedback Endpoint (New -- mirrors chat pattern)
```typescript
// Pattern for: be/src/modules/search/routes/search.routes.ts
// POST /api/search/apps/:id/feedback
router.post(
  '/apps/:id/feedback',
  requireAuth,
  validate({ body: searchFeedbackSchema, params: searchAppIdParamSchema }),
  controller.sendFeedback.bind(controller)
)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Feedback in citations JSONB | Dedicated feedback table | Phase 1 (new) | Enables analytics, search feedback support |
| No E2E tests | Playwright E2E suite | Phase 1 (new) | Bug discovery, regression prevention |
| RAGFlow UUID format everywhere | Normalization layer in BE models | Already exists | `.replace(/-/g, '')` pattern is pervasive but consistent |

**Deprecated/outdated:**
- RAGFlow's `ragflow_` index prefix was already renamed to `knowledge_` (commit fc37711)
- nmslib deprecation was already fixed (same commit)

## Open Questions

1. **Existing bug inventory**
   - What we know: CONTEXT.md says "Known bugs exist (mix of known and undiscovered)"
   - What's unclear: No specific bug list was provided
   - Recommendation: Let E2E tests discover bugs organically. The first test suite run will produce the bug inventory.

2. **Python worker test stability**
   - What we know: The Python worker has zero test coverage and 108 dependencies
   - What's unclear: Whether the task executor reliably completes parsing for all supported PDF types
   - Recommendation: Start with a simple, small PDF (< 5 pages) for initial E2E tests. Expand to larger/complex PDFs after the basic flow works.

3. **Chat message ID format for feedback**
   - What we know: Frontend generates temporary IDs like `assistant-{timestamp}` for messages before they get a real server ID
   - What's unclear: Whether the feedback API correctly handles real vs temporary message IDs
   - Recommendation: E2E tests should verify feedback works on messages with server-assigned IDs (after conversation history is loaded from the API).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright ^1.57.0 (E2E) + Vitest 2.1/3.0 (unit, existing) |
| Config file | `fe/playwright.config.ts` (Wave 0 -- does not exist yet) |
| Quick run command | `npx playwright test --project=chromium --grep @smoke` |
| Full suite command | `npx playwright test --project=chromium` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAB-01 | Dataset CRUD (create, update, delete KB) | E2E | `npx playwright test e2e/dataset/dataset-crud.spec.ts` | Wave 0 |
| STAB-02 | Document upload + parse execution | E2E | `npx playwright test e2e/dataset/document-upload.spec.ts` | Wave 0 |
| STAB-03 | Chunk generation + OpenSearch indexing | E2E | `npx playwright test e2e/dataset/chunk-verify.spec.ts` | Wave 0 |
| STAB-04 | Systematic bug discovery across pipeline | E2E | `npx playwright test` (full suite) | Wave 0 |
| STAB-05 | Parser migration completeness | E2E | `npx playwright test e2e/dataset/document-upload.spec.ts --grep @parsers` | Wave 0 |
| CHAT-01 | Chat streaming + citations + conversation | E2E | `npx playwright test e2e/chat/chat-stream.spec.ts` | Wave 0 |
| CHAT-02 | Search results + filtering + pagination | E2E | `npx playwright test e2e/search/search-query.spec.ts` | Wave 0 |
| CHAT-03 | Answer feedback (chat + search) | E2E | `npx playwright test e2e/chat/chat-feedback.spec.ts e2e/search/search-feedback.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx playwright test --project=chromium --grep @smoke` (< 30 seconds, tests core happy path)
- **Per wave merge:** `npx playwright test --project=chromium` (full suite)
- **Phase gate:** Full suite green before phase verification

### Wave 0 Gaps
- [ ] `fe/playwright.config.ts` -- Playwright configuration file
- [ ] `fe/e2e/fixtures/auth.setup.ts` -- Auth state setup
- [ ] `fe/e2e/fixtures/auth.fixture.ts` -- Reusable auth fixture
- [ ] `fe/e2e/helpers/api.helper.ts` -- API call helpers for setup/teardown
- [ ] `fe/e2e/helpers/wait.helper.ts` -- Async operation polling helpers
- [ ] `fe/e2e/test-data/sample.pdf` -- Small test PDF file
- [ ] `fe/e2e/.auth/` directory in `.gitignore` -- Auth state should not be committed
- [ ] Playwright browsers install: `npx playwright install chromium`
- [ ] `answer_feedback` DB migration for CHAT-03

## Sources

### Primary (HIGH confidence)
- Codebase inspection of all canonical reference files listed in CONTEXT.md
- `be/src/modules/chat/` -- Full chat feedback implementation (routes, controller, service, schema)
- `be/src/modules/search/routes/search.routes.ts` -- Confirmed no feedback endpoint exists
- `be/src/modules/rag/` -- Complete RAG model layer with UUID normalization patterns
- `advance-rag/rag/svr/task_executor.py` -- Parser FACTORY, Redis queue consumption, task lifecycle
- `fe/package.json` -- Confirmed `@playwright/test` ^1.57.0 is already a dependency
- `.planning/codebase/TESTING.md` -- Confirmed Playwright is available but not configured
- `.planning/codebase/CONCERNS.md` -- Confirmed zero Python test coverage, dual ORM risk

### Secondary (MEDIUM confidence)
- npm registry: `@playwright/test` latest version is 1.58.2 (verified via `npm view`)
- Playwright official docs -- `storageState`, `page.request`, `webServer` configuration patterns

### Tertiary (LOW confidence)
- None -- all findings verified against codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in the project, versions verified against package.json
- Architecture: HIGH -- Playwright test structure follows official patterns; feedback schema based on existing chat pattern
- Pitfalls: HIGH -- all pitfalls identified from direct codebase inspection (UUID stripping, SYSTEM_TENANT_ID duplication, OpenSearch refresh timing)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- no external dependency changes expected)
