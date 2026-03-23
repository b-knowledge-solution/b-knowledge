# Phase 02: Migration Memory Feature from RAGFlow to B-Knowledge - Research

**Researched:** 2026-03-23
**Domain:** Memory system (persistent knowledge store for agents/conversations)
**Confidence:** HIGH

## Summary

RAGFlow's memory system is a well-defined feature with clear boundaries: a PostgreSQL `memory` table stores pool configuration (name, types, models, prompts, forgetting policy), while OpenSearch stores the actual memory messages with embedding vectors for hybrid search. The extraction pipeline uses LLM calls to convert raw conversations into structured Semantic/Episodic/Procedural knowledge items with temporal validity timestamps.

B-Knowledge already has all the infrastructure needed: OpenSearch client with singleton pattern (`@opensearch-project/opensearch ^3.5.1`), LLM client service via OpenAI SDK, Knex migrations for PostgreSQL, and established module patterns from the agents module. The memory module mirrors the agents module structurally (sub-directory layout with models, services, controllers, routes, schemas) and reuses the same OpenSearch index naming pattern (`memory_{tenantId}` paralleling `knowledge_{tenantId}`).

The key integration points are: (1) hooking memory save into `chat-conversation.service.ts` after conversation completion, (2) adding memory_read/memory_write handlers to `advance-rag/rag/agent/node_executor.py`, (3) adding Memory under the Agents nav group in the sidebar, and (4) creating the OpenSearch index with both text and knn_vector fields matching the existing chunk index pattern.

**Primary recommendation:** Build as a self-contained `be/src/modules/memory/` module with its own OpenSearch index (`memory_{tenantId}`), two PostgreSQL tables (`memories` + no separate messages table -- messages live in OpenSearch), and integrate via barrel imports into chat and agent modules.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** All 4 memory types: Raw (verbatim messages, bitmask=1), Semantic (facts/definitions, bitmask=2), Episodic (events/experiences, bitmask=4), Procedural (how-to/workflows, bitmask=8). Bitmask enables combining types per pool.
- **D-02:** Configurable extraction mode: batch extract on session end (default) + optional real-time extraction after each conversation turn (per memory pool setting).
- **D-03:** Port RAGFlow's PromptAssembler prompt templates as defaults, with per-pool customization via system_prompt + user_prompt fields.
- **D-04:** Temporal validity timestamps (valid_at, invalid_at) on all memory items. Enables forgetting stale facts and time-scoped queries.
- **D-05:** Memory messages stored in OpenSearch with embedding vectors for hybrid vector+text search. Reuses B-Knowledge's existing OpenSearch infrastructure.
- **D-06:** Both table and graph storage types. Table = flat messages in OpenSearch. Graph = knowledge graph relationships using B-Knowledge's existing GraphRAG infrastructure.
- **D-07:** FIFO forgetting policy only. When memory pool reaches memory_size limit, oldest items are removed.
- **D-08:** Memory usable from both Chat and Agents. Chat assistants link to memory pools for auto-save + context injection. Agent canvas gets Memory operator node for explicit read/write.
- **D-09:** Both auto-inject and explicit Memory node. Auto-injection retrieves relevant memories into LLM context window by default. Memory operator node in canvas for advanced control (specific queries, writes, cross-pool access).
- **D-10:** Flexible memory pool scoping: user-scoped, agent-scoped, or team-scoped. Users choose scope when creating a pool. Permissions model matches RAGFlow (me/team).
- **D-11:** Import option for existing chat history. One-click import processes past conversations through memory extraction pipeline to retroactively build memory.
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

### Deferred Ideas (OUT OF SCOPE)
- LRU or relevance-based forgetting policies -- keep FIFO for now, add sophisticated policies later
- Memory analytics dashboard (most accessed memories, extraction success rate)
- Cross-tenant memory sharing -- out of scope, memory stays within tenant isolation
- Memory import from external sources (Notion, Confluence) -- future integration phase
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @opensearch-project/opensearch | ^3.5.1 | Memory message storage + hybrid search | Already in BE dependencies, same client used for RAG chunks |
| knex | ^3.1.0 | Memory pool PostgreSQL schema + migrations | Project ORM standard |
| zod | ^3.25.76 | Request validation schemas | Project validation standard |
| openai (via llm-client.service) | existing | LLM calls for memory extraction | Project LLM client standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| uuid (v4) | existing | Generate memory/message IDs | All CRUD operations |
| lucide-react | existing | Memory UI icons (Brain, BookOpen) | Frontend sidebar + pages |
| @tanstack/react-query | v5 | Memory data fetching + cache | All FE data operations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| OpenSearch for messages | PostgreSQL JSONB | OpenSearch provides built-in vector search; PG would need pgvector extension |
| Separate memory index | Same knowledge index | Separate index prevents field conflicts and simplifies FIFO deletion |

**Installation:** No new packages needed. All dependencies already exist in the project.

## Architecture Patterns

### Recommended Project Structure

**Backend:**
```
be/src/modules/memory/
  controllers/
    memory.controller.ts         # CRUD + message management endpoints
  models/
    memory.model.ts              # Memory pool model (PostgreSQL via Knex)
  services/
    memory.service.ts            # Pool CRUD, settings management
    memory-message.service.ts    # OpenSearch CRUD, search, FIFO cleanup
    memory-extraction.service.ts # LLM-powered extraction pipeline
  routes/
    memory.routes.ts             # Route definitions
  schemas/
    memory.schemas.ts            # Zod validation schemas
  prompts/
    extraction.prompts.ts        # Default prompt templates (ported from RAGFlow)
  index.ts                       # Barrel exports
```

**Frontend:**
```
fe/src/features/memory/
  api/
    memoryApi.ts                 # Raw HTTP calls
    memoryQueries.ts             # TanStack Query hooks
  components/
    MemoryCard.tsx               # Card for memory list grid
    MemoryMessageTable.tsx       # Message browser table
    MemorySettingsPanel.tsx      # Settings form (models, prompts, policy)
    ImportHistoryDialog.tsx      # Chat history import dialog
  pages/
    MemoryListPage.tsx           # Card grid with create/edit/delete
    MemoryDetailPage.tsx         # Message browser + settings tabs
  types/
    memory.types.ts              # TypeScript interfaces
  index.ts                       # Barrel exports
```

### Pattern 1: Memory Pool Model (PostgreSQL)
**What:** Single `memories` table stores pool configuration. Messages live in OpenSearch, not PostgreSQL.
**When to use:** All memory pool CRUD operations.
**Example:**
```typescript
// Memory pool fields (PostgreSQL memories table)
interface Memory {
  id: string                    // UUID primary key
  name: string                  // Pool display name
  description: string | null    // Optional description
  avatar: string | null         // Avatar URL
  memory_type: number           // Bitmask: RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8
  storage_type: string          // 'table' | 'graph'
  memory_size: number           // Max size in bytes (default 5242880 = 5MB)
  forgetting_policy: string     // 'FIFO' only for now
  embd_id: string | null        // Per-pool embedding model provider ID
  llm_id: string | null         // Per-pool LLM provider ID
  temperature: number           // LLM temperature (default 0.1)
  system_prompt: string | null  // Custom extraction system prompt
  user_prompt: string | null    // Custom extraction user prompt
  extraction_mode: string       // 'batch' | 'realtime' (D-02)
  permission: string            // 'me' | 'team' (D-10)
  scope_type: string            // 'user' | 'agent' | 'team' (D-10)
  scope_id: string | null       // User/Agent/Team UUID based on scope_type
  tenant_id: string             // Multi-tenant isolation
  created_by: string | null     // Creator user ID
  created_at: Date
  updated_at: Date
}
```

### Pattern 2: Memory Message (OpenSearch Document)
**What:** Each memory message is an OpenSearch document with text content + embedding vector.
**When to use:** All message storage, search, and FIFO cleanup.
**Example:**
```typescript
// OpenSearch document structure for memory messages
interface MemoryMessageDoc {
  message_id: string            // Unique message ID within the index
  memory_id: string             // Parent memory pool ID
  message_type: number          // 1=RAW, 2=SEMANTIC, 4=EPISODIC, 8=PROCEDURAL
  source_id: string | null      // Chat session or agent run that generated this
  user_id: string | null        // User who triggered the conversation
  agent_id: string | null       // Agent that was running (if applicable)
  session_id: string | null     // Chat session ID
  valid_at: string | null       // ISO timestamp when fact became valid (D-04)
  invalid_at: string | null     // ISO timestamp when fact expires (D-04)
  forget_at: string | null      // ISO timestamp when manually forgotten
  status: number                // 1=active, 0=forgotten
  content: string               // Text content of the memory
  content_embed: number[]       // Embedding vector for semantic search
  tenant_id: string             // Multi-tenant isolation
  created_at: string            // ISO timestamp
}
```

### Pattern 3: OpenSearch Index Configuration
**What:** Dedicated memory index with text + knn_vector mapping.
**When to use:** Index creation on first memory pool creation for a tenant.
```typescript
// Index naming: memory_{tenantId} (parallels knowledge_{tenantId})
const indexMapping = {
  settings: {
    index: { knn: true },
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    properties: {
      message_id: { type: 'keyword' },
      memory_id: { type: 'keyword' },
      message_type: { type: 'integer' },
      source_id: { type: 'keyword' },
      user_id: { type: 'keyword' },
      agent_id: { type: 'keyword' },
      session_id: { type: 'keyword' },
      valid_at: { type: 'date' },
      invalid_at: { type: 'date' },
      forget_at: { type: 'date' },
      status: { type: 'integer' },
      content: { type: 'text', analyzer: 'standard' },
      content_embed: {
        type: 'knn_vector',
        dimension: 1024,  // Must match embedding model dimension
        method: { name: 'hnsw', engine: 'nmslib', space_type: 'cosinesimil' }
      },
      tenant_id: { type: 'keyword' },
      created_at: { type: 'date' },
    }
  }
}
```

### Pattern 4: Memory Extraction Pipeline
**What:** LLM extracts structured knowledge from raw conversation text.
**When to use:** After chat session ends (batch mode) or after each turn (realtime mode).
```typescript
// Extraction flow:
// 1. Raw conversation text -> PromptAssembler (system + user prompt)
// 2. LLM call via llmClientService.chat() with memory-specific provider
// 3. Parse JSON array from LLM response
// 4. Generate embeddings via embedding model
// 5. Insert into OpenSearch with FIFO cleanup
```

### Pattern 5: Hybrid Memory Search
**What:** Combined text + vector search for memory retrieval.
**When to use:** When injecting memories into chat/agent context.
```typescript
// Search follows same pattern as rag-search.service.ts hybridSearch:
// 1. Full-text match on 'content' field
// 2. knn search on 'content_embed' field
// 3. Weighted combination (default: 0.7 vector, 0.3 text -- Claude's discretion)
// 4. Filter by memory_id, status=1 (active), tenant_id
// 5. Optional time-scope filter on valid_at/invalid_at
```

### Anti-Patterns to Avoid
- **Storing messages in PostgreSQL:** Messages must go to OpenSearch for vector search. PostgreSQL only stores pool configuration.
- **Shared index with knowledge chunks:** Memory documents have different field schemas. Use a dedicated `memory_{tenantId}` index.
- **Embedding at query time only:** Pre-compute embeddings at insert time. Embedding on every search query is too expensive.
- **Cross-module direct imports:** Memory service accessed via barrel export only. Chat/agent modules import from `@/modules/memory/index.js`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector similarity search | Custom cosine distance math | OpenSearch knn_vector with HNSW | Battle-tested, hardware-optimized |
| LLM prompt management | Custom template engine | String interpolation + prompt constants | Simple enough, no extra abstraction needed |
| Embedding generation | Custom embedding client | Existing llmClientService with embedding endpoint | Already supports all providers |
| FIFO cleanup | Custom cron job | Delete-by-query on insert when size exceeded | Atomic, no separate process needed |
| Memory search ranking | Custom fusion algorithm | OpenSearch bool query with should clauses | Same pattern as existing hybridSearch |

**Key insight:** The existing `rag-search.service.ts` pattern (OpenSearch client singleton, tenant-scoped index, hybrid search with filter clauses) is directly replicable for memory. Do not invent new patterns.

## Common Pitfalls

### Pitfall 1: Embedding Dimension Mismatch
**What goes wrong:** Memory index created with dimension=1024 but pool uses an embedding model that outputs 768-dimension vectors.
**Why it happens:** Per-pool embedding model selection (D-14) means different pools may use different models.
**How to avoid:** Store the embedding dimension on the memory pool record. When creating the OpenSearch index mapping, use the dimension from the first pool. For multi-dimension support, either enforce same dimension per tenant or use separate indices.
**Warning signs:** OpenSearch bulk insert failures with "dimension mismatch" errors.

### Pitfall 2: FIFO Deletion Race Condition
**What goes wrong:** Two concurrent memory saves both detect size exceeded, both delete the same oldest messages, actual size drops below expected.
**Why it happens:** No locking between concurrent memory extraction jobs.
**How to avoid:** Use optimistic concurrency -- calculate size, delete oldest N, then insert. Accept slight over-deletion as harmless.
**Warning signs:** Memory pool size fluctuating unexpectedly.

### Pitfall 3: LLM Extraction JSON Parsing Failures
**What goes wrong:** LLM returns malformed JSON from extraction prompt, causing memory save to fail silently.
**Why it happens:** LLMs do not always produce valid JSON despite prompt instructions.
**How to avoid:** Wrap JSON.parse in try/catch. Use regex to extract JSON array from response text. Fall back to storing raw text if extraction fails. Log extraction failures for observability.
**Warning signs:** Memory pools with only RAW messages, no extracted semantic/episodic/procedural.

### Pitfall 4: Missing Tenant Isolation on OpenSearch Queries
**What goes wrong:** Memory search returns messages from other tenants.
**Why it happens:** Forgetting to add tenant_id filter to every OpenSearch query.
**How to avoid:** Follow the existing `getFilters(tenantId)` pattern from `rag-search.service.ts`. Make tenantId the first parameter on all service methods. Use the index naming pattern `memory_{tenantId}` as an additional isolation layer.
**Warning signs:** Users seeing memories they did not create.

### Pitfall 5: Chat Integration Blocking the Response Stream
**What goes wrong:** Memory extraction (LLM call) blocks the SSE response to the user.
**Why it happens:** Calling extraction synchronously in the chat pipeline.
**How to avoid:** Memory extraction MUST be fire-and-forget (async, non-blocking). Use `void memoryExtractionService.extract(...).catch(err => log.error(...))` pattern after the response stream completes.
**Warning signs:** Chat responses delayed by 2-5 seconds (the LLM extraction time).

### Pitfall 6: OpenSearch Index Not Created Before First Insert
**What goes wrong:** First memory message insert fails with "index_not_found_exception".
**Why it happens:** Index creation is lazy but the insert races ahead.
**How to avoid:** Create index in memory-message.service.ts with an `ensureIndex()` helper that checks `indices.exists()` before first insert. Cache the check result in-memory per tenant.
**Warning signs:** First memory save after deployment always fails.

## Code Examples

### Memory Pool Creation (Service Layer)
```typescript
// Source: Derived from existing agent.service.ts pattern
async createMemoryPool(dto: CreateMemoryDto, userId: string, tenantId: string): Promise<Memory> {
  const memory = await ModelFactory.memory.create({
    ...dto,
    tenant_id: tenantId,
    created_by: userId,
  })
  // Ensure OpenSearch index exists for this tenant
  await this.messageService.ensureIndex(tenantId)
  return memory
}
```

### Memory Extraction After Chat (Integration Hook)
```typescript
// Source: Derived from chat-conversation.service.ts pattern
// Called after SSE stream completes, non-blocking
void memoryExtractionService
  .extractFromConversation(memoryId, userInput, assistantResponse, sessionId, userId)
  .catch(err => log.error('Memory extraction failed', { memoryId, error: String(err) }))
```

### Hybrid Memory Search
```typescript
// Source: Derived from rag-search.service.ts hybridSearch pattern
async searchMemory(
  tenantId: string,
  memoryId: string,
  query: string,
  queryVector: number[],
  topK: number = 10,
  vectorWeight: number = 0.7,
): Promise<MemorySearchResult[]> {
  const client = getClient()
  const res = await client.search({
    index: `memory_${tenantId}`,
    body: {
      query: {
        bool: {
          must: [{ term: { memory_id: memoryId } }],
          filter: [
            { term: { tenant_id: tenantId } },
            { term: { status: 1 } },
          ],
          should: [
            { match: { content: { query, boost: 1 - vectorWeight } } },
            { knn: { content_embed: { vector: queryVector, k: topK } } },
          ],
        },
      },
      size: topK,
    },
  })
  return mapMemoryHits(res.body.hits.hits)
}
```

### Sidebar Navigation Update
```typescript
// Source: Derived from fe/src/layouts/sidebarNav.ts
// Convert Agents from top-level link to expandable group
{
  labelKey: 'nav.agents',
  icon: Workflow,
  children: [
    { path: '/agents', labelKey: 'nav.agentList', icon: Workflow },
    { path: '/memory', labelKey: 'nav.memory', icon: Brain },
  ],
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No memory | RAGFlow 0.23.0 added Memory module | Dec 2025 | First-class memory with 4 types |
| Memory without API | RAGFlow 0.24.0 added Memory API | Feb 2026 | HTTP + Python SDK for memory management |
| Elasticsearch only | OpenSearch 3.5 as doc engine | Dec 2025 | B-Knowledge uses OpenSearch natively |

**Deprecated/outdated:**
- RAGFlow uses Peewee ORM for Memory model -- B-Knowledge uses Knex (project standard)
- RAGFlow uses Elasticsearch client -- B-Knowledge uses `@opensearch-project/opensearch`

## Open Questions

1. **Embedding dimension per-tenant vs per-pool**
   - What we know: RAGFlow uses per-pool embedding model selection (embd_id on memory)
   - What's unclear: OpenSearch index mapping requires fixed dimension at creation time
   - Recommendation: Use the tenant's default embedding model dimension for the index. Validate that per-pool embd_id produces same dimension. Error on mismatch at pool creation time.

2. **Graph storage type implementation**
   - What we know: D-06 specifies both table and graph storage types
   - What's unclear: Whether to reuse the existing GraphRAG entity/relation document format or create a separate graph schema
   - Recommendation: Reuse existing `rag-graphrag.service.ts` patterns. Graph memory stores entities/relations in the same `memory_{tenantId}` index with a `knowledge_graph_kwd` field discriminator, matching how GraphRAG works in the knowledge index.

3. **Chat assistant linking to memory pools**
   - What we know: D-08 says chat assistants link to memory pools for auto-save + context injection
   - What's unclear: Whether to add a `memory_id` column to `chat_assistants` table or use a junction table
   - Recommendation: Add `memory_id` nullable UUID column to `chat_assistants` table (simple FK, one pool per assistant). This keeps it simple and matches how `kb_ids` is used for dataset linking.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (BE + FE) |
| Config file | `be/vitest.config.ts`, `fe/vitest.config.ts` |
| Quick run command | `npm run test -w be -- --run tests/memory/` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Memory type bitmask operations (combine, check) | unit | `npm run test -w be -- --run tests/memory/memory.model.test.ts` | No - Wave 0 |
| D-02 | Batch vs realtime extraction mode | unit | `npm run test -w be -- --run tests/memory/memory-extraction.service.test.ts` | No - Wave 0 |
| D-03 | Prompt template assembly with defaults + customization | unit | `npm run test -w be -- --run tests/memory/memory-extraction.service.test.ts` | No - Wave 0 |
| D-05 | OpenSearch message CRUD + hybrid search | unit | `npm run test -w be -- --run tests/memory/memory-message.service.test.ts` | No - Wave 0 |
| D-07 | FIFO forgetting (oldest removed when limit reached) | unit | `npm run test -w be -- --run tests/memory/memory-message.service.test.ts` | No - Wave 0 |
| D-08 | Chat integration (auto-save, context injection) | unit | `npm run test -w be -- --run tests/memory/memory-chat-integration.test.ts` | No - Wave 0 |
| D-10 | Pool scoping (user/agent/team) | unit | `npm run test -w be -- --run tests/memory/memory.service.test.ts` | No - Wave 0 |
| D-11 | Chat history import | unit | `npm run test -w be -- --run tests/memory/memory-import.service.test.ts` | No - Wave 0 |
| D-12 | Sidebar navigation update | unit | `npm run test -w fe -- --run tests/features/memory/MemoryListPage.test.tsx` | No - Wave 0 |
| D-13 | Memory list, message browser, settings views | unit | `npm run test -w fe -- --run tests/features/memory/` | No - Wave 0 |
| D-14 | Per-pool model selection | unit | `npm run test -w be -- --run tests/memory/memory.service.test.ts` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run tests/memory/`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `be/tests/memory/memory.model.test.ts` -- covers D-01 (bitmask operations, pool CRUD)
- [ ] `be/tests/memory/memory.service.test.ts` -- covers D-10, D-14 (pool management, scoping, model selection)
- [ ] `be/tests/memory/memory-message.service.test.ts` -- covers D-05, D-07 (OpenSearch CRUD, search, FIFO)
- [ ] `be/tests/memory/memory-extraction.service.test.ts` -- covers D-02, D-03 (LLM extraction, prompts)
- [ ] `be/tests/memory/memory.controller.test.ts` -- covers API endpoint validation
- [ ] `fe/tests/features/memory/MemoryListPage.test.tsx` -- covers D-12, D-13 (list page rendering)
- [ ] `fe/tests/features/memory/memoryApi.test.ts` -- covers FE API layer

## Sources

### Primary (HIGH confidence)
- RAGFlow `common/constants.py` MemoryType enum -- bitmask values RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8; MemoryStorageType TABLE/GRAPH; ForgettingPolicy FIFO
- RAGFlow `memory/services/messages.py` MessageService -- 13 methods for OpenSearch CRUD, search, FIFO cleanup
- RAGFlow `memory/utils/prompt_util.py` PromptAssembler -- system/user prompt templates for Semantic, Episodic, Procedural extraction
- RAGFlow `api/apps/restful_apis/memory_api.py` -- REST API: 6 memory endpoints + 6 message endpoints
- RAGFlow `api/db/joint_services/memory_message_service.py` -- save_to_memory + query_message extraction pipeline
- Existing B-Knowledge `be/src/modules/rag/services/rag-search.service.ts` -- OpenSearch client pattern, tenant isolation, hybrid search
- Existing B-Knowledge `be/src/modules/agents/` -- Module structure pattern (models, services, controllers, routes, schemas)
- Existing B-Knowledge `be/src/shared/models/factory.ts` -- ModelFactory singleton pattern
- Existing B-Knowledge `fe/src/layouts/sidebarNav.ts` -- Navigation configuration pattern

### Secondary (MEDIUM confidence)
- [RAGFlow 0.23.0 blog](https://ragflow.io/blog/ragflow-0.23.0-advanding-memory-rag-and-agent-performance) -- Memory module introduction
- [RAGFlow Memory docs](https://ragflow.io/docs/use_memory) -- 5MB default, ~500 messages capacity, 9KB per message with 1024-dim embeddings
- [RAGFlow 0.24.0 blog](https://ragflow.io/blog/ragflow-0.24.0-memory-api-knowledge-base-governance-and-agent-chat-history) -- Memory API addition

### Tertiary (LOW confidence)
- None -- all findings verified against source code or official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies needed
- Architecture: HIGH -- direct replication of existing patterns (agents module, rag-search service)
- Pitfalls: HIGH -- derived from understanding of the codebase patterns and RAGFlow source
- RAGFlow memory internals: MEDIUM -- source code accessed via GitHub web, not local checkout

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable -- memory is a well-defined feature with locked decisions)
