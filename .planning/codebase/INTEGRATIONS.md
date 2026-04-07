# External Integrations

**Analysis Date:** 2026-04-07

B-Knowledge integrates with five core infrastructure services (PostgreSQL, Valkey/Redis, OpenSearch, RustFS/S3, Memgraph) plus pluggable LLM/embedding/auth providers. All infrastructure is defined in `docker/docker-compose-base.yml` and shared across workspaces.

## Infrastructure Services (Self-Hosted)

| Service | Image | Port(s) | Purpose | Used By |
|---------|-------|---------|---------|---------|
| PostgreSQL | `postgres:17-alpine` | 5432 | Primary relational DB | `be/` (Knex), `advance-rag/` (Peewee) |
| Valkey | `valkey/valkey:8-alpine` | 6379 | Cache, sessions, queues, pub/sub | `be/`, `advance-rag/`, `converter/` |
| OpenSearch | `opensearchproject/opensearch:3.5.0` | 9201 | Vector + full-text search | `be/`, `advance-rag/` |
| RustFS | `rustfs/rustfs:latest` | 9000 (S3) / 9001 (console) | S3-compatible object storage | `be/` (MinIO client), `advance-rag/` (MinIO client) |
| Memgraph | `memgraph/memgraph:latest` | 7687 (Bolt) / 7444 (web) | Code knowledge graph (BSL-1.1) | `be/` (`neo4j-driver`), `advance-rag/` (`neo4j` py) |

Compose file: `docker/docker-compose-base.yml`. App services live in `docker/docker-compose.yml`.

### PostgreSQL

- **Database:** `knowledge_base` (default, override via `DB_NAME`)
- **Backend access:** Knex ORM through `be/src/shared/db/knex.js`; **all** queries (including for tables created/used by Peewee) live in `be/src/shared/models/` extending `BaseModel<T>` and registered in `ModelFactory`
- **Worker access:** Peewee ORM in `advance-rag/db/db_models.py` and `advance-rag/db/services/` — read/write only, **no** schema migrations from Python
- **Migrations:** Knex-only, naming `YYYYMMDDhhmmss_<name>.ts` under `be/src/shared/db/migrations/`
- **Env vars:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (identical in `be/.env` and `advance-rag/.env`)

### Valkey (Redis-compatible)

Used as four logical channels (single instance, single DB):

| Channel | Producer | Consumer | Key Pattern |
|---------|----------|----------|-------------|
| Express sessions | `be/` (`connect-redis` 9) | `be/` | session store keys |
| Embedding worker status | `advance-rag/` | `be/` (`embedding-stream.service.ts`) | `EMBED_WORKER_STATUS_KEY` (defined in both `be/src/shared/constants/embedding.ts` and `advance-rag/embed_constants.py` — must match) |
| Task queue (RAG) | `be/` (job creation) | `advance-rag/` (`task_executor`) | RAGFlow-style task keys |
| Converter queue + status | `be/` | `converter/` | `converter:vjob:*`, `converter:files:*`, `converter:file:*`, `converter:manual_trigger`, `converter:schedule:config` |
| Progress pub/sub (SSE) | `advance-rag/`, `converter/` | `be/` → Socket.IO clients | per-job channels |

- **Env vars:** `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` (BE adds `SESSION_STORE=redis|memory`); converter optionally accepts `REDIS_URL`
- **Cross-language constants:** Any string key/status shared between TS and Python MUST be defined in both `be/src/shared/constants/embedding.ts` and `advance-rag/embed_constants.py` with cross-reference comments

### OpenSearch

- **Index naming:** `knowledge_<tenantId>` — RAGFlow's original `ragflow_` prefix is renamed during upstream merges (see `advance-rag/rag/nlp/search.py` `index_name()`); mismatch causes "0 chunks found" on FE
- **Backend client:** `@opensearch-project/opensearch` 3.5.1 — used for read/admin operations (index creation on KB create, status checks)
- **Worker client:** `opensearch-py` >=2.0 — used by `advance-rag/common/doc_store/` for chunk indexing, kNN search, hybrid search; pool size set via `OPENSEARCH_POOL_MAXSIZE` (>= `MAX_CONCURRENT_TASKS`)
- **Auth:** admin password via `VECTORDB_PASSWORD` (default `OpenSearch@123`); security plugin disabled in dev (`plugins.security.disabled=true`)
- **Env vars (must match in `be/.env` and `advance-rag/.env`):** `VECTORDB_HOST` (e.g. `http://localhost:9201`), `VECTORDB_PASSWORD`; worker also sets `DOC_ENGINE=opensearch`
- **Alternate vector backends supported by worker:** Infinity (`infinity-sdk`), OceanBase Vector (`pyobvector`) — switched via `DOC_ENGINE`

### RustFS / S3-Compatible Object Storage

- **Backend client:** `minio` 8.0 (Node.js) — file upload/download for knowledge base documents
- **Worker client:** `minio` 7.2 (Python) — chunk source files, parsed artifacts; concurrency tuned via `MAX_CONCURRENT_MINIO`
- **Single-bucket mode:** all objects under one bucket (`S3_BUCKET=knowledge`), optional `S3_PREFIX_PATH`
- **Env vars (BE):** `S3_ENDPOINT`, `S3_PORT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_USE_SSL`, `S3_BUCKET`, `S3_PREFIX_PATH`
- **Env vars (worker):** `S3_HOST` (host:port), `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PREFIX_PATH`
- **Optional alternate backends compiled into worker:** Azure Blob / DataLake (`azure-storage-blob`, `azure-storage-file-datalake`, `azure-identity`), Google Cloud Storage (`google-cloud-storage`), AWS S3 (`boto3`), generic via `opendal`

### Memgraph (Code Knowledge Graph)

- **Protocol:** Bolt (`bolt://localhost:7687`)
- **Backend client:** `neo4j-driver` 6.0
- **Worker client:** `neo4j` Python driver >=5.0 (used by `advance-rag/rag/graphrag/` for GraphRAG construction and querying)
- **Env var:** `MEMGRAPH_BOLT_URL` (set in both `be/.env` and `advance-rag/.env`)
- **Notes:** Memgraph license is BSL-1.1 (only non-OSI infra component); used for code review graph (15K+ nodes) and GraphRAG knowledge graphs

## Data Flow Across Workspaces

```
FE (React) ──HTTPS──▶ BE (Express) ──Knex──▶ PostgreSQL
   ▲                       │                     ▲
   │                       ├─MinIO──▶ RustFS ◀───┤
   │                       ├─OpenSearch SDK──▶ OpenSearch ◀── opensearch-py ── advance-rag
   │                       ├─Redis──▶ Valkey ◀─── redis ──── advance-rag / converter
   │                       │                                       │
   │                       └─Bolt──▶ Memgraph ◀── neo4j ──── advance-rag
   │
   └◀── Socket.IO (real-time) ── BE ◀── Redis pub/sub ── advance-rag / converter
```

## LLM & Embedding Providers

Configured **per-tenant** in the database (model providers table managed by BE), not via env vars.

- **OpenAI-compatible APIs:** via `openai` SDK (BE 6.27, worker >=1.0) — works with OpenAI, Azure OpenAI, LiteLLM, vLLM, OpenRouter, etc.
- **LiteLLM proxy:** optional dedicated compose file `docker/docker-compose-litellm.yml` (`npm run docker:litellm`); worker bundles `litellm` >=1.0 for direct multi-provider routing
- **Ollama:** worker bundles `ollama` >=0.3 for local model serving
- **Local CPU embeddings (Sentence Transformers):**
  - Toggle: `LOCAL_EMBEDDING_ENABLE=true` in both `be/.env` and `advance-rag/.env`
  - Model: `LOCAL_EMBEDDING_MODEL` (HuggingFace ID, e.g. `BAAI/bge-m3`)
  - Offline path (air-gapped): `LOCAL_EMBEDDING_PATH` (worker only)
  - When enabled, BE auto-seeds a system-managed embedding provider on startup
- **Default tenant models** (used to initialize `SYSTEM_TENANT_ID`): `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_CHAT_MODEL`, `DEFAULT_RERANK_MODEL`, `DEFAULT_ASR_MODEL`, `DEFAULT_IMAGE2TEXT_MODEL`, `DEFAULT_TTS_MODEL`
- **System tenant ID:** fixed UUID `00000000000000000000000000000001` (`SYSTEM_TENANT_ID`)

## LLM Observability — Langfuse

- **Backend SDK:** `langfuse` 3.27 (`be/`)
- **Worker SDK:** `langfuse` >=2.0 (`advance-rag/`)
- **Env vars (BE):** `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL` (default `https://cloud.langfuse.com`), `LANGFUSE_TRACE_EMBEDDINGS=false`
- **External trace API:** BE exposes endpoints for external systems to push traces — `EXTERNAL_TRACE_ENABLED`, `EXTERNAL_TRACE_API_KEY`, `EXTERNAL_TRACE_CACHE_TTL`, `EXTERNAL_TRACE_LOCK_TIMEOUT`
- **Graceful shutdown:** Langfuse client flushed on SIGTERM/SIGINT alongside Redis/DB pools

## Authentication & Identity

- **Local login:** username/password in `users` table; toggle `ENABLE_LOCAL_LOGIN=true|false`; root admin bootstrap via `KB_ROOT_USER`, `KB_ROOT_PASSWORD` (required in production)
- **Microsoft Entra ID (Azure AD) OAuth:**
  - BE env: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `AZURE_AD_REDIRECT_URI` (default `http://localhost:3001/api/auth/callback`), optional `AZURE_AD_PROXY_URL`
  - FE env: `VITE_AZURE_AD_CLIENT_ID`, `VITE_AZURE_AD_TENANT_ID`, `VITE_AZURE_AD_REDIRECT_URI`
  - Implementation in `be/src/modules/auth/`
- **Sessions:** `express-session` 1.18 + `connect-redis` 9 in production (`SESSION_STORE=redis`), in-memory fallback in dev. TTL via `SESSION_TTL_DAYS` (default 7). `SESSION_SECRET` mandatory in prod
- **Cross-subdomain:** `SHARED_STORAGE_DOMAIN` (e.g. `.example.com`) enables cookie sharing across subdomains
- **Authorization (RBAC):** `@casl/ability` 6.8 in BE; `@casl/react` 5.0 in FE for declarative permission checks
- **Admin API key:** `ADMIN_API_KEY` for internal/system endpoints

## MCP (Model Context Protocol)

- **Backend SDK:** `@modelcontextprotocol/sdk` 1.27 — BE exposes MCP server endpoints for external AI clients to consume B-Knowledge tools
- Configuration loaded from `docker/config/system-tools.config.json` (overridable via `SYSTEM_TOOLS_CONFIG_PATH`)

## Real-Time Channels

- **Socket.IO 4.8** server in `be/` (`be/src/shared/services/`)
- **Client:** `socket.io-client` 4.8 in `fe/lib/socket.ts` (singleton, exponential reconnect)
- **Bridge:** `useSocketQueryInvalidation()` in `fe/src/app/Providers.tsx` maps socket events → TanStack Query invalidations
- **Streaming:** SSE / `embedding-stream.service.ts` for chunking + embedding progress; consumed by FE imperative hooks (`useState` + `useRef`)

## Document Conversion Pipeline (Converter Worker)

- **Trigger:** BE writes a version-level conversion job to Redis sorted set `converter:vjob:pending` with config JSON (post-processing flags, suffix rules, Excel orientation)
- **Worker loop:** `converter/src/worker.py` polls Redis (`POLL_INTERVAL=30s`), respects optional schedule window (`converter:schedule:config`), processes files sequentially with 2s spacing
- **File routing (`converter.py`):**
  | Extension | Method |
  |-----------|--------|
  | `.doc/.docx/.docm` | `soffice --headless --convert-to pdf` |
  | `.ppt/.pptx/.pptm` | `soffice --headless --convert-to pdf` |
  | `.xls/.xlsx/.xlsm` | Python-UNO bridge (`python3-uno`) for fine-grained control |
  | `.pdf` | Pass-through copy |
- **Post-processing (`pdf_processor.py`):** empty page removal (pdfminer), whitespace trimming (CropBox with margin), parallel up to 8 workers
- **Filesystem:** reads from BE upload directory (`UPLOAD_DIR=../be/uploads`), writes to `CONVERTER_OUTPUT_DIR=/app/.data/converted` — paths must be mounted in both containers
- **No direct converter ↔ advance-rag communication** — both coordinate only via Redis and shared filesystem

## Document Parsing Backends (advance-rag)

External binaries / runtimes invoked by `advance-rag`:

- **Tika** (`tika` Python wrapper) — invokes bundled Apache Tika JAR via JRE for legacy `.doc` / fallback parsing
- **Tesseract OCR** — `tesseract-ocr` system package for image → text
- **Poppler** — `poppler-utils` for PDF rendering primitives
- **DeepDoc** — pre-trained PDF layout/structure models pre-cached into Docker image (no runtime download)
- **NLTK / tiktoken** data — pre-downloaded into image
- **Optional remote Docling server:** `DOCLING_SERVER_URL` (commented in `.env.example`)

## CI/CD & Deployment

- **Container build scripts:** `scripts/build-images.sh`, `scripts/build-images-offline.sh`, plus per-service `build-{be,fe,worker,converter}-offline.sh`
- **Compose stacks:**
  - `docker/docker-compose-base.yml` — infrastructure only
  - `docker/docker-compose.yml` — full app stack (BE, task-executor, converter)
  - `docker/docker-compose-demo.yml` + `docker/Dockerfile.demo[.offline]` — all-in-one demo image
  - `docker/docker-compose-litellm.yml` — optional LiteLLM proxy
- **Reverse proxy:** Nginx configs in `docker/nginx/` (`demo.conf`, `frontend-docker.conf`)
- **HTTPS (dev):** `npm run generate:cert` produces self-signed certs in `certs/`; toggle `HTTPS_ENABLED=true`; cert fallback to HTTP if files missing
- **Offline / air-gapped:** Each Python workspace ships `Dockerfile.offline` with pre-cached models; `docker/nexus.env.example` documents internal Nexus mirror config

## Environment Files (per workspace)

| File | Purpose | Critical secrets |
|------|---------|------------------|
| `be/.env` | BE server, DB, Redis, sessions, CORS, Azure AD, Langfuse, S3, OpenSearch, Memgraph, local embedding | `DB_PASSWORD`, `SESSION_SECRET`, `KB_ROOT_PASSWORD`, `AZURE_AD_CLIENT_SECRET`, `LANGFUSE_SECRET_KEY`, `S3_SECRET_KEY`, `VECTORDB_PASSWORD`, `ADMIN_API_KEY` |
| `fe/.env` | API base URL, Azure AD public IDs, RAGFlow paths, feature flags | none (public values) |
| `advance-rag/.env` | DB, Redis, OpenSearch, S3, default models, system tenant, local embedding, Memgraph | `DB_PASSWORD`, `S3_SECRET_KEY`, `VECTORDB_PASSWORD` |
| `converter/.env` | Redis only | `REDIS_PASSWORD` |
| `docker/.env` | Compose-level overrides for all of the above | aggregate of above |

**Production checklist (from root CLAUDE.md):** rotate all default passwords, set `ENABLE_LOCAL_LOGIN=false`, generate strong `SESSION_SECRET`, configure SSL certs.

## Webhooks & Callbacks

- **Incoming:**
  - `GET /api/auth/callback` — Azure AD OAuth callback (`AZURE_AD_REDIRECT_URI`)
  - External trace ingestion endpoints (gated by `EXTERNAL_TRACE_API_KEY`)
- **Outgoing:** None detected as standard webhook senders; outbound HTTP is to LLM provider APIs and Langfuse only

## Cron / Scheduled Jobs

- `node-cron` 4.2 in BE schedules:
  - Temp file cleanup — `TEMP_FILE_CLEANUP_SCHEDULE` (default `0 0 * * *`), TTL `TEMP_FILE_TTL_MS` (default 7 days), path `TEMP_CACHE_PATH=./temp`
  - Other periodic tasks registered at startup (after migrations + root user bootstrap)

---

*Integration audit: 2026-04-07*
