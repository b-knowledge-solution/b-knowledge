# Phase 11: Internal Embedding System - Research

**Researched:** 2026-04-03
**Domain:** Self-hosted embedding (Python Sentence Transformers) + Valkey Stream bridge to Node.js + model provider auto-seeding + re-embed UI
**Confidence:** HIGH

## Summary

This phase adds a self-hosted embedding capability using Hugging Face Sentence Transformers, loaded in-process within the Python task_executor. The existing codebase already has all foundational patterns: the `BuiltinEmbed` singleton with threading lock in `embedding_model.py`, the auto-discovery mechanism via `_FACTORY_NAME` in `__init__.py`, the `embed_limiter` semaphore for batch concurrency, and the `model_providers` table that accepts any `factory_name` string (no schema migration needed for the provider record).

The primary new infrastructure is the Valkey Stream bridge for query-time embedding: Node.js publishes embedding requests via `XADD`, Python workers consume via `XREADGROUP`, and responses return through `LPUSH`/`BRPOP`. Both the Node.js `redis@5.10.0` client and the Python `redis>=5.0.0` client fully support Streams and consumer groups. The backend currently embeds queries via `llmClientService.embedTexts()` which calls OpenAI-compatible API endpoints -- the Valkey Stream path is needed because the local SentenceTransformers model has no HTTP API.

**Primary recommendation:** Follow the existing `BuiltinEmbed` pattern exactly -- create a `SentenceTransformersEmbed` class with `_FACTORY_NAME = "SentenceTransformers"`, singleton model loading, and threading lock. For query-time embedding, introduce a lightweight Python worker process (separate from task_executor) that runs a `XREADGROUP` loop. On the Node.js side, add an `embedViaStream()` method to the search service that routes to the Valkey Stream when the configured embedding provider has `factory_name = 'SentenceTransformers'`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** In-process model loading -- load Sentence Transformer model directly in the Python task_executor process. Singleton pattern with threading lock (follows existing `BuiltinEmbed` pattern).
- **D-02:** Permanent memory -- model stays loaded for process lifetime, no idle unload. Avoids 5-30s reload penalty.
- **D-03:** CPU-only -- install `torch` CPU-only build and `sentence-transformers`. ~250MB Docker image delta. No GPU/CUDA dependency.
- **D-04:** Three env variables: `LOCAL_EMBEDDING_ENABLE` (boolean), `LOCAL_EMBEDDING_MODEL` (string, required when enabled), `LOCAL_EMBEDDING_PATH` (string, optional for offline mode).
- **D-05:** Env vars in `advance-rag/.env` and `docker/.env`.
- **D-06:** Dual-mode model loading: local path or HuggingFace Hub download with cache in Docker volume.
- **D-07:** Auto-seed `model_providers` record on backend startup when enabled; remove when disabled. Idempotent.
- **D-08:** System-managed provider shows `[System]` badge, edit/delete disabled with tooltip.
- **D-09:** Query-time embedding via Valkey Stream + consumer group (`embed:requests` / `embed:response:{requestId}`).
- **D-10:** Horizontal scaling by adding Python embedding worker replicas (~600MB RAM each).
- **D-11:** Document embedding reuses existing `EMBEDDING_BATCH_SIZE` and `embed_limiter`.
- **D-12:** Query-time workers process requests individually (no micro-batching).
- **D-13:** Existing chunks keep old vectors on model change; admin must manually trigger re-embed.
- **D-14:** Re-embed trigger: warning banner + "Re-embed All" button on dataset settings.

### Claude's Discretion
- Python embedding worker implementation details (event loop, graceful shutdown)
- `SentenceTransformersEmbed` class internal structure beyond the singleton + lock pattern
- How to detect model dimension mismatch for the re-embed warning (OpenSearch query vs stored metadata)
- Token counting approach for local models (num_tokens_from_string fallback or tokenizer-based)
- Valkey stream key naming and cleanup strategy (TTL on response keys, stream trimming)
- How to mark model_providers record as system-managed (new boolean column vs sentinel value)

### Deferred Ideas (OUT OF SCOPE)
- GPU support (auto-detect CUDA, nvidia-container-toolkit)
- Micro-batching in query-time embedding workers
- Model download management UI (progress bar, model marketplace)
- Multiple concurrent models loaded in memory
- Sentence Transformers for reranking (model_type='rerank')
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sentence-transformers | 3.4.x | Load and run Sentence Transformer models | De facto standard for local embedding in Python, wraps HuggingFace transformers |
| torch (CPU-only) | 2.x | ML framework backend for sentence-transformers | Required dependency; CPU-only variant avoids ~2GB CUDA overhead |
| redis (Python) | >=5.0.0 | Valkey Stream consumer group for query-time embedding | Already in pyproject.toml, supports XREADGROUP natively |
| redis (Node.js) | 5.10.0 | XADD/BRPOP for Valkey Stream bridge | Already installed in BE, full Streams API support |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| numpy | >=1.24.0 | Embedding vector operations, batch concatenation | Already in pyproject.toml, used by all embedding classes |
| huggingface-hub | (transitive) | Model download and caching | Automatic via sentence-transformers, provides cache management |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sentence-transformers | FlagEmbedding (BGEM3FlagModel) | FlagEmbedding supports multi-retrieval (dense+sparse+colbert) but is not needed here -- sentence-transformers is simpler and already well-known |
| Valkey Stream bridge | HTTP sidecar (FastAPI serving embeddings) | HTTP would be simpler but requires extra port allocation and health checks; Valkey Stream uses existing infrastructure |
| In-process loading | Separate embedding microservice | Adds deployment complexity; in-process matches existing BuiltinEmbed pattern |

**Installation (Docker):**
```bash
# In Dockerfile, use PyTorch CPU-only index to avoid pulling CUDA wheels
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install sentence-transformers
```

**Installation (dev):**
```bash
# Already have torch+sentence-transformers in dev .venv
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install sentence-transformers
```

**Version verification:** sentence-transformers 3.4.1 and torch 2.11.0 are installed in the development environment. For Docker, pin to compatible versions. The CPU-only torch wheel is ~250MB vs ~2.5GB for CUDA.

## Architecture Patterns

### Recommended Changes by Area

```
advance-rag/
├── config.py                         # Add LOCAL_EMBEDDING_* env vars
├── rag/llm/embedding_model.py        # Add SentenceTransformersEmbed class
├── embedding_worker.py               # NEW: Valkey Stream consumer for query-time embedding
├── pyproject.toml                    # Add torch (CPU), sentence-transformers deps

be/src/
├── app/index.ts                      # Add startup hook: auto-seed model_providers
├── shared/services/
│   ├── embedding-stream.service.ts   # NEW: Valkey Stream XADD/BRPOP for local embedding
│   └── redis.service.ts              # May need dedicated client for BRPOP (blocking)
├── modules/search/services/
│   └── search.service.ts             # Route embedQuery to stream when provider is SentenceTransformers
├── modules/llm-provider/
│   └── services/llm-provider.service.ts  # is_system flag handling
└── shared/db/migrations/
    └── YYYYMMDD_add_is_system_to_model_providers.ts  # Add is_system boolean column

fe/src/
├── features/llm-provider/            # System badge, disabled edit/delete
├── features/datasets/                # Re-embed warning banner + button
└── locales/{en,vi,ja}/               # i18n keys for new copy

docker/
├── docker-compose.yml                # Add embedding-worker service, HF cache volume
└── .env                              # Add LOCAL_EMBEDDING_* env vars
```

### Pattern 1: SentenceTransformersEmbed Class (follows BuiltinEmbed)

**What:** Singleton embedding class with lazy model loading, threading lock, and `_FACTORY_NAME` auto-registration.

**When to use:** For all document embedding when the configured embedding provider is SentenceTransformers.

**Example:**
```python
# Source: Existing BuiltinEmbed pattern in advance-rag/rag/llm/embedding_model.py
class SentenceTransformersEmbed(Base):
    _FACTORY_NAME = "SentenceTransformers"
    _model = None
    _model_name = ""
    _model_lock = threading.Lock()

    def __init__(self, key, model_name, **kwargs):
        if not SentenceTransformersEmbed._model:
            with SentenceTransformersEmbed._model_lock:
                if not SentenceTransformersEmbed._model:
                    from sentence_transformers import SentenceTransformer
                    model_path = os.getenv("LOCAL_EMBEDDING_PATH") or model_name
                    SentenceTransformersEmbed._model = SentenceTransformer(
                        model_path, device="cpu"
                    )
                    SentenceTransformersEmbed._model_name = model_name

    def encode(self, texts: list):
        embeddings = SentenceTransformersEmbed._model.encode(
            texts, normalize_embeddings=True, show_progress_bar=False
        )
        token_count = sum(num_tokens_from_string(t) for t in texts)
        return np.array(embeddings), token_count

    def encode_queries(self, text: str):
        embedding = SentenceTransformersEmbed._model.encode(
            [text], normalize_embeddings=True, show_progress_bar=False
        )
        token_count = num_tokens_from_string(text)
        return np.array(embedding[0]), token_count
```

### Pattern 2: Valkey Stream Bridge (Node.js <-> Python)

**What:** Request-response pattern over Valkey Streams for query-time embedding when the embedding model runs in Python.

**When to use:** When the Node.js search service needs to embed a query and the configured embedding provider is SentenceTransformers (no OpenAI-compatible HTTP API available).

**Flow:**
1. Node.js: `XADD embed:requests * requestId {uuid} text {query}`
2. Python worker: `XREADGROUP GROUP embed-workers worker-{id} COUNT 1 BLOCK 5000 STREAMS embed:requests >`
3. Python worker: encode text, `LPUSH embed:response:{requestId} {json_vector}`
4. Node.js: `BRPOP embed:response:{requestId} {timeout_seconds}` -> parse vector
5. Node.js: set TTL on response key (cleanup) + periodically XTRIM stream

**Key design decisions:**
- Use a **dedicated Redis client** for BRPOP (blocking operations block the connection)
- Response keys use TTL (e.g., 60s) for automatic cleanup even if requester times out
- Stream trimming: `XTRIM embed:requests MAXLEN ~ 10000` on a periodic interval

### Pattern 3: Backend Startup Auto-Seed

**What:** Idempotent upsert of the SentenceTransformers model_providers record on backend startup.

**When to use:** Every backend startup when `LOCAL_EMBEDDING_ENABLE=true`.

**Implementation location:** After Knex migrations run in `be/src/app/index.ts` startup sequence (step 7+).

```typescript
// Pseudocode for startup hook
if (config.localEmbedding.enabled) {
    await ModelFactory.modelProvider.upsertSystemProvider({
        factory_name: 'SentenceTransformers',
        model_type: 'embedding',
        model_name: config.localEmbedding.model,
        api_key: 'system-managed',  // Sentinel value, or use is_system column
        is_system: true,
        status: 'active',
    })
} else {
    await ModelFactory.modelProvider.removeSystemProviders()
}
```

### Anti-Patterns to Avoid
- **Importing torch at module level:** Importing `sentence_transformers` or `torch` at the top of `embedding_model.py` would slow down all workers even when local embedding is not enabled. Use lazy import inside `__init__`.
- **Sharing BRPOP Redis connection:** BRPOP blocks the connection. Never use the same Redis client for BRPOP and regular commands.
- **Loading model in both task_executor AND embedding_worker:** If both need the model, they should share via Valkey Stream bridge, not load independently. But per D-01, document embedding uses in-process loading in task_executor, while query-time uses the embedding_worker. Each process loads its own copy (~600MB RAM each).
- **Hardcoding model dimensions:** Use `model.get_sentence_embedding_dimension()` to dynamically determine output dimension. Do not hardcode 1024 for bge-m3.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Model loading + caching | Custom HuggingFace download code | `SentenceTransformer(model_name)` with `HF_HOME` env | Handles download, cache, tokenizer config automatically |
| Token counting for local models | Custom tokenizer integration | `num_tokens_from_string()` (existing tiktoken fallback) | Already used by all embedding classes; good enough approximation |
| Embedding normalization | Manual L2 normalization | `normalize_embeddings=True` parameter | Built into sentence-transformers, handles edge cases |
| Consumer group management | Manual offset tracking | Redis `XREADGROUP` with `>` for new messages | Redis handles offset, acknowledgment, and redelivery |
| Model dimension detection | Parsing model config files | `model.get_sentence_embedding_dimension()` | Reliable API from sentence-transformers |

**Key insight:** The sentence-transformers library handles model loading, tokenization, batching, and normalization internally. The `SentenceTransformersEmbed` class is essentially a thin adapter that maps the library's API to the existing `Base.encode()` / `Base.encode_queries()` interface.

## Common Pitfalls

### Pitfall 1: First-Load Latency in Docker
**What goes wrong:** First container startup downloads the model from HuggingFace Hub (~1.5GB for bge-m3), causing a 2-10 minute delay before the worker is ready.
**Why it happens:** Model not cached yet in Docker volume.
**How to avoid:** Document that first startup is slow. Use `LOCAL_EMBEDDING_PATH` for pre-downloaded models in production. Ensure the HuggingFace cache volume is persistent across container restarts.
**Warning signs:** Worker health check fails during download period.

### Pitfall 2: Blocking BRPOP on Shared Redis Client
**What goes wrong:** Using the same Redis client for BRPOP (blocking) and regular commands causes all Redis operations to hang until BRPOP returns.
**Why it happens:** Redis client protocol is single-connection; blocking commands block the entire connection.
**How to avoid:** Create a dedicated Redis client instance for the embedding stream BRPOP operations. The existing `redis.service.ts` client must not be used for blocking calls.
**Warning signs:** Search requests hang, session/cache operations timeout during query embedding.

### Pitfall 3: Memory Leak from Response Keys
**What goes wrong:** `embed:response:{requestId}` keys accumulate if the requester times out or crashes before calling BRPOP.
**Why it happens:** LPUSH creates the key but nobody reads it; key persists forever without TTL.
**How to avoid:** Set TTL on response keys immediately after LPUSH (Python side) or use BRPOP timeout + periodic cleanup (Node.js side). Recommend: Python worker sets `EXPIRE embed:response:{requestId} 60` after LPUSH.
**Warning signs:** `DBSIZE` in Redis grows steadily, `INFO memory` shows increasing used_memory.

### Pitfall 4: Dimension Mismatch Detection
**What goes wrong:** The re-embed warning banner needs to compare the current model's dimension with the dimensions stored in OpenSearch chunks, but there's no single "stored dimension" field.
**Why it happens:** OpenSearch stores vectors in `q_{dim}_vec` field names. The dimension is encoded in the field name, not as a separate metadata field.
**How to avoid:** Two approaches: (a) query OpenSearch for one chunk from the dataset and extract the vector field name to determine stored dimension, or (b) store the embedding dimension in the `knowledgebase` table when chunks are first embedded (preferred -- avoids OpenSearch round-trip on every settings page load).
**Warning signs:** Settings drawer becomes slow if hitting OpenSearch every time.

### Pitfall 5: PyTorch CPU-Only Installation in Docker
**What goes wrong:** Default `pip install torch` pulls CUDA wheels on Linux (~2.5GB), bloating the Docker image.
**Why it happens:** PyPI hosts CUDA wheels for Linux by default. CPU-only wheels are on a separate index.
**How to avoid:** Always use `--index-url https://download.pytorch.org/whl/cpu` or `--extra-index-url` for torch in Dockerfile. Pin the torch version to avoid surprises.
**Warning signs:** Docker image jumps from ~2GB to ~5GB+.

### Pitfall 6: Model Provider `is_system` Flag -- Migration Required
**What goes wrong:** The `model_providers` table currently has no `is_system` column. Attempting to query/filter on it fails.
**Why it happens:** Original schema didn't anticipate system-managed providers.
**How to avoid:** Create a Knex migration to add `is_system` boolean column with default `false`. Alternative: use a sentinel `api_key` value (e.g., `__system__`) but this is fragile and non-obvious. A proper column is cleaner.
**Warning signs:** Backend crashes on startup when trying to upsert with `is_system: true`.

## Code Examples

### Verified: SentenceTransformer Encoding
```python
# Source: sentence-transformers docs + BAAI/bge-m3 model card
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("BAAI/bge-m3", device="cpu")
embeddings = model.encode(
    ["Hello world", "How are you?"],
    normalize_embeddings=True,
    show_progress_bar=False,
    batch_size=16,
)
# embeddings.shape = (2, 1024) for bge-m3
dim = model.get_sentence_embedding_dimension()  # 1024
```

### Verified: Valkey Stream Producer (Node.js redis@5)
```typescript
// Source: node-redis docs for Streams API
import { createClient } from 'redis'

const client = createClient({ url: 'redis://localhost:6379' })
await client.connect()

// Publish embedding request
const requestId = crypto.randomUUID()
await client.xAdd('embed:requests', '*', {
    requestId,
    text: 'user search query',
})

// Wait for response (blocking)
const brpopClient = client.duplicate()
await brpopClient.connect()
const result = await brpopClient.brPop('embed:response:' + requestId, 30)
if (result) {
    const vector = JSON.parse(result.element)
}
```

### Verified: Valkey Stream Consumer Group (Python redis)
```python
# Source: redis-py docs for Streams
import redis
import json

r = redis.Redis(host='localhost', port=6379, decode_responses=True)

# Create consumer group (idempotent)
try:
    r.xgroup_create('embed:requests', 'embed-workers', id='0', mkstream=True)
except redis.exceptions.ResponseError as e:
    if 'BUSYGROUP' not in str(e):
        raise

# Consumer loop
while True:
    messages = r.xreadgroup(
        'embed-workers', 'worker-1',
        {'embed:requests': '>'},
        count=1, block=5000
    )
    if not messages:
        continue
    for stream, entries in messages:
        for msg_id, data in entries:
            request_id = data['requestId']
            text = data['text']
            # Encode with loaded model
            embedding = model.encode([text], normalize_embeddings=True)
            vector = embedding[0].tolist()
            # Respond
            r.lpush(f'embed:response:{request_id}', json.dumps(vector))
            r.expire(f'embed:response:{request_id}', 60)
            # Acknowledge
            r.xack('embed:requests', 'embed-workers', msg_id)
```

### Verified: Backend Startup Hook Location
```typescript
// Source: be/src/app/index.ts lines ~100-115 (after migrations)
// Insert auto-seed logic after:
//   7. Knex migrations auto-run
//   8. Root user bootstrap
// Add as step 8.5 or 9:
//   Auto-seed system embedding provider (if LOCAL_EMBEDDING_ENABLE=true)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TEI (Text Embeddings Inference) via Docker profile | Sentence Transformers in-process | Phase 11 | Simpler deployment, no extra container |
| External API only (OpenAI, Azure, etc.) | Local + External as alternatives | Phase 11 | Enables air-gapped deployments |
| Manual model_providers setup | Auto-seeded from env vars | Phase 11 | Zero-config for self-hosted embedding |

**Deprecated/outdated:**
- The existing `BuiltinEmbed` class uses TEI (Text Embeddings Inference) as an HTTP sidecar, controlled by `COMPOSE_PROFILES=tei-*`. Phase 11 does NOT deprecate this -- both approaches coexist. SentenceTransformers is a new alternative.

## Open Questions

1. **Embedding dimension storage for mismatch detection**
   - What we know: Vectors are stored as `q_{dim}_vec` fields in OpenSearch. The current model's dimension is available via `model.get_sentence_embedding_dimension()`.
   - What's unclear: Whether to query OpenSearch for stored dimension or add a `embedding_dimension` column to the `knowledgebase` table.
   - Recommendation: Store `embedding_dimension` in the `knowledgebase` table at ingestion time. This avoids OpenSearch queries for UI rendering and provides a single source of truth. Can be added in the same migration as `is_system`.

2. **Token counting accuracy for local models**
   - What we know: Existing `num_tokens_from_string()` uses tiktoken (OpenAI tokenizer). Sentence Transformers models have their own tokenizers.
   - What's unclear: Whether the tiktoken approximation is acceptable for billing/usage tracking.
   - Recommendation: Use `num_tokens_from_string()` as-is. Token counting for local models is for usage tracking only (no billing), and the approximation is sufficient. The `LLMBundle.encode()` already skips token usage updates for `Builtin` factory -- apply same logic for `SentenceTransformers`.

3. **Graceful shutdown for embedding worker**
   - What we know: The worker runs a `XREADGROUP` loop with `BLOCK 5000` (5s timeout).
   - What's unclear: Exact signal handling for Docker stop.
   - Recommendation: Use `signal.signal(SIGTERM, handler)` to set a shutdown flag. The BLOCK timeout ensures the loop exits within 5s. Unprocessed messages are automatically redelivered by consumer group to other workers.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.11+ | Sentence Transformers | Yes | 3.12.3 | -- |
| Node.js 22+ | Backend | Yes | 22.22.1 | -- |
| torch (CPU) | Sentence Transformers | Yes (dev) | 2.11.0 | Install via CPU index |
| sentence-transformers | Embedding class | Yes (dev) | 3.4.1 | pip install |
| Valkey/Redis 8 | Stream bridge | Yes (Docker) | 8-alpine | -- |
| PostgreSQL 17 | model_providers migration | Yes (Docker) | 17-alpine | -- |

**Missing dependencies with no fallback:** None -- all dependencies are available.

**Missing dependencies with fallback:** torch/sentence-transformers are available in dev but must be added to `advance-rag/pyproject.toml` and Dockerfile for production builds.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (BE) | Vitest |
| Framework (Python) | pytest |
| Config file (BE) | `be/vitest.config.ts` |
| Config file (Python) | `advance-rag/tests/` directory |
| Quick run command (BE) | `npm run test -w be -- --run` |
| Quick run command (Python) | `cd advance-rag && python -m pytest tests/ -x -q` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EMB-01 | SentenceTransformersEmbed encodes texts and returns vectors | unit | `cd advance-rag && python -m pytest tests/test_sentence_transformers_embed.py -x` | No -- Wave 0 |
| EMB-02 | Auto-discovery registers SentenceTransformers in EmbeddingModel dict | unit | `cd advance-rag && python -m pytest tests/test_sentence_transformers_embed.py::test_factory_registration -x` | No -- Wave 0 |
| EMB-03 | Backend startup upserts/removes system provider | unit | `npm run test -w be -- --run tests/unit/system-provider-seed.test.ts` | No -- Wave 0 |
| EMB-04 | Valkey Stream bridge: XADD -> worker -> BRPOP round-trip | integration | Manual -- requires running Valkey and Python worker | No -- manual |
| EMB-05 | LLM Config page shows system badge, disables edit/delete | manual-only | Manual UI verification | -- |
| EMB-06 | Re-embed warning banner appears on dimension mismatch | manual-only | Manual UI verification | -- |

### Sampling Rate
- **Per task commit:** Quick run for affected workspace (`npm run test -w be -- --run` or `pytest tests/ -x -q`)
- **Per wave merge:** `npm run test` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `advance-rag/tests/test_sentence_transformers_embed.py` -- covers EMB-01, EMB-02 (mock sentence_transformers to avoid model download)
- [ ] `be/tests/unit/system-provider-seed.test.ts` -- covers EMB-03 (mock ModelFactory)
- [ ] Add `sentence-transformers` and `torch` (CPU) to `advance-rag/pyproject.toml`

## Sources

### Primary (HIGH confidence)
- Existing codebase: `advance-rag/rag/llm/embedding_model.py` -- BuiltinEmbed pattern, Base interface
- Existing codebase: `advance-rag/rag/llm/__init__.py` -- Auto-discovery via `_FACTORY_NAME`
- Existing codebase: `be/src/shared/services/llm-client.service.ts` -- Current `embedTexts()` using OpenAI API
- Existing codebase: `be/src/modules/search/services/search.service.ts` -- Current `embedQuery()` flow
- Existing codebase: `advance-rag/executor_wrapper.py` -- Redis usage pattern (lazy client, pub/sub)
- [BAAI/bge-m3 model card](https://huggingface.co/BAAI/bge-m3) -- Model capabilities and dimensions
- [sentence-transformers docs](https://sbert.net/) -- API reference for SentenceTransformer class
- [node-redis Streams API](https://github.com/redis/node-redis) -- XADD, BRPOP, XREADGROUP support in redis@5
- [PyTorch CPU installation](https://pytorch.org/get-started/locally/) -- CPU-only wheel index

### Secondary (MEDIUM confidence)
- Docker image size estimates for torch CPU (~250MB delta) based on PyTorch wheel repository inspection

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified as installed, patterns exist in codebase
- Architecture: HIGH -- follows exact existing patterns (BuiltinEmbed, auto-discovery, embed_limiter)
- Pitfalls: HIGH -- derived from codebase inspection and well-documented Redis behavior
- Valkey Stream bridge: MEDIUM -- pattern is sound but no existing Stream usage in this codebase (pub/sub is used, not Streams)

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain, libraries well-established)

## Project Constraints (from CLAUDE.md)

Directives that affect this phase:
- **JSDoc on all exported functions** (BE TypeScript) and **Google-style docstrings** (Python)
- **Inline comments above control flow**, business logic, integration points
- **NX-style module boundaries**: no cross-module imports, barrel exports only
- **Layering rules (STRICT)**: Controller -> Service -> Model, no ModelFactory in controllers
- **All DB migrations through Knex** -- including any schema additions to `model_providers`
- **Config access through `config` object only** -- never `process.env` directly in BE
- **Factory Pattern for models** -- new model methods registered in ModelFactory
- **i18n: 3 locales (en, vi, ja)** for all UI strings
- **Dark mode: class-based** -- all new UI elements must support both themes
- **No manual memoization** in React (React Compiler handles it)
