# External Integrations

**Analysis Date:** 2026-03-23

## Service Dependencies

| Service | Purpose | Protocol | Port | Config Location |
|---------|---------|----------|------|-----------------|
| PostgreSQL 17 | Primary relational database | TCP (pg wire) | 5432 | `be/.env` (`DB_*`), `advance-rag/.env` (`DB_*`) |
| Valkey 8 (Redis-compat) | Sessions, queues, pub/sub, cache | TCP (RESP) | 6379 | `be/.env` (`REDIS_*`), `advance-rag/.env` (`REDIS_*`) |
| OpenSearch 3.5.0 | Vector + text search | HTTP REST | 9201 | `be/.env` (`VECTORDB_*`), `advance-rag/.env` (`VECTORDB_*`) |
| RustFS (S3-compat) | File/document storage | HTTP (S3 API) | 9000 | `be/.env` (`S3_*`), `advance-rag/.env` (`S3_*`) |
| LiteLLM (optional) | OpenAI-compatible LLM proxy | HTTP REST | 4000 | `docker/config/litellm_config.yaml` |

## API Integrations

### LLM Providers

**Backend LLM Client:** `be/src/shared/services/llm-client.service.ts`
- Uses OpenAI SDK (`openai` ^6.27.0) with configurable base URL
- Compatible with any OpenAI-compatible API (LiteLLM, Ollama, Azure OpenAI, OpenAI)
- Streaming support via SSE

**RAG Worker LLM:** `advance-rag/rag/llm/`
- `litellm` >=1.0.0 - Multi-provider gateway (routes to Ollama, OpenAI, Azure, etc.)
- `openai` >=1.0.0 - Direct OpenAI API calls
- `ollama` >=0.3.0 - Direct Ollama API calls
- Provider configured per-tenant via `tenant_llm` DB table

### Observability

**Langfuse:** LLM tracing and observability
- Backend: `be/src/shared/services/langfuse.service.ts` (langfuse ^3.27.0)
- RAG Worker: `langfuse` >=2.0.0
- Config: `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL`
- Optional: `LANGFUSE_TRACE_EMBEDDINGS` controls embedding trace verbosity

### Authentication

**Microsoft Entra ID (Azure AD):**
- Backend: OAuth2 callback at `GET /api/auth/callback`
- Frontend: MSAL-compatible config via `VITE_AZURE_AD_*` env vars
- Config: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`, `AZURE_AD_REDIRECT_URI`
- Optional proxy: `AZURE_AD_PROXY_URL` for corporate network access
- Can be disabled: `ENABLE_LOCAL_LOGIN=true` enables username/password auth

### Agent Tools (RAG Worker)

External service integrations available as agent tools in `advance-rag/rag/agent/tools/`:

| Tool | Service | File |
|------|---------|------|
| Bing Search | Bing Web Search API | `bing_tool.py` |
| Google Search | Google Custom Search | `google_tool.py` |
| Google Scholar | Google Scholar | `google_scholar_tool.py` |
| Google Maps | Google Maps API | `google_maps_tool.py` |
| DuckDuckGo | DuckDuckGo Search | `duckduckgo_tool.py` |
| SearXNG | Self-hosted meta-search | `searxng_tool.py` |
| Tavily | Tavily Search API | `tavily_tool.py` |
| ArXiv | ArXiv API | `arxiv_tool.py` |
| PubMed | PubMed/NCBI API | `pubmed_tool.py` |
| Wikipedia | Wikipedia API | `wikipedia_tool.py` |
| GitHub | GitHub API | `github_tool.py` |
| Email | SMTP | `email_tool.py` |
| DeepL | DeepL Translation API | `deepl_tool.py` |
| Web Crawler | HTTP + HTML parsing | `crawler_tool.py` |
| AKShare | Chinese financial data | `akshare_tool.py` |
| Jin10 | Financial news (Chinese) | `jin10_tool.py` |
| TuShare | Chinese stock market | `tushare_tool.py` |
| WenCai | Chinese financial research | `wencai_tool.py` |
| Yahoo Finance | Yahoo Finance API | `yahoofinance_tool.py` |
| QWeather | QWeather API | `qweather_tool.py` |
| SQL Executor | Database query | `exesql_tool.py` |
| Code Executor | Sandboxed code execution | `code_exec_tool.py` |
| RAG Retrieval | Internal knowledge base search | `retrieval_tool.py` |

### MCP (Model Context Protocol)

- Backend: `be/src/modules/agents/services/agent-mcp.service.ts`
- SDK: `@modelcontextprotocol/sdk` ^1.27.1
- Enables agents to connect to external MCP servers for tool execution

### Web Search (Backend)

- Backend: `be/src/shared/services/web-search.service.ts`
- Used for search-augmented responses

### Text-to-Speech

- Backend: `be/src/shared/services/tts.service.ts`
- Configurable TTS provider endpoint

## Infrastructure Services

### Message Queue / Pub-Sub

**Redis (Valkey) Queues:**
- Task queue for RAG document processing (`advance-rag/`)
- Converter job queue with sorted sets (`converter/src/worker.py`)
- Progress pub/sub for SSE streaming to frontend
- Backend clients: `be/src/shared/services/queue.service.ts`, `be/src/shared/services/redis.service.ts`

**Converter Redis Key Layout:**
```
converter:vjob:{jobId}               # Hash: job metadata
converter:vjob:pending               # Sorted Set: pending job IDs
converter:vjob:status:{status}       # Set: job IDs by status
converter:files:{jobId}              # Set: file tracking IDs
converter:file:{fileId}              # Hash: per-file record
converter:manual_trigger             # String: "1" if active
converter:schedule:config            # Hash: schedule settings
```

### Search Engine

**OpenSearch 3.5.0:**
- kNN vector search (cosine similarity via script_score)
- Full-text search with BM25
- One index per knowledge base
- Backend client: `be/src/shared/services/rag-query.service.ts` (via `@opensearch-project/opensearch`)
- RAG client: `advance-rag/common/doc_store/` (via `opensearch-py`)

### File Storage

**RustFS (S3-compatible):**
- Single bucket: `knowledge` (configurable via `S3_BUCKET`)
- Optional prefix path: `S3_PREFIX_PATH`
- Backend client: `be/src/shared/services/minio.service.ts` (MinIO SDK)
- RAG client: `advance-rag/` (MinIO Python SDK)
- Converter client: reads/writes via S3 API

**Multi-cloud support in RAG worker:**
- AWS S3 (boto3)
- Azure Blob Storage (azure-storage-blob)
- Google Cloud Storage (google-cloud-storage)
- OpenDAL abstraction layer

### Realtime

**Socket.IO:**
- Server: `be/src/shared/services/socket.service.ts` (socket.io ^4.8.3)
- Client: `fe/src/lib/socket.ts` (socket.io-client ^4.8.3)
- Singleton pattern with auto-reconnect (5 attempts, exponential backoff)
- Hook: `useSocketEvent(name, callback)` for subscriptions
- Integration: `useSocketQueryInvalidation()` maps events to TanStack Query invalidation

### Sandboxed Code Execution

**Docker (Dockerode):**
- Backend: `be/src/modules/agents/services/agent-sandbox.service.ts`
- Uses `dockerode` ^4.0.10 to spin up containers for safe code execution in agent workflows

## Environment Configuration

### Backend (`be/.env`)

| Variable | Purpose | Required |
|----------|---------|----------|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection | Yes |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` | Valkey/Redis connection | Yes |
| `SESSION_SECRET` | Express session signing | Yes (production) |
| `SESSION_STORE` | `redis` or `memory` | No (defaults by env) |
| `VECTORDB_HOST`, `VECTORDB_PASSWORD` | OpenSearch connection | Yes |
| `S3_ENDPOINT`, `S3_PORT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | S3 storage | Yes |
| `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_BASE_URL` | LLM observability | No |
| `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | SSO auth | No |
| `ADMIN_API_KEY` | Admin API authentication | Yes |
| `ENABLE_LOCAL_LOGIN` | Enable username/password auth | No (default: true) |
| `KB_ROOT_USER`, `KB_ROOT_PASSWORD` | Bootstrap admin account | No |
| `FRONTEND_URL` | CORS origin + redirects | Yes |
| `CORS_ORIGINS` | Additional CORS origins | No |
| `HTTPS_ENABLED` | Enable HTTPS | No (default: false) |
| `EXTERNAL_TRACE_ENABLED`, `EXTERNAL_TRACE_API_KEY` | External trace ingestion | No |

### Frontend (`fe/.env`)

| Variable | Purpose | Required |
|----------|---------|----------|
| `VITE_API_BASE_URL` | Backend API URL | Yes |
| `VITE_AZURE_AD_CLIENT_ID`, `VITE_AZURE_AD_TENANT_ID` | Azure AD client config | No |
| `VITE_ENABLE_AI_CHAT` | Feature flag: AI Chat | No (default: true) |
| `VITE_ENABLE_AI_SEARCH` | Feature flag: AI Search | No (default: true) |
| `VITE_ENABLE_HISTORY` | Feature flag: History | No (default: false) |

### RAG Worker (`advance-rag/.env`)

| Variable | Purpose | Required |
|----------|---------|----------|
| `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL | Yes |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis/Valkey | Yes |
| `DOC_ENGINE` | Search engine type (opensearch) | Yes |
| `VECTORDB_HOST`, `VECTORDB_PASSWORD` | OpenSearch | Yes |
| `S3_HOST`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | S3 storage | Yes |
| `DEFAULT_EMBEDDING_MODEL`, `DEFAULT_CHAT_MODEL`, `DEFAULT_RERANK_MODEL` | Model defaults | No |
| `SYSTEM_TENANT_ID` | Fixed UUID for single-tenant mode | Yes |
| `MAX_CONCURRENT_TASKS`, `MAX_CONCURRENT_CHUNK_BUILDERS` | Worker tuning | No |

### Converter (via `docker/.env`)

| Variable | Purpose | Required |
|----------|---------|----------|
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | Redis/Valkey | Yes |
| `S3_HOST`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` | S3 storage | Yes |
| `POLL_INTERVAL` | Seconds between Redis polls (default: 30) | No |

### Configuration Files

| File | Purpose | Mounted |
|------|---------|---------|
| `docker/config/system-tools.config.json` | System monitoring tools UI config | Read-only in backend container |
| `docker/config/ragflow.config.json` | RAGFlow iframe/integration config | Read-only in backend container |
| `docker/config/litellm_config.yaml` | LiteLLM model routing config | Read-only in litellm container |
| `be/src/shared/config/index.ts` | Centralized config object (never use process.env directly) | N/A |
| `be/src/shared/config/rbac.ts` | Role-based access control definitions | N/A |
| `be/src/shared/config/file-upload.config.ts` | File upload validation rules | N/A |

## Webhooks & Callbacks

**Incoming:**
- `be/src/modules/agents/routes/agent-webhook.routes.ts` - Agent webhook endpoints for external triggers
- `be/src/modules/agents/routes/agent-embed.routes.ts` - Embedded agent widget endpoints
- `GET /api/auth/callback` - Azure AD OAuth2 callback

**Outgoing:**
- Agent tool executions (search APIs, email, web crawling)
- LLM API calls (OpenAI-compatible endpoints)
- Langfuse trace submissions

## Inter-Service Communication

```
Frontend (React SPA)
  |-- HTTP REST --> Backend (Express API)
  |-- WebSocket --> Backend (Socket.IO)

Backend (Express)
  |-- SQL ---------> PostgreSQL (shared DB)
  |-- Redis proto -> Valkey (sessions, queues, pub/sub)
  |-- HTTP --------> OpenSearch (search queries)
  |-- S3 API ------> RustFS (file operations)
  |-- HTTP --------> LLM providers (OpenAI, LiteLLM, Ollama)
  |-- HTTP --------> Langfuse (traces)
  |-- Docker API --> Docker daemon (sandboxed code exec)

RAG Worker (Python)
  |-- SQL ---------> PostgreSQL (shared DB, Peewee ORM)
  |-- Redis proto -> Valkey (task queue, progress pub/sub)
  |-- HTTP --------> OpenSearch (indexing, search)
  |-- S3 API ------> RustFS (document files)
  |-- HTTP --------> LLM providers (embedding, chat, rerank)

Converter (Python)
  |-- Redis proto -> Valkey (job queue, progress pub/sub)
  |-- S3 API ------> RustFS (read source files, write converted PDFs)
```

**Key: No direct service-to-service HTTP calls between app services.** All coordination happens through shared PostgreSQL and Redis.

---

*Integration audit: 2026-03-23*
