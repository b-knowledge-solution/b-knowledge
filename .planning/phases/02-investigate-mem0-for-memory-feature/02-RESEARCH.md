# Phase 02: Investigate mem0 for Memory Feature - Research

**Researched:** 2026-03-24
**Domain:** AI memory systems, mem0 library evaluation, integration architecture
**Confidence:** HIGH

## Summary

mem0 (v1.0.5, Apache 2.0 license) is a viable candidate for replacing b-knowledge's existing memory extraction and storage backend. The critical deal-breaker evaluation reveals: (1) OpenSearch IS supported as a vector store, (2) multi-tenant isolation is achievable via `user_id`/`agent_id` scoping and `collection_name` per tenant, (3) custom LLM and embedding providers can be configured programmatically, and (4) the Apache 2.0 license is fully compatible with closed-source enterprise use.

The self-hosted REST API server (FastAPI) exposes all memory operations over HTTP, fitting b-knowledge's polyglot architecture. The biggest integration challenge is that mem0's default server hardcodes pgvector + Neo4j, so b-knowledge would need to fork/customize the server startup to use OpenSearch + Apache AGE (or skip graph entirely initially). mem0's killer differentiators are LLM-powered deduplication/conflict resolution (ADD/UPDATE/DELETE/NOOP decisions per memory) and graph memory for entity relationships -- both features b-knowledge currently lacks.

**Primary recommendation:** Proceed with mem0 integration (GO). Deploy as a custom FastAPI sidecar service within the advance-rag Python ecosystem, configured to use b-knowledge's existing OpenSearch and PostgreSQL infrastructure. Apache AGE (PostgreSQL extension, Apache 2.0) is the recommended graph store. The wrapper approach (D-01) is sound -- b-knowledge's TypeScript API layer calls the mem0 sidecar via HTTP.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Wrap mem0 as a pluggable backend behind the existing b-knowledge memory API. Frontend and API layer stay the same; mem0 handles storage + extraction underneath.
- **D-02:** Default mem0 for new pools, native fallback for existing. New memory pools default to mem0 backend. Existing pools continue on native OpenSearch+LLM pipeline. No UI toggle -- migration path approach.
- **D-03:** Share existing infrastructure. Configure mem0 to use b-knowledge's existing PostgreSQL and OpenSearch instances. No new database or vector store infrastructure (except potentially a graph database).
- **D-04:** Evaluate ALL four major mem0 capabilities: graph memory, memory CRUD + search API, multi-level memory (user/agent/session), and self-hosted deployment.
- **D-05:** Open-source self-hosted only. Do not evaluate mem0's managed platform (paid API). No cloud service dependency.
- **D-06:** Compare extraction quality. Run sample conversations through both pipelines (mem0 vs current 4-type bitmask extraction) and compare quality of extracted memories.
- **D-07:** Must support multi-tenant isolation. mem0 backend must isolate data per tenant, matching current tenant_id-based isolation. This is a hard requirement, not optional.
- **D-08:** Map agent node integration. Ensure memory_read/memory_write agent canvas nodes work seamlessly through the mem0 backend.
- **D-09:** Must use b-knowledge's existing embedding models. mem0 should use tenant-configured embedding models (embd_id per pool) from the tenant_llm system, not its own embedding config.
- **D-10:** OpenSearch as vector store. Stick with existing OpenSearch. Do not evaluate alternative vector stores (Qdrant, pgvector, etc.).
- **D-11:** Investigate Neo4j CE + alternatives for graph memory. Verify Neo4j Community Edition licensing for closed-source enterprise use. Also evaluate lighter alternatives: FalkorDB, Apache AGE (PostgreSQL extension). Licensing compatibility is a deal-breaker.
- **D-12:** REST API preferred. Investigate if mem0 can run as a standalone HTTP service. This fits b-knowledge's polyglot architecture (TypeScript backend calling Python services via HTTP).
- **D-13:** Forgetting policy and memory lifecycle is critical. Must verify mem0 has equivalent or better memory management (FIFO forgetting, size limits) compared to current system.
- **D-14:** Map frontend settings impact. Document which MemorySettingsPanel settings (bitmask types, extraction mode, prompts, temperature, etc.) map to mem0 concepts and which become obsolete.
- **D-15:** Plan data migration path. Document how existing memory messages would migrate from OpenSearch native format to mem0's format.
- **D-16:** Must use b-knowledge's existing LLM providers. mem0 should route through b-knowledge's tenant_llm configured providers for extraction, not its own LLM config.
- **D-17:** Map prompt customization. Understand how mem0's custom instructions compare to b-knowledge's per-pool system_prompt/user_prompt templates. Ensure customization isn't lost.
- **D-18:** Deduplication and conflict resolution are key differentiators. These are features the current system lacks (listed as out-of-scope in FR-MEMORY). Evaluate thoroughly as major reasons to adopt mem0.
- **D-19:** Evaluate memory versioning. Check mem0's memory versioning and history tracking capabilities. Current system only has status (active/forgotten) with no version history.
- **D-20:** Go/no-go decision required. Investigation must produce a clear recommendation: adopt mem0 or stick with native. Binary outcome with supporting evidence.
- **D-21:** Deal-breakers (any one = reject mem0): (1) No OpenSearch support as vector store, (2) No multi-tenant data isolation, (3) Cannot use b-knowledge's existing LLM/embedding providers, (4) Licensing incompatible with closed-source enterprise use.
- **D-22:** Performance benchmarks required. Run identical workloads through both systems. Compare add/search latency and throughput.
- **D-23:** ADR document in docs/adr/. Create a new docs/adr/ directory for Architecture Decision Records. This will be the first ADR in the project.
- **D-24:** Full API mapping table. Create a detailed table: b-knowledge memory endpoint -> mem0 equivalent -> gaps/differences. Essential for the wrapper approach.
- **D-25:** Full integration plan. If mem0 passes evaluation, include a detailed phase-by-phase plan for how the actual integration would proceed.
- **D-26:** ADR is standalone. Do not update existing architecture docs (docs/basic-design/memory-architecture.md). Architecture doc gets updated in the actual integration phase.

### Claude's Discretion
- Architecture of the Python integration layer (sidecar service vs embed in advance-rag)
- Structure and format of the ADR document
- How to run performance benchmarks (tooling, test data)
- Order of evaluation tasks within the investigation
- How to structure the integration plan (number of phases, granularity)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Deal-Breaker Evaluation (D-21)

| # | Deal-Breaker | Status | Evidence | Confidence |
|---|-------------|--------|----------|------------|
| 1 | OpenSearch support as vector store | PASS | mem0 has `opensearch` provider in `mem0/vector_stores/opensearch.py`. Uses NMSLIB engine with HNSW algorithm, cosine similarity. Config: `{"provider": "opensearch", "config": {"host": "...", "port": 9201, "collection_name": "...", "embedding_model_dims": 1024}}` | HIGH |
| 2 | Multi-tenant data isolation | PASS | mem0 filters by `user_id`, `agent_id`, `run_id` on all operations. OpenSearch `collection_name` can be set per-tenant (e.g., `memory_{tenantId}`). Custom sidecar can enforce tenant_id on every call. | HIGH |
| 3 | Custom LLM/embedding providers | PASS | mem0 supports 16+ LLM providers (OpenAI, Anthropic, Ollama, LiteLLM, etc.) and 11+ embedding providers. `openai_base_url` and `ollama_base_url` allow custom endpoints. LiteLLM acts as universal proxy. | HIGH |
| 4 | Licensing compatibility | PASS | mem0 is Apache 2.0 -- fully permissive for closed-source enterprise. | HIGH |

**Verdict: All deal-breakers PASS. Proceed with full evaluation.**

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| mem0ai | 1.0.5 | Memory layer (extraction, dedup, search, graph) | Primary investigation target; Apache 2.0 |
| opensearch-py | 2.x | OpenSearch client (used by mem0 internally) | Already in b-knowledge's stack |
| FastAPI | 0.100+ | REST API server for mem0 sidecar | mem0's official server framework |
| uvicorn | 0.30+ | ASGI server | Standard for FastAPI apps |

### Supporting (Graph Store Options -- choose one)
| Library | Version | Purpose | License | Recommendation |
|---------|---------|---------|---------|----------------|
| Apache AGE | 1.5+ | PostgreSQL graph extension | Apache 2.0 | RECOMMENDED -- reuses existing PostgreSQL, no new infra |
| FalkorDB | latest | Redis-based graph DB | SSPLv1 | ALTERNATIVE -- faster p99 but SSPL license risk for SaaS |
| Neo4j CE | 5.x | Graph database | GPLv3 + Commons Clause | NOT RECOMMENDED -- AGPL/GPL restrictive for closed-source |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Apache AGE | Neo4j CE | Better graph tooling but GPL licensing restricts closed-source distribution |
| Apache AGE | FalkorDB | 300x faster p99 latency but SSPLv1 creates SaaS distribution risk |
| Apache AGE | No graph store | Simpler setup but loses mem0's key graph memory differentiator |
| Custom sidecar | Embed in advance-rag | Simpler deployment but couples mem0 lifecycle to RAG worker |

## Architecture Patterns

### Recommended Integration Architecture

```
                  +-----------------+
                  |   Frontend      |  (unchanged)
                  |   React SPA     |
                  +-------+---------+
                          |
                          v
                  +-----------------+
                  |   BE Express    |  (unchanged API layer)
                  |   Memory API    |
                  |   /api/memory/* |
                  +-------+---------+
                          |
              +-----------+-----------+
              |                       |
    +---------v---------+   +---------v---------+
    | mem0 Sidecar      |   | Native Pipeline   |
    | (FastAPI :8888)   |   | (OpenSearch direct)|
    | New pools         |   | Legacy pools       |
    +---+-------+---+---+   +-------------------+
        |       |   |
        v       v   v
    +------+ +----+ +--------+
    |OpenSrch| |PG | |AGE ext |
    |Vector  | |Hist| |Graph   |
    +------+ +----+ +--------+
```

### Pattern 1: Backend Routing by Pool Backend Type
**What:** The TypeScript memory service checks a `backend` field on the memory pool record to decide whether to route to mem0 sidecar (HTTP) or native OpenSearch pipeline.
**When to use:** Every memory operation (add, search, get, delete).
**Example:**
```typescript
// In memory-extraction.service.ts
if (memory.backend === 'mem0') {
  // Route to mem0 sidecar via HTTP
  await fetch(`http://mem0-sidecar:8888/memories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify({
      messages: [{ role: 'user', content: userInput }, { role: 'assistant', content: assistantResponse }],
      user_id: `${tenantId}:${userId}`,
      metadata: { memory_pool_id: memoryId, tenant_id: tenantId }
    })
  })
} else {
  // Existing native extraction pipeline
  await this.extractByType(conversation, typeBit, memory)
}
```

### Pattern 2: Per-Tenant mem0 Configuration
**What:** The mem0 sidecar accepts per-request configuration or uses pre-configured tenant profiles to route LLM/embedding calls through tenant-specific providers.
**When to use:** Enforcing D-09 (tenant embedding models) and D-16 (tenant LLM providers).
**Challenge:** mem0's default server uses a single global `Memory.from_config()`. Multi-tenant requires either: (a) custom `/configure` calls per request (expensive), or (b) a custom sidecar that creates `Memory` instances per tenant config, or (c) a proxy layer (LiteLLM) that routes model calls based on tenant headers.

**Recommended approach:** Custom sidecar with tenant-aware Memory instances cached by tenant_id + llm_id + embd_id composite key.

### Pattern 3: Apache AGE Graph Integration
**What:** Use Apache AGE as mem0's graph store provider, running as a PostgreSQL extension on the existing PostgreSQL 17 instance.
**When to use:** Enabling graph memory (entity/relationship extraction) without adding new infrastructure.
**Setup:**
```sql
-- Enable Apache AGE on existing PostgreSQL
CREATE EXTENSION IF NOT EXISTS age;
LOAD 'age';
SET search_path = ag_catalog, "$user", public;
```
```python
# mem0 config for Apache AGE
config = {
    "graph_store": {
        "provider": "apache_age",
        "config": {
            "host": "localhost",
            "port": 5432,
            "database": "knowledge_base",
            "username": "postgres",
            "password": "...",
            "graph_name": "mem0_graph"
        }
    }
}
```

### Anti-Patterns to Avoid
- **Single global Memory instance for all tenants:** Creates data leakage between tenants. Each tenant needs isolated config (at minimum, separate `collection_name`).
- **Hardcoding OpenAI as LLM provider:** mem0 defaults to OpenAI. The sidecar MUST be configured to use b-knowledge's tenant_llm providers.
- **Using mem0's default server unmodified:** The default server uses pgvector + Neo4j. b-knowledge needs OpenSearch + Apache AGE. A custom sidecar is required.
- **Replacing the entire memory API layer:** D-01 explicitly locks the wrapper approach. The Express API stays unchanged; only the backend implementation swaps.

## API Mapping Table (D-24)

### b-knowledge -> mem0 Endpoint Mapping

| b-knowledge Endpoint | Method | mem0 Equivalent | Gap/Difference |
|----------------------|--------|-----------------|----------------|
| `POST /api/memory` | Create pool | N/A (mem0 has no pool concept) | mem0 uses user_id/agent_id scope, not pool objects. Pool metadata stays in PostgreSQL. |
| `GET /api/memory` | List pools | N/A | Pool listing is PostgreSQL-only, not mem0's concern. |
| `GET /api/memory/:id` | Get pool | N/A | Same -- pool metadata from PostgreSQL. |
| `PUT /api/memory/:id` | Update pool | N/A | Pool config updates stay in PostgreSQL. |
| `DELETE /api/memory/:id` | Delete pool | `DELETE /memories` with filter | Delete all mem0 memories scoped to the pool's identifier. |
| `POST /api/memory/:id/messages` | Direct insert | `POST /memories` with `infer=False` | mem0 can store raw content without LLM extraction. |
| `GET /api/memory/:id/messages` | List messages | `GET /memories` with filters | mem0 supports pagination via v2 API. |
| `DELETE /api/memory/:id/messages/:mid` | Delete message | `DELETE /memories/{memory_id}` | Direct mapping. |
| `POST /api/memory/:id/search` | Hybrid search | `POST /search` | mem0 search is embedding-based. Text boost weighting differs from current 0.7/0.3 split. |
| `PUT /api/memory/:id/messages/:mid/forget` | Forget message | `DELETE /memories/{memory_id}` | mem0 has no "forgotten" state -- only active or deleted. Soft-delete must be implemented in wrapper. |
| `POST /api/memory/:id/import` | Import chat history | `POST /memories` (batch) | Process chat pairs through mem0's `add()` with conversation messages. |
| Extraction pipeline (internal) | Extract memories | `POST /memories` with `infer=True` | mem0's core differentiator: automatic dedup + conflict resolution. |
| N/A (not implemented) | Memory history | `GET /memories/{id}/history` | NEW capability: mem0 tracks ADD/UPDATE/DELETE events with old/new values. |
| N/A (not implemented) | Deduplication | Built into `add()` | NEW capability: mem0 automatically deduplicates via similarity threshold (0.85) + LLM decision. |
| N/A (not implemented) | Graph memory | Graph store integration | NEW capability: entity/relationship extraction into graph database. |

### Key Gaps Requiring Wrapper Logic

1. **Pool concept:** mem0 has no pool abstraction. The wrapper maps `memory_id` (pool UUID) to mem0's scope identifiers (e.g., `user_id = "tenant:pool:user"`).
2. **Bitmask memory types:** mem0 does not use RAW/SEMANTIC/EPISODIC/PROCEDURAL types. It extracts "facts" generically. The wrapper can use mem0's `metadata` field to tag with type information, or accept that mem0's unified extraction replaces the 4-type system.
3. **Forget vs Delete:** mem0 has no soft-delete/forgotten state. The wrapper must either: (a) implement soft-delete in a metadata field, or (b) accept that "forget" becomes "delete" in mem0 backend.
4. **FIFO forgetting policy:** mem0 does not enforce size-based FIFO eviction. The wrapper must implement this logic on top of mem0, or accept mem0's approach (no auto-eviction; manual cleanup).
5. **Hybrid search weights:** mem0's search is pure vector similarity (optionally reranked). The current 0.7 vector / 0.3 text split is not directly configurable in mem0.

## Frontend Settings Impact (D-14)

| MemorySettingsPanel Field | mem0 Mapping | Status |
|--------------------------|--------------|--------|
| `name` | N/A (pool metadata) | Stays in PostgreSQL |
| `description` | N/A (pool metadata) | Stays in PostgreSQL |
| `memory_type` (bitmask) | `custom_instructions` or metadata tags | CHANGED -- mem0 uses unified extraction, not 4 separate types |
| `storage_type` (table/graph) | `graph_store` config presence | MAPS -- graph enabled/disabled per pool config |
| `extraction_mode` (batch/realtime) | Controlled by when `add()` is called | UNCHANGED -- timing logic stays in Express layer |
| `embd_id` | `embedder.config` in mem0 | MAPS -- per-tenant embedding model routing |
| `llm_id` | `llm.config` in mem0 | MAPS -- per-tenant LLM routing |
| `temperature` | `llm.config.temperature` | MAPS directly |
| `system_prompt` | `custom_instructions` | PARTIAL -- mem0's custom_instructions are natural language guidelines, not full system prompts |
| `user_prompt` | `custom_fact_extraction_prompt` | PARTIAL -- mem0 allows custom extraction prompts but format differs |
| `memory_size` | N/A | GAP -- mem0 has no built-in pool size limits. Wrapper must enforce. |
| `forgetting_policy` | N/A | GAP -- mem0 has no FIFO policy. Wrapper must enforce. |
| `permission` (me/team) | N/A (pool metadata) | Stays in PostgreSQL |
| `scope_type` (user/agent/team) | `user_id` / `agent_id` | MAPS to mem0's scope identifiers |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Memory deduplication | Custom similarity + merge logic | mem0's built-in dedup (0.85 threshold + LLM decision) | LLM-based conflict resolution handles semantic equivalence far better than pure cosine similarity |
| Entity/relationship extraction | Custom NLP pipeline | mem0 graph memory + Apache AGE | Graph extraction requires sophisticated NER and relation detection; mem0 handles this with LLM |
| Memory versioning/history | Custom audit table | mem0's SQLite history DB | Already tracks ADD/UPDATE/DELETE events with old/new values |
| Memory conflict resolution | Manual merge rules | mem0's ADD/UPDATE/DELETE/NOOP LLM classifier | LLM decides whether new info should add, update, or delete existing memories |

**Key insight:** The current b-knowledge memory system treats every extraction as a new insert. mem0's intelligence is in its decision layer: it compares new facts against existing memories and decides the correct action. This eliminates duplicate memories and keeps information current -- two problems explicitly listed as "out of scope" in FR-MEMORY.

## Common Pitfalls

### Pitfall 1: Tenant Data Leakage via Shared Memory Instance
**What goes wrong:** If the mem0 sidecar uses a single `Memory.from_config()` with one OpenSearch collection, all tenants' memories are co-mingled. Queries without proper filtering return cross-tenant data.
**Why it happens:** mem0's default server is single-tenant. b-knowledge is multi-tenant.
**How to avoid:** Use per-tenant `collection_name` (e.g., `mem0_memory_{tenantId}`) in OpenSearch config. Additionally filter all queries by a `tenant_id` metadata field. Double-layer isolation.
**Warning signs:** Search results returning memories with mismatched tenant IDs.

### Pitfall 2: OpenAI API Key Required by Default
**What goes wrong:** mem0 defaults to `gpt-4.1-nano` from OpenAI for extraction. Without `OPENAI_API_KEY`, the server fails to start.
**Why it happens:** mem0's default config hardcodes OpenAI as the LLM provider.
**How to avoid:** Explicitly configure `llm.provider` and `embedder.provider` in the sidecar config to use Ollama, LiteLLM, or OpenAI-compatible endpoints that route through b-knowledge's tenant_llm system.
**Warning signs:** `AuthenticationError` on startup or first memory add.

### Pitfall 3: mem0 FIFO Gap
**What goes wrong:** Memory pools grow unbounded because mem0 has no built-in size limit or FIFO eviction.
**Why it happens:** mem0 is designed for unbounded memory accumulation with intelligent dedup. b-knowledge has explicit pool size limits (default 5MB).
**How to avoid:** Implement FIFO enforcement in the wrapper layer (TypeScript side) after each mem0 `add()` call. Count memories via mem0's `get_all()` and delete oldest when exceeding max.
**Warning signs:** Memory count growing linearly without plateau; high OpenSearch storage usage.

### Pitfall 4: Embedding Dimension Mismatch
**What goes wrong:** mem0 creates an OpenSearch index with a fixed `embedding_model_dims` (e.g., 1536 for OpenAI). If b-knowledge tenants use different embedding models with different dimensions (e.g., 1024), inserts fail.
**Why it happens:** OpenSearch knn_vector dimension is fixed per index mapping.
**How to avoid:** Set `embedding_model_dims` to match the tenant's configured embedding model dimension. If different tenants use different dimension models, separate collections are mandatory.
**Warning signs:** OpenSearch `mapper_parsing_exception` on insert.

### Pitfall 5: Custom Prompt Format Incompatibility
**What goes wrong:** b-knowledge's extraction prompts use `{{conversation}}` placeholder templates. mem0's `custom_instructions` are natural language guidelines, not template strings.
**Why it happens:** Different prompt paradigms -- b-knowledge uses template substitution, mem0 uses instruction injection.
**How to avoid:** Map b-knowledge's custom prompts to mem0's `custom_instructions` format. Accept that fine-grained per-type prompt control (4 separate templates) is replaced by unified extraction instructions.
**Warning signs:** Extracted memories not matching expected quality/format.

### Pitfall 6: SQLite History DB in Docker
**What goes wrong:** mem0's history tracking uses a local SQLite file (`~/.mem0/history.db`). In Docker, this is ephemeral unless volume-mounted.
**Why it happens:** SQLite is file-based; container restarts lose data.
**How to avoid:** Mount `history.db` path as a Docker volume. Or configure mem0 to use PostgreSQL for history (if supported in future versions).
**Warning signs:** Memory history empty after container restart.

## Graph Store Licensing Analysis (D-11)

| Graph Store | License | Commercial Closed-Source Use | Verdict |
|-------------|---------|------------------------------|---------|
| **Apache AGE** | Apache 2.0 | Fully permissive. No restrictions. | RECOMMENDED |
| **Neo4j CE** | GPLv3 + Commons Clause modification | Can use internally but cannot distribute as part of a product/service that primarily derives value from Neo4j. Risk for SaaS/enterprise distribution. | NOT RECOMMENDED |
| **FalkorDB** | SSPLv1 | Can use if not offering FalkorDB as a service. Acceptable for internal use, but risky for SaaS deployment where memory is a core feature. | ACCEPTABLE with caveats |
| **Memgraph** | BSL 1.1 -> Apache 2.0 (after 4 years) | Business Source License restricts competing products during BSL period. | RISKY |
| **Kuzu** | MIT | Fully permissive. Embedded-only (no server mode). | ALTERNATIVE for simple setups |

**Recommendation:** Apache AGE is the clear winner. It runs as an extension on b-knowledge's existing PostgreSQL 17 instance, requires no new infrastructure, and has zero licensing risk. The only downside is that AGE lacks built-in vector indexing (client-side similarity), but this is irrelevant because vector search is handled by OpenSearch.

## mem0 Deduplication & Conflict Resolution (D-18)

### How It Works
1. New content arrives via `add()` with `infer=True` (default)
2. mem0 extracts facts from the conversation using the configured LLM
3. Each extracted fact is embedded and compared against existing memories (similarity search, threshold ~0.85)
4. For each similar match, the LLM decides:
   - **ADD**: New information, no existing memory covers this
   - **UPDATE**: Existing memory should be replaced with updated info
   - **DELETE**: New information contradicts existing memory
   - **NOOP**: Information already captured, no action needed
5. Changes are applied atomically and logged to history DB

### Comparison with Current System
| Aspect | b-knowledge Current | mem0 |
|--------|-------------------|------|
| Deduplication | None -- every extraction creates new messages | Automatic via embedding similarity + LLM decision |
| Conflict resolution | None -- contradictory facts coexist | LLM decides UPDATE or DELETE for conflicts |
| Extraction approach | 4 separate prompts (RAW/SEM/EPI/PRO) | Single unified extraction + fact decomposition |
| History tracking | status field (active/forgotten) only | Full event log (ADD/UPDATE/DELETE with old/new values) |
| Forgetting | FIFO by age | Manual deletion only (no auto-eviction) |

## Memory Versioning (D-19)

mem0 provides built-in memory versioning via the `SQLiteManager` history database:
- Every ADD, UPDATE, DELETE operation is recorded
- History entries store: `memory_id`, `old_memory`, `new_memory`, `event` type, `actor_id`, timestamps
- Available in both open-source (local SQLite) and platform deployments
- Accessible via `GET /memories/{id}/history` REST endpoint

This is a significant upgrade over b-knowledge's current system, which only tracks `status` (1=active, 0=forgotten) with no version history.

## Data Migration Path (D-15)

### Current Format (OpenSearch `memory_{tenantId}`)
```json
{
  "message_id": "uuid",
  "memory_id": "pool-uuid",
  "content": "extracted text",
  "content_embed": [0.1, 0.2, ...],
  "message_type": 2,
  "status": 1,
  "tenant_id": "tenant-uuid",
  "source_id": "session-uuid",
  "user_id": "user-uuid",
  "created_at": "2026-01-01T00:00:00Z"
}
```

### mem0 Format (OpenSearch collection)
```json
{
  "id": "uuid",
  "vector": [0.1, 0.2, ...],
  "payload": {
    "data": "extracted text",
    "user_id": "tenant:pool:user",
    "hash": "content-hash",
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

### Migration Strategy
1. **No-migration approach (recommended for D-02):** Existing pools stay on native backend. New pools use mem0. No data migration needed initially.
2. **Optional migration for existing pools:** For each message in native format:
   a. Read content + embedding from OpenSearch
   b. Call mem0's `add()` with `infer=False` to store without re-extraction
   c. Preserve metadata (source_id, user_id, created_at) in mem0's metadata field
   d. After verification, decommission old index data
3. **Risk:** Re-embedding may be needed if embedding dimensions differ between old and new configuration.

## Performance Benchmark Plan (D-22)

### Methodology
1. **Test data:** Generate 100 synthetic multi-turn conversations (3-5 turns each) using realistic domains
2. **Add benchmark:** Time `extractFromConversation` (native) vs `POST /memories` (mem0) for each conversation
3. **Search benchmark:** Time `searchMemory` (native) vs `POST /search` (mem0) with 50 query variations
4. **Concurrent benchmark:** 10 simultaneous tenants adding/searching memories
5. **Tools:** Python `time.perf_counter()` or `locust` for load testing

### Expected Metrics
| Metric | Native Baseline | mem0 Expected | Notes |
|--------|----------------|---------------|-------|
| Add latency (per turn) | ~2-5s (1 LLM call per type, up to 4) | ~3-8s (1 extraction + N dedup comparisons) | mem0 slower due to dedup overhead |
| Search latency | <200ms (OpenSearch knn) | <300ms (OpenSearch knn + optional rerank) | Similar, mem0 may add reranking step |
| Throughput (adds/min) | ~12-30 (limited by LLM) | ~8-20 (limited by LLM + dedup) | LLM is the bottleneck in both |

## Code Examples

### mem0 OpenSearch Configuration
```python
# Source: https://docs.mem0.ai/components/vectordbs/dbs/opensearch
config = {
    "llm": {
        "provider": "openai",  # Or "ollama", "litellm" for self-hosted
        "config": {
            "model": "gpt-4.1-nano",
            "api_key": "...",
            "temperature": 0.3
        }
    },
    "embedder": {
        "provider": "openai",
        "config": {
            "model": "text-embedding-3-small",
            "embedding_dims": 1024
        }
    },
    "vector_store": {
        "provider": "opensearch",
        "config": {
            "collection_name": "mem0_memory_tenant123",
            "host": "localhost",
            "port": 9201,
            "embedding_model_dims": 1024,
            "use_ssl": False,
            "verify_certs": False
        }
    },
    "graph_store": {
        "provider": "apache_age",
        "config": {
            "host": "localhost",
            "port": 5432,
            "database": "knowledge_base",
            "username": "postgres",
            "password": "...",
            "graph_name": "mem0_graph_tenant123"
        }
    },
    "history_db_path": "/data/mem0/history_tenant123.db"
}
```

### Memory Add with Deduplication
```python
# Source: https://docs.mem0.ai/core-concepts/memory-operations/add
from mem0 import Memory

m = Memory.from_config(config)

# Inference mode (default) -- extracts facts, deduplicates, resolves conflicts
result = m.add(
    messages=[
        {"role": "user", "content": "I prefer dark mode and use TypeScript"},
        {"role": "assistant", "content": "Got it, I'll remember your preferences."}
    ],
    user_id="tenant123:pool456:user789",
    metadata={"memory_pool_id": "pool456", "tenant_id": "tenant123"}
)
# result contains: [{"id": "...", "memory": "User prefers dark mode", "event": "ADD"}, ...]

# Direct storage mode (no LLM extraction)
result = m.add(
    messages=[{"role": "user", "content": "Raw content to store"}],
    user_id="tenant123:pool456:user789",
    infer=False
)
```

### Memory Search
```python
# Source: https://docs.mem0.ai/core-concepts/memory-operations/search
results = m.search(
    query="What are the user's UI preferences?",
    user_id="tenant123:pool456:user789",
    limit=10
)
# results: [{"id": "...", "memory": "User prefers dark mode", "score": 0.92}, ...]
```

### Custom Instructions (Prompt Mapping)
```python
# Source: https://docs.mem0.ai/platform/features/custom-instructions
# Equivalent to b-knowledge's system_prompt/user_prompt for extraction
config = {
    "custom_instructions": (
        "Focus on extracting: "
        "1. User preferences and settings "
        "2. Technical decisions and architectural choices "
        "3. Project-specific terminology and definitions "
        "Do NOT extract: greetings, pleasantries, meta-discussion"
    )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Store every extraction as new record | Intelligent dedup (mem0's ADD/UPDATE/DELETE/NOOP) | mem0 v0.1.0 (2024) | Eliminates duplicate memories, keeps info current |
| Flat vector-only memory | Graph memory (entity-relationship) + vector | mem0 v0.1.5+ (2024) | Enables relational queries ("who works with whom?") |
| 4 separate memory type extractions | Unified fact extraction | mem0 approach | Single LLM call extracts all facts regardless of "type" |
| No memory versioning | Full event history with old/new values | mem0 built-in | Auditing, rollback capability |

## Open Questions

1. **Per-request LLM/Embedding routing**
   - What we know: mem0 accepts static config at initialization via `Memory.from_config()`. The server's `/configure` endpoint reinitializes the global instance.
   - What's unclear: Whether per-request LLM/embedding provider switching (for different tenants with different configured models) is feasible without creating multiple Memory instances.
   - Recommendation: Build a custom sidecar that maintains a cache of Memory instances keyed by (tenant_id, llm_id, embd_id). Lazy-initialize on first request per tenant.

2. **Apache AGE compatibility with PostgreSQL 17**
   - What we know: Apache AGE supports PostgreSQL 14-16 officially. PostgreSQL 17 support may require building from source.
   - What's unclear: Whether the latest AGE release supports PG17.
   - Recommendation: Test AGE installation on PG17 during the investigation phase. If incompatible, fall back to Kuzu (embedded, MIT license) or defer graph memory.

3. **mem0 OpenSearch index naming conventions**
   - What we know: mem0 uses `collection_name` config for the OpenSearch index name.
   - What's unclear: Whether mem0 creates its own index mapping or expects a pre-existing index. If it creates its own, the mapping may conflict with b-knowledge's existing `memory_{tenantId}` index mapping.
   - Recommendation: Use a separate index prefix (e.g., `mem0_memory_{tenantId}`) to avoid conflicts with existing native memory indices.

4. **History DB scaling**
   - What we know: mem0 uses SQLite for history tracking. SQLite is single-writer.
   - What's unclear: Whether SQLite history DB will become a bottleneck under high concurrency (multiple tenants writing simultaneously).
   - Recommendation: Acceptable for investigation phase. If bottleneck emerges, migrate history to PostgreSQL table.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.11+ | mem0 sidecar | Needs verification | -- | Shared venv with advance-rag |
| PostgreSQL 17 | Pool metadata + Apache AGE | Yes | 17-alpine | -- |
| OpenSearch 3.5 | Vector store | Yes | 3.5.0 | -- |
| Valkey/Redis | Inter-service comms | Yes | 8-alpine | -- |
| Docker | mem0 sidecar deployment | Needs verification | -- | Direct Python process |
| Apache AGE extension | Graph memory | Not installed | -- | Skip graph initially, add later |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (BE) + Vitest (FE) + pytest (Python) |
| Config file | `be/vitest.config.ts`, `fe/vitest.config.ts` |
| Quick run command | `npm run test -w be` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map

This phase produces an ADR document and investigation results, not code changes. Validation is primarily manual review of the ADR and benchmark results.

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-06 | Extraction quality comparison | Manual benchmark | N/A -- manual evaluation | N/A |
| D-22 | Performance benchmarks | Manual benchmark script | `python benchmarks/mem0_benchmark.py` | Wave 0 |
| D-24 | API mapping accuracy | Manual review | N/A | N/A |

### Sampling Rate
- **Per task commit:** Manual review of ADR content
- **Per wave merge:** Benchmark script runs green
- **Phase gate:** ADR document complete with go/no-go recommendation

### Wave 0 Gaps
- [ ] `benchmarks/mem0_benchmark.py` -- benchmark script for D-22
- [ ] mem0 test installation in shared venv -- verify `pip install mem0ai` succeeds
- [ ] Apache AGE compatibility test on PG17

## Sources

### Primary (HIGH confidence)
- [mem0 GitHub repo](https://github.com/mem0ai/mem0) -- README, source code, server directory
- [mem0 OpenSearch docs](https://docs.mem0.ai/components/vectordbs/dbs/opensearch) -- OpenSearch vector store config
- [mem0 REST API docs](https://docs.mem0.ai/open-source/features/rest-api) -- Self-hosted server endpoints
- [mem0 Graph Memory docs](https://docs.mem0.ai/open-source/features/graph-memory) -- Graph store options and config
- [mem0 Embedding Config docs](https://docs.mem0.ai/components/embedders/config) -- Embedding provider options
- [DeepWiki mem0 Vector Store Providers](https://deepwiki.com/mem0ai/mem0/5.2-vector-store-providers) -- Full list of 24+ vector stores
- [DeepWiki mem0 Memory Config](https://deepwiki.com/mem0ai/mem0/3.1-memory-configuration) -- Configuration dictionary structure
- [DeepWiki mem0 History](https://deepwiki.com/mem0ai/mem0/3.3-history-and-storage-management) -- History DB architecture
- [Apache AGE GitHub](https://github.com/apache/age) -- Apache 2.0 license confirmed

### Secondary (MEDIUM confidence)
- [DeepWiki mem0 REST API Reference](https://deepwiki.com/mem0ai/mem0/7.2-rest-api-reference) -- Platform + OSS API endpoints
- [mem0 Docker self-host guide](https://mem0.ai/blog/self-host-mem0-docker) -- Deployment architecture
- [Neo4j licensing FAQ](https://neo4j.com/open-core-and-neo4j/) -- GPL + Commons Clause analysis
- [FalkorDB license docs](https://docs.falkordb.com/license.html) -- SSPLv1 terms

### Tertiary (LOW confidence)
- [mem0 multi-agent isolation issue](https://github.com/mem0ai/mem0/issues/3998) -- Community discussion on per-agent isolation
- mem0 performance expectations -- based on architecture analysis, not empirical benchmarks

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- mem0 v1.0.5 verified on PyPI, OpenSearch support confirmed in source code
- Architecture: HIGH -- REST API server confirmed, config system well-documented
- Deal-breakers: HIGH -- all 4 verified with official documentation and source code
- API mapping: HIGH -- based on reading both b-knowledge source and mem0 API docs
- Graph licensing: HIGH -- license texts verified from official repos
- Performance: LOW -- estimates based on architecture, not empirical testing
- Pitfalls: MEDIUM -- based on architecture analysis and community issues

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (mem0 is actively developed; check for breaking changes)
