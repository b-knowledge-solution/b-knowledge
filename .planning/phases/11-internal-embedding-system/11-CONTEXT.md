# Phase 11: Internal Embedding System - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Provide a self-hosted embedding service using Hugging Face Sentence Transformers, enabling document and chat embedding as an internal resource without external API dependency. Includes environment-driven configuration, auto-seeded model provider record, query-time embedding via Valkey Stream consumer groups, and a re-embed trigger UI for model migration.

</domain>

<decisions>
## Implementation Decisions

### Deployment Architecture
- **D-01:** In-process model loading — load Sentence Transformer model directly in the Python task_executor process. Singleton pattern with threading lock (follows existing `BuiltinEmbed` pattern).
- **D-02:** Permanent memory — model stays loaded for process lifetime, no idle unload. Avoids 5-30s reload penalty.
- **D-03:** CPU-only — install `torch` CPU-only build and `sentence-transformers`. ~250MB Docker image delta. No GPU/CUDA dependency.

### Environment Configuration
- **D-04:** Three env variables control the feature:
  - `LOCAL_EMBEDDING_ENABLE` (boolean) — master switch to enable/disable local embedding
  - `LOCAL_EMBEDDING_MODEL` (string, required when enabled) — HuggingFace model ID (e.g., `BAAI/bge-m3`). No default — system fails startup if enabled but model not specified.
  - `LOCAL_EMBEDDING_PATH` (string, optional) — local filesystem path to pre-downloaded model weights. When set, loads from this path (offline/air-gapped mode). When unset, downloads from HuggingFace Hub on first use.
- **D-05:** These env vars go in `advance-rag/.env` and `docker/.env` (for Docker Compose).

### Model Download & Caching
- **D-06:** Dual-mode model loading:
  - If `LOCAL_EMBEDDING_PATH` is set → load model from that local path (offline mode). No network call.
  - If `LOCAL_EMBEDDING_PATH` is NOT set → download from HuggingFace Hub on server/docker startup. Cache in persistent Docker volume at HuggingFace default cache dir (`~/.cache/huggingface`). Subsequent restarts load from cache.

### Auto-Seed Model Provider Record
- **D-07:** On backend startup, if `LOCAL_EMBEDDING_ENABLE=true`:
  - Upsert a `model_providers` record with `factory_name='SentenceTransformers'`, `model_name=LOCAL_EMBEDDING_MODEL`, `model_type='embedding'`, and a system/managed flag (e.g., `is_system=true` or a reserved `api_key` sentinel).
  - If `LOCAL_EMBEDDING_ENABLE=false` (or unset), remove any existing system-managed SentenceTransformers record.
  - Idempotent — safe on every restart.

### LLM Config Page UI
- **D-08:** System-managed model_providers record appears on LLM Config page with a `[System]` badge. Edit and delete buttons are disabled with tooltip "Managed by LOCAL_EMBEDDING_MODEL environment variable". Admin can still set it as default embedding model for their tenant.

### Query-Time Embedding (CCU Handling)
- **D-09:** Real-time query embedding uses **Valkey Stream + consumer group** pattern:
  - Node.js backend publishes embedding request via `XADD embed:requests {text, requestId}`
  - Python embedding worker(s) consume via `XREADGROUP` (consumer group)
  - Worker encodes with Sentence Transformers model, responds via `LPUSH embed:response:{requestId}`
  - Node.js awaits response via `BRPOP embed:response:{requestId}` with timeout
  - Uses existing Valkey 8 instance (port 6379), no new infrastructure
- **D-10:** Scales horizontally — add Python embedding worker replicas to handle higher CCU. Each worker loads the model independently (~600MB RAM per worker). Consumer group distributes requests automatically.

### Concurrency & Batching
- **D-11:** Document embedding (bulk) reuses existing `EMBEDDING_BATCH_SIZE` (default 16) and `embed_limiter` semaphore from task_executor. No new concurrency primitives.
- **D-12:** Query-time embedding workers process requests individually from the stream (no micro-batching in Phase 11).

### Existing Data Migration
- **D-13:** When a dataset's embedding model changes (e.g., from OpenAI 1536d to local bge-m3 1024d), existing chunks keep their old vectors. Admin must manually trigger re-embedding.
- **D-14:** Re-embed trigger: warning banner on dataset settings page when current model dimension differs from chunk dimensions. "Re-embed All" button queues a background task via existing Redis task pipeline. Progress visible in task status bar.

### Claude's Discretion
- Python embedding worker implementation details (event loop, graceful shutdown)
- `SentenceTransformersEmbed` class internal structure beyond the singleton + lock pattern
- How to detect model dimension mismatch for the re-embed warning (OpenSearch query vs stored metadata)
- Token counting approach for local models (num_tokens_from_string fallback or tokenizer-based)
- Valkey stream key naming and cleanup strategy (TTL on response keys, stream trimming)
- How to mark model_providers record as system-managed (new boolean column vs sentinel value)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Embedding Pipeline (Python)
- `advance-rag/rag/llm/embedding_model.py` — All embedding provider classes, `Base` interface, `BuiltinEmbed` singleton pattern, `_FACTORY_NAME` auto-discovery
- `advance-rag/rag/llm/__init__.py` — Auto-discovery mechanism that builds `EmbeddingModel` dict from `_FACTORY_NAME`
- `advance-rag/rag/svr/task_executor.py` — `embedding()` function (line ~874), batch processing, `embed_limiter` semaphore, model resolution chain
- `advance-rag/db/services/llm_service.py` — `LLMBundle` wrapper, token usage tracking, builtin factory path

### Model Provider System
- `advance-rag/db/joint_services/tenant_model_service.py` — `get_tenant_default_model_by_type()`, model config resolution chain, TEI/Builtin special paths
- `advance-rag/db/db_models.py` — `TenantLLM` Peewee model (line ~806), `Knowledgebase.embd_id`/`tenant_embd_id` fields
- `advance-rag/config.py` — `DEFAULT_EMBEDDING_MODEL`, `TEI_MODEL`, `COMPOSE_PROFILES` checks, `MAX_TOKENS` dict
- `be/src/modules/llm-provider/services/llm-provider.service.ts` — Backend CRUD for model_providers, `testConnection()`, `listPublic()`
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` (line ~968) — `model_providers` table schema
- `be/src/shared/db/seeds/02_model_providers.ts` — Default seed data
- `be/src/shared/constants/model-types.ts` — `ModelType` enum

### OpenSearch Vector Storage
- `advance-rag/rag/utils/opensearch_conn.py` — `OSConnection`, index creation, `os_mapping.json` reference
- Dynamic `q_{dim}_vec` field naming convention — dimensions auto-mapped via OpenSearch dynamic templates

### Search / Query Embedding
- `be/src/modules/rag/services/rag-search.service.ts` — `semanticSearch()`, `hybridSearch()`, KNN query construction using `q_${queryVector.length}_vec`

### Infrastructure
- `docker/docker-compose-base.yml` — Valkey 8 on port 6379
- `docker/docker-compose.yml` — task-executor service, `EMBEDDING_BATCH_SIZE` env

### Frontend Model Config
- `fe/src/features/datasets/components/CreateDatasetModal.tsx` — Embedding model dropdown
- `fe/src/features/llm-provider/` — LLM Config page components

### Architecture & Conventions
- `be/CLAUDE.md` — Backend module layout, startup hooks
- `advance-rag/CLAUDE.md` — Python worker conventions
- `CLAUDE.md` — Root project conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`BuiltinEmbed` class**: Exact pattern to follow — singleton with `_model` class var, `threading.Lock`, lazy initialization
- **`EmbeddingModel` auto-discovery**: New class with `_FACTORY_NAME = "SentenceTransformers"` auto-registers via `__init__.py` importlib scan
- **`LLMBundle` wrapper**: Handles token counting and usage tracking — works with any model that implements `Base.encode()`
- **`embed_limiter` semaphore**: Existing concurrency control in task_executor for document embedding
- **Valkey pub/sub infrastructure**: Already used for progress reporting (worker → backend). Stream/consumer group is the same client library.
- **`model_providers` table**: Accepts any `factory_name` string — no schema migration needed for the provider record itself

### Established Patterns
- **Provider factory pattern**: `EmbeddingModel["FactoryName"](api_key, model_name, base_url=api_base)` — all providers follow this
- **Task pipeline**: Redis-based job queue for document processing — re-embed can reuse same pipeline
- **Dynamic OpenSearch dimensions**: `q_{dim}_vec` naming with dynamic templates handles any new embedding dimension automatically

### Integration Points
- **New `SentenceTransformersEmbed` class** → registers in `EmbeddingModel` dict
- **Backend startup hook** → upserts `model_providers` record when `LOCAL_EMBEDDING_ENABLE=true`
- **New Valkey Stream** (`embed:requests` / `embed:response:{id}`) → connects Node.js search to Python embedding workers
- **New Python embedding worker process** → consumer group reader for query-time embedding
- **Dataset settings UI** → re-embed warning banner and trigger button
- **LLM Config page** → `[System]` badge and disabled controls for managed providers

</code_context>

<specifics>
## Specific Ideas

- Environment variable naming: `LOCAL_EMBEDDING_ENABLE`, `LOCAL_EMBEDDING_MODEL`, `LOCAL_EMBEDDING_PATH`
- `LOCAL_EMBEDDING_MODEL` has no default — required when enabled, fail startup if missing
- `LOCAL_EMBEDDING_PATH` enables offline/air-gapped mode — load from local path instead of downloading
- System-managed provider record: visible on LLM Config page but non-editable (badge + disabled controls)
- Backend startup creates/removes the provider record based on env flag (idempotent)
- Query-time embedding via Valkey Stream consumer groups — scale by adding worker replicas
- Re-embed trigger: warning banner on dataset settings when model mismatch detected, "Re-embed All" button

</specifics>

<deferred>
## Deferred Ideas

- GPU support (auto-detect CUDA, nvidia-container-toolkit) — add when CPU throughput is insufficient
- Micro-batching in query-time embedding workers — collect pending requests for 50ms, batch encode
- Model download management UI (progress bar, model marketplace)
- Multiple concurrent models loaded in memory (currently single model per worker)
- Sentence Transformers for reranking (model_type='rerank')

### Reviewed Todos (not folded)
- **Merge latest RAGFlow upstream to b-knowledge** — Not relevant to embedding system, already completed in v1.0 Phase 1.

</deferred>

---

*Phase: 11-internal-embedding-system*
*Context gathered: 2026-04-03*
