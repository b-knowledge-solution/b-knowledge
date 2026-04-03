# RAGFlow Port to advance-rag — v0.24.0 (c732a1c8e03aef804ce00c9c8fa5e4b39393e3eb)

## Overview

This document describes the port of [RAGFlow v0.24.0](https://github.com/infiniflow/ragflow) into the `advance-rag/` service for b-knowledge. The approach is **copy-all, patch-nothing**: all RAGFlow source is copied unmodified, and a thin integration layer wraps it for b-knowledge's architecture.

**Upstream commit:** `c732a1c8e03aef804ce00c9c8fa5e4b39393e3eb`
**RAGFlow version:** 0.24.0
**Port date:** 2026-03-09

---

## Architecture Differences from RAGFlow

| Aspect | RAGFlow | b-knowledge (advance-rag) |
|---|---|---|
| **Entry point** | Flask (`api/ragflow_server.py`) | FastAPI (`api/main.py`) |
| **Database** | MySQL (default) or PostgreSQL | PostgreSQL only |
| **Multi-tenancy** | Per-user tenants | Single system tenant (`SYSTEM_TENANT_ID`) |
| **Model providers** | Per-tenant `TenantLLM` | System-wide `TenantLLM` under system tenant |
| **Auth & RBAC** | Built-in user/token auth | Delegated to Node.js API gateway |
| **File storage** | MinIO (per-tenant paths) | MinIO (system tenant paths) |
| **Frontend** | React (UmiJS) | Separate React app (Vite + Ant Design) |
| **Task executor** | Direct invocation | Wrapped with Redis pub/sub progress |
| **Configuration** | YAML (`service_conf.yaml`) | Environment variables + YAML fallback |

---

## Source Copy Map

All directories copied **unmodified** from RAGFlow:

```
ragflow/rag/          → advance-rag/rag/          # RAG pipeline (parsers, LLM wrappers, NLP, GraphRAG, etc.)
ragflow/deepdoc/      → advance-rag/deepdoc/      # Document parsing, OCR, layout analysis
ragflow/common/       → advance-rag/common/       # Utilities, settings, constants, data sources
ragflow/api/db/       → advance-rag/db/           # Peewee models (db_models.py) + 24 service files
ragflow/memory/       → advance-rag/memory/       # Agent memory service
ragflow/api/utils/    → advance-rag/api/utils/    # API utility functions
```

**Total:** ~295 Python files copied, 0 modified from upstream.

---

## b-knowledge Integration Layer (New Files)

These files are NEW — they do not exist in RAGFlow and form the integration layer:

### Core

| File | Purpose |
|---|---|
| `advance-rag/config.py` | Environment-variable-driven configuration for all services |
| `advance-rag/system_tenant.py` | Ensures single system tenant row exists on startup |
| `advance-rag/executor_wrapper.py` | Monkey-patches `task_executor.set_progress` for Redis pub/sub |
| `advance-rag/pyproject.toml` | Python package definition with dependencies |
| `advance-rag/Dockerfile` | Container image (Python 3.11-slim + system deps) |
| `advance-rag/.env.example` | Example environment configuration |
| `advance-rag/conf/service_conf.yaml` | Service config YAML for `common/config_utils.py` |

### FastAPI Endpoints

| File | Endpoints | Purpose |
|---|---|---|
| `advance-rag/api/main.py` | — | FastAPI app with lifespan (startup: DB init, system tenant, progress hook) |
| `advance-rag/api/health.py` | `GET /health` | Health check |
| `advance-rag/api/datasets.py` | `GET/POST/PUT/DELETE /api/rag/datasets` | Dataset CRUD via `KnowledgebaseService` |
| `advance-rag/api/documents.py` | `GET/POST/DELETE /api/rag/datasets/:id/documents`, `GET .../download`, `POST .../parse` | Document upload (MinIO), parsing trigger, file download |
| `advance-rag/api/models.py` | `GET/POST /api/rag/models/providers`, `GET/POST /api/rag/models/defaults`, `GET /api/rag/models/available` | System-wide model provider management via `TenantLLM` |
| `advance-rag/api/chunks.py` | `POST /api/rag/datasets/:id/search`, `GET /api/rag/datasets/:id/chunks` | Hybrid search (semantic + full-text) + chunk listing |
| `advance-rag/api/sync.py` | `GET/POST /api/rag/sync-configs`, `POST .../trigger`, `GET .../connectors` | External data source sync (S3, Confluence, etc.) |

### Import Compatibility Shim

| File | Purpose |
|---|---|
| `advance-rag/api/db/__init__.py` | Redirects `api.db.*` → `db.*` imports. RAGFlow code uses `from api.db.services.xxx import Yyy`; this shim makes that work when `db/` is at the project root instead of under `api/`. Also defines enums (`FileType`, `UserTenantRole`, etc.) that RAGFlow originally defined in `api/db/__init__.py`. |

---

## Key Design Decisions

### 1. No Source Patches Needed

RAGFlow v0.24.0 **already supports PostgreSQL natively**:

```python
# db/db_models.py (unmodified RAGFlow code)
class PooledDatabase(Enum):
    MYSQL = RetryingPooledMySQLDatabase
    POSTGRES = RetryingPooledPostgresqlDatabase
    OCEANBASE = RetryingPooledOceanBaseDatabase

class DatabaseMigrator(Enum):
    MYSQL = MySQLMigrator
    POSTGRES = PostgresqlMigrator
    OCEANBASE = MySQLMigrator

class TextFieldType(Enum):
    MYSQL = "LONGTEXT"
    POSTGRES = "TEXT"
    OCEANBASE = "LONGTEXT"
```

Setting `DB_TYPE=postgres` via environment variable activates PostgreSQL mode. No patching required.

### 2. System Tenant Model

RAGFlow creates a tenant per user. b-knowledge uses a **single system tenant** (`SYSTEM_TENANT_ID = 00000000-0000-0000-0000-000000000001`).

`system_tenant.py` runs on startup and inserts this row into the `tenant` table if it doesn't exist. All datasets, documents, and model configs are associated with this tenant.

```python
SYSTEM_TENANT_ID = "00000000-0000-0000-0000-000000000001"

# All datasets: tenant_id = SYSTEM_TENANT_ID
# All TenantLLM rows: tenant_id = SYSTEM_TENANT_ID
# MinIO paths: {SYSTEM_TENANT_ID}/{dataset_id}/{file_id}/{filename}
# ES index: ragflow_{SYSTEM_TENANT_ID}
```

### 3. FastAPI Instead of Flask

RAGFlow uses Flask (`api/ragflow_server.py`). b-knowledge wraps RAGFlow's service layer with FastAPI endpoints. The FastAPI layer is a thin proxy — it calls RAGFlow's `KnowledgebaseService`, `DocumentService`, `TenantLLMService`, etc. directly.

### 4. Progress Pub/Sub via Redis

RAGFlow's `task_executor.set_progress(task_id, from_page, to_page, prog, msg)` updates the database. `executor_wrapper.py` monkey-patches this function to additionally publish progress events to Redis channel `task:{task_id}:progress`. The Node.js backend subscribes to this channel and streams it to the frontend via SSE.

### 5. Import Shim for `api.db.*`

RAGFlow's internal code uses `from api.db.services.task_service import TaskService`. Since we moved `api/db/` to `db/` at the project root, `advance-rag/api/db/__init__.py` installs a meta path finder that redirects these imports:

```python
# api.db.services.task_service → db.services.task_service
# api.db.db_models → db.db_models
```

This avoids patching any RAGFlow source files.

---

## Node.js Integration (be/)

The Node.js backend acts as the API gateway with RBAC:

### New BE Modules

| Module | Purpose |
|---|---|
| `be/src/modules/rag/` | Dataset CRUD with IAM `access_control` JSONB, document proxy, SSE progress, search/chunks |
| `be/src/modules/model-provider/` | Admin-only model provider CRUD, syncs to advance-rag `TenantLLM` |

### Dual-Write Pattern

1. Node.js creates dataset in its PostgreSQL `datasets` table (authoritative for RBAC)
2. Node.js proxies to advance-rag `POST /api/rag/datasets` (creates RAGFlow `Knowledgebase` row)
3. Both DBs share the same dataset ID
4. Node.js handles `access_control` filtering; advance-rag handles RAG pipeline

### API Routes Added

```
# Datasets (RBAC in Node.js, pipeline in advance-rag)
GET    /api/rag/datasets                          → ragService.getAvailableDatasets (ACL filtered)
POST   /api/rag/datasets                          → ragService.createDataset + ragProxyService.createDataset
GET    /api/rag/datasets/:id                      → ragService.getDatasetById
PUT    /api/rag/datasets/:id                      → ragService.updateDataset + ragProxyService.updateDataset
DELETE /api/rag/datasets/:id                      → ragService.deleteDataset + ragProxyService.deleteDataset

# Documents (proxy to advance-rag)
GET    /api/rag/datasets/:id/documents            → ragProxyService.listDocuments
POST   /api/rag/datasets/:id/documents            → multipart proxy to advance-rag
POST   /api/rag/datasets/:id/documents/:docId/parse → ragProxyService.parseDocument
GET    /api/rag/datasets/:id/documents/:docId/download → stream proxy from advance-rag/MinIO
GET    /api/rag/datasets/:id/documents/:docId/status → SSE via Redis pub/sub
DELETE /api/rag/datasets/:id/documents/:docId     → ragProxyService.deleteDocument

# Search + Chunks (proxy to advance-rag)
POST   /api/rag/datasets/:id/search              → ragProxyService.searchChunks
GET    /api/rag/datasets/:id/chunks               → ragProxyService.listChunks

# Model Providers (admin only, syncs to advance-rag TenantLLM)
GET    /api/rag/models/providers
POST   /api/rag/models/providers
PUT    /api/rag/models/providers/:id
DELETE /api/rag/models/providers/:id
GET    /api/rag/models/defaults
POST   /api/rag/models/defaults
```

---

## Frontend Integration (fe/)

### Dataset Feature (`fe/src/features/datasets/`)

| Component | Purpose |
|---|---|
| `DatasetsPage.tsx` | Grid/list view of datasets with search, create button |
| `DatasetDetailPage.tsx` | Dataset info + document table + file upload + preview drawer |
| `DocumentTable.tsx` | Ant Design table with parse/view/delete actions |
| `CreateDatasetModal.tsx` | Form: name, description, language, parser, embedding model |
| `FileUploadModal.tsx` | Drag & drop multi-file upload |
| `datasetApi.ts` | API client for all `/api/rag/datasets/*` endpoints |
| `useDatasets.ts` | React hooks for dataset + document CRUD |
| `types/index.ts` | TypeScript interfaces: `Dataset`, `Document`, `Chunk`, `ChunksResponse` |

### Shared Document Previewer (`fe/src/components/DocumentPreviewer/`)

| Component | Purpose |
|---|---|
| `DocumentPreviewer.tsx` | Split-panel: document preview (left) + chunk list (right) |
| `ChunkList.tsx` | Paginated chunk cards fetched from `/api/rag/datasets/:id/chunks?doc_id=X` |
| `ChunkCard.tsx` | Individual chunk: text content, page numbers, relevance score |

Reuses existing `FilePreview/PreviewComponents/*` for rendering:
- **PDF:** iframe with pdf.js
- **Images:** `<img>` with loading/error states
- **Text/Code:** `<pre>` with monospace font
- **Office:** mammoth (DOCX), xlsx (Excel), JSZip (PPTX)

---

## Docker Services

```yaml
services:
  postgres:        # PostgreSQL 17 (shared between Node.js and advance-rag)
  redis:           # Redis 7 (sessions, task queue, pub/sub progress)
  elasticsearch:   # ES 8.15.3 (vector + text search for chunks)
  minio:           # MinIO (document file storage)
  backend:         # Node.js API gateway (port 3001)
  rag-api:         # advance-rag FastAPI (port 9380)
  task-executor:   # advance-rag task worker (same image, different entrypoint)
```

---

## Environment Variables

### advance-rag Service

| Variable | Default | Purpose |
|---|---|---|
| `DB_TYPE` | `postgres` | Database type (must be "postgres") |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `b_knowledge` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | — | Database password |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |
| `ES_HOST` | `http://localhost:9200` | Elasticsearch URL |
| `ES_PASSWORD` | — | Elasticsearch password |
| `MINIO_HOST` | `localhost:9000` | MinIO host:port |
| `MINIO_ACCESS_KEY` | — | MinIO access key |
| `MINIO_SECRET_KEY` | — | MinIO secret key |
| `SYSTEM_TENANT_ID` | `00000000-0000-0000-0000-000000000001` | Fixed system tenant UUID |
| `DEFAULT_EMBEDDING_MODEL` | — | Default embedding model name |
| `DEFAULT_CHAT_MODEL` | — | Default LLM model name |
| `DEFAULT_RERANK_MODEL` | — | Default rerank model name |
| `API_HOST` | `0.0.0.0` | FastAPI bind host |
| `API_PORT` | `9380` | FastAPI bind port |

### Node.js Backend (added)

| Variable | Default | Purpose |
|---|---|---|
| `RAG_SERVICE_URL` | `http://localhost:9380` | advance-rag service URL |

---

## Upgrade Workflow (Future RAGFlow Versions)

```bash
# 1. Update ragflow reference
cd ragflow && git fetch && git checkout <new-tag>

# 2. Note the new commit hash and version
git log --oneline -1

# 3. Re-copy source directories (overwrite)
cp -r ragflow/rag/ advance-rag/rag/
cp -r ragflow/deepdoc/ advance-rag/deepdoc/
cp -r ragflow/common/ advance-rag/common/
cp -r ragflow/api/db/ advance-rag/db/
cp -r ragflow/memory/ advance-rag/memory/
cp -r ragflow/api/utils/*.py advance-rag/api/utils/

# 4. DO NOT overwrite these b-knowledge files:
#    - advance-rag/api/db/__init__.py (our import shim)
#    - advance-rag/api/main.py (FastAPI entry)
#    - advance-rag/api/datasets.py, documents.py, models.py, chunks.py, sync.py
#    - advance-rag/config.py, system_tenant.py, executor_wrapper.py

# 5. Check for new enums in ragflow/api/db/__init__.py
#    Update advance-rag/api/db/__init__.py shim if new enums were added

# 6. Check for new dependencies in ragflow/pyproject.toml
#    Update advance-rag/pyproject.toml accordingly

# 7. Test
cd advance-rag && DB_TYPE=postgres python -m uvicorn api.main:app --reload

# 8. Create patch note for the new version
cp patches/ragflow-port-v0.24.0-c732a1c.md patches/ragflow-port-v<NEW_VERSION>-<NEW_HASH>.md
```

---

## Known Limitations

1. **No per-user tenancy** — All data lives under one system tenant. Multi-tenancy is handled at the Node.js IAM layer (`access_control` JSONB).
2. **GraphRAG / RAPTOR / Advanced RAG** — Code is copied but not activated via UI. Parser types `naive`, `book`, `paper`, `table`, `qa`, `laws`, `manual`, `presentation`, `picture`, `one`, `audio`, `email` are enabled.
3. **OAuth / SMTP** — RAGFlow's built-in OAuth and email features are not used; Node.js handles auth.
4. **Agent / Canvas** — RAGFlow's agent system (`agent/`) is not copied. Only the RAG pipeline (`rag/`, `deepdoc/`) is used.
5. **PDF chunk highlighting** — The current FE document previewer uses iframe-based PDF rendering. RAGFlow's `react-pdf-highlighter` based chunk highlighting is not yet ported.
6. **Search** — Semantic search requires a configured embedding model in `TenantLLM`. Falls back to full-text only if no embedding model is set.

---

## File Counts

| Directory | Files | Source |
|---|---|---|
| `advance-rag/rag/` | ~120 | Copied from ragflow/rag/ |
| `advance-rag/deepdoc/` | ~40 | Copied from ragflow/deepdoc/ |
| `advance-rag/common/` | ~30 | Copied from ragflow/common/ |
| `advance-rag/db/` | ~30 | Copied from ragflow/api/db/ |
| `advance-rag/memory/` | ~5 | Copied from ragflow/memory/ |
| `advance-rag/api/` | 10 | **NEW** (b-knowledge integration) |
| `advance-rag/*.py` | 4 | **NEW** (config, system_tenant, executor_wrapper, __init__) |
| **Total** | ~295 | ~280 upstream + ~15 new |
