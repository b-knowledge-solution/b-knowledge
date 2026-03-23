# RAGFlow Port to advance-rag -- v0.25.0 (df2cc32f5)

## Overview

This document describes the incremental port of [RAGFlow](https://github.com/infiniflow/ragflow) upstream commits into the `advance-rag/` service for b-knowledge. The approach remains **copy-all, patch-nothing** for pure directories, with manual merge for b-knowledge-modified files and concept ports for TypeScript backend services.

**Upstream commit:** `df2cc32f5` (nightly-4-gdf2cc32f5)
**Previous port:** `c732a1c8e` (v0.24.0)
**Port date:** 2026-03-23
**Changes:** 49 commits, 60 files, +2,697/-1,516 lines

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
| **Frontend** | React (UmiJS) | Separate React app (Vite + Tailwind + shadcn/ui) |
| **Task executor** | Direct invocation | Wrapped with Redis pub/sub progress |
| **Configuration** | YAML (`service_conf.yaml`) | Environment variables + YAML fallback |
| **Search engine** | Elasticsearch | OpenSearch |

---

## Source Copy Map

All directories copied **unmodified** from RAGFlow:

```
ragflow/rag/          -> advance-rag/rag/          # RAG pipeline (parsers, LLM wrappers, NLP, GraphRAG, etc.)
ragflow/deepdoc/      -> advance-rag/deepdoc/      # Document parsing, OCR, layout analysis
ragflow/common/       -> advance-rag/common/       # Utilities, settings, constants, data sources
ragflow/api/db/       -> advance-rag/db/           # Peewee models (db_models.py) + 24 service files
ragflow/memory/       -> advance-rag/memory/       # Agent memory service
ragflow/api/utils/    -> advance-rag/api/utils/    # API utility functions
ragflow/conf/         -> advance-rag/conf/         # LLM factory configs, service_conf.yaml
```

**New in v0.25.0 copy:**
- `ragflow/conf/` -> `advance-rag/conf/` (LLM factory configs with Perplexity + MiniMax entries)
- `deepdoc/parser/epub_parser.py` (new EPUB document parser, 145 lines)
- `api/utils/image_utils.py` (chunk image base64 utilities, 40 lines)

**Total:** ~300 Python files copied, 0 modified from upstream.

---

## b-knowledge Integration Layer (New Files)

These files are NEW -- they do not exist in RAGFlow and form the integration layer. They are NEVER overwritten during upstream merges.

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
| `advance-rag/api/main.py` | -- | FastAPI app with lifespan (startup: DB init, system tenant, progress hook) |
| `advance-rag/api/health.py` | `GET /health` | Health check |
| `advance-rag/api/datasets.py` | `GET/POST/PUT/DELETE /api/rag/datasets` | Dataset CRUD via `KnowledgebaseService` |
| `advance-rag/api/documents.py` | `GET/POST/DELETE /api/rag/datasets/:id/documents`, `GET .../download`, `POST .../parse` | Document upload (MinIO), parsing trigger, file download |
| `advance-rag/api/models.py` | `GET/POST /api/rag/models/providers`, `GET/POST /api/rag/models/defaults`, `GET /api/rag/models/available` | System-wide model provider management via `TenantLLM` |
| `advance-rag/api/chunks.py` | `POST /api/rag/datasets/:id/search`, `GET /api/rag/datasets/:id/chunks` | Hybrid search (semantic + full-text) + chunk listing |
| `advance-rag/api/sync.py` | `GET/POST /api/rag/sync-configs`, `POST .../trigger`, `GET .../connectors` | External data source sync (S3, Confluence, etc.) |

### Import Compatibility Shim

| File | Purpose |
|---|---|
| `advance-rag/api/db/__init__.py` | Redirects `api.db.*` -> `db.*` imports. RAGFlow code uses `from api.db.services.xxx import Yyy`; this shim makes that work when `db/` is at the project root instead of under `api/`. Also defines enums (`FileType`, `UserTenantRole`, etc.) that RAGFlow originally defined in `api/db/__init__.py`. |

---

## New Features Ported (v0.25.0)

### 1. EPUB Parser Support

- **File:** `deepdoc/parser/epub_parser.py` (new, 145 lines)
- **Registration:** `rag/app/naive.py` -- added `EpubParser` import and `.epub` file extension handler
- **Dependency:** `ebooklib>=0.18` (new)
- **How it works:** Uses ebooklib to extract EPUB chapters, strips HTML tags, splits into token-bounded sections

### 2. Perplexity + MiniMax LLM Providers

- **Source:** `rag/llm/` directory (safe copy) + `conf/llm_factories.json`
- **Details:** New model definitions for Perplexity AI (sonar series) and MiniMax (abab series) added to LLM factory configs
- **Integration:** Comes via the standard `rag/llm/chat_model.py` factory -- no additional b-knowledge changes needed

### 3. PDF Garbled Text OCR Fallback

- **Source:** `deepdoc/` directory (safe copy)
- **Details:** New `_is_garbled_char()` function in `pdf_parser.py` detects Unicode Private Use Area characters and CID-mapped fonts, triggers OCR fallback for garbled PDF pages
- **Impact:** Improved reliability for PDFs with embedded fonts that map to private Unicode ranges

### 4. Deadlock Retry Decorator

- **File:** `advance-rag/db/services/common_service.py` (manual port)
- **Details:** New `retry_deadlock_operation(max_retries=3, retry_delay=0.1)` decorator using exponential backoff for atomic multi-table operations
- **Applied to:** `delete_document_and_update_kb_counts` in `document_service.py` for atomic delete safety

### 5. Aggregated Parsing Status

- **Python:** `advance-rag/db/services/document_service.py` -- new `get_parsing_status_by_kb_ids()` method
- **TypeScript:** `be/src/modules/rag/services/rag.service.ts` -- new `getAggregatedParsingStatus()` method
- **Purpose:** Returns document counts grouped by parsing status (pending, running, done, failed) for dataset overview dashboards

### 6. Chunk Image Support

- **File:** `api/utils/image_utils.py` (new, 40 lines, safe copy)
- **Details:** Base64 encoding/decoding utilities for embedding images in chunk metadata

### 7. Docling Server URL Support

- **Source:** `deepdoc/` directory (safe copy) -- `docling_parser.py` updated
- **Env var:** `DOCLING_SERVER_URL` (optional, added to `advance-rag/.env.example`)
- **Details:** Enables remote Docling deployment instead of requiring local installation

### 8. Cross-KB Collision Guard

- **File:** `advance-rag/rag/svr/task_executor.py` (manual merge)
- **Details:** Builds `doc_name_by_id` lookup in `run_raptor_for_kb` to prevent cross-knowledge-base document name collisions when RAPTOR processes documents from multiple KBs

### 9. Similarity Threshold Bypass

- **TypeScript:** `be/src/modules/rag/services/rag-search.service.ts`
- **Details:** When explicit `doc_ids` are provided in search requests, similarity threshold is set to 0 so those specific documents are always included regardless of relevance score. Applies to both initial search dispatch and post-filter.

### 10. Canvas Version Release Flag

- **TypeScript:** `be/src/modules/agents/services/agent.service.ts`
- **Python:** `advance-rag/db/services/canvas_service.py`, `advance-rag/db/services/user_canvas_version.py` (new)
- **Details:** Canvas versions can be marked as "released" (published). Released versions are protected from overwrite by unreleased saves. Includes `releaseVersion()` and `getReleasedVersion()` methods.

### 11. version_title in Conversations

- **TypeScript:** `be/src/modules/agents/services/agent.service.ts`
- **Details:** `version_title` field added to conversation sessions, allowing conversations to reference the name of the canvas version they were started with

### 12. Delete-all Documents/Sessions

- **TypeScript:** `be/src/modules/rag/services/rag-document.service.ts` -- `deleteAllByDataset()` method
- **TypeScript:** `be/src/modules/chat/services/chat-conversation.service.ts` -- `deleteAllSessions()` method
- **Details:** Bulk deletion endpoints for cleaning up all documents in a dataset or all sessions in a conversation

### 13. Memory user_id Tracking

- **TypeScript:** `be/src/modules/memory/services/memory-message.service.ts`
- **Details:** `user_id` added as optional field to `MemoryMessageDoc` interface for audit trail tracking

### 14. Empty Doc Filter Fix

- **TypeScript:** `be/src/modules/chat/services/chat-conversation.service.ts`
- **Details:** Filters out empty/null chunks in the retrieval pipeline to prevent null reference errors during chat response generation

### 15. Metadata Query Optimization

- **TypeScript:** `be/src/modules/rag/services/rag.service.ts`
- **Details:** Metadata queries scoped to page-level document IDs rather than scanning all documents, improving performance for large datasets

---

## DB Schema Changes

### New Columns

| Table | Column | Type | Default | Nullable | Index |
|---|---|---|---|---|---|
| `user_canvas_version` | `release` | BOOLEAN | `false` | NOT NULL | YES |
| `api_4_conversation` | `version_title` | VARCHAR(255) | -- | YES | NO |

### Knex Migration

- **File:** `be/src/shared/db/migrations/20260323140000_add_ragflow_upstream_columns.ts`
- **Direction:** Both `up()` and `down()` implemented
- **Note:** Peewee model fields (`release` BooleanField, `version_title` CharField) were also added to `advance-rag/db/db_models.py` to keep ORM in sync

### New Peewee Models

Two Peewee models were added to `advance-rag/db/db_models.py` that were missing from b-knowledge:

- **`API4Conversation`** -- Conversation session model with `version_title` field
- **`UserCanvasVersion`** -- Canvas version model with `release` field

---

## Dependency Changes

| Package | Previous | Updated | Reason |
|---|---|---|---|
| `pypdf` | `>=4.0.0` | `>=6.8.0` | Required by upstream PDF improvements |
| `ebooklib` | (not present) | `>=0.18` | Required by new EPUB parser |

No new Node.js/TypeScript dependencies were added.

---

## b-knowledge TypeScript Improvements (Concept Ports)

All improvements were concept-ported from RAGFlow's Python implementation to b-knowledge's TypeScript backend services following existing conventions (JSDoc, inline comments, module boundaries).

| Feature | Target Service | Method Added |
|---|---|---|
| Aggregated parsing status | `rag.service.ts` | `getAggregatedParsingStatus()` |
| Delete-all documents | `rag-document.service.ts` | `deleteAllByDataset()` |
| Similarity threshold bypass | `rag-search.service.ts` | Modified `searchChunks()` |
| Delete-all sessions | `chat-conversation.service.ts` | `deleteAllSessions()` |
| Empty doc filter | `chat-conversation.service.ts` | Filter in retrieval pipeline |
| Canvas version release | `agent.service.ts` | `releaseVersion()`, `getReleasedVersion()` |
| user_id tracking | `memory-message.service.ts` | `user_id` field on `MemoryMessageDoc` |

---

## Protected Files

These files must **NEVER** be overwritten during upstream merges:

```
advance-rag/
  db/                        # 16+ custom service files (b-knowledge integration layer)
  db/services/               # All service files with b-knowledge-specific logic
  memory/                    # b-knowledge memory feature (Node.js-managed)
  config.py                  # Environment-variable-driven config
  executor_wrapper.py        # Redis pub/sub progress hook
  system_tenant.py           # System tenant verification
  api/main.py                # FastAPI entry point
  api/health.py              # Health check
  api/datasets.py            # Dataset CRUD endpoints
  api/documents.py           # Document endpoints
  api/models.py              # Model provider endpoints
  api/chunks.py              # Search/chunk endpoints
  api/sync.py                # Sync config endpoints
  api/db/__init__.py         # Import shim (api.db.* -> db.*)
  pyproject.toml             # Custom dependencies
```

---

## Known Limitations

1. **No per-user tenancy** -- All data lives under one system tenant. Multi-tenancy is handled at the Node.js IAM layer (`access_control` JSONB).
2. **GraphRAG / RAPTOR / Advanced RAG** -- Code is copied but not activated via UI. Parser types `naive`, `book`, `paper`, `table`, `qa`, `laws`, `manual`, `presentation`, `picture`, `one`, `audio`, `email` are enabled.
3. **OAuth / SMTP** -- RAGFlow's built-in OAuth and email features are not used; Node.js handles auth.
4. **Agent / Canvas** -- RAGFlow's agent system (`agent/`) is not copied. b-knowledge has its own agent implementation in `be/src/modules/agents/`.
5. **PDF chunk highlighting** -- The current FE document previewer uses iframe-based PDF rendering. RAGFlow's `react-pdf-highlighter` based chunk highlighting is not yet ported.
6. **Search** -- Semantic search requires a configured embedding model in `TenantLLM`. Falls back to full-text only if no embedding model is set.
7. **EPUB parser** -- Code is copied and registered in `naive.py`, but requires `ebooklib>=0.18` to be installed in the Python environment.
8. **Infinity connector refactors** -- ~1,585 lines of Infinity connector changes came with the upstream copy but are irrelevant since b-knowledge uses OpenSearch.
9. **Canvas version release/version_title** -- Service-layer methods are implemented but HTTP endpoints are not yet exposed. Future phase will add routes.

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
cp -r ragflow/conf/ advance-rag/conf/

# 4. RESTORE b-knowledge customizations (backup before copy or git restore)
#    - advance-rag/rag/utils/opensearch_conn.py  (b-knowledge OpenSearch connector)
#    - advance-rag/api/db/__init__.py             (import shim)
#    DO NOT overwrite these b-knowledge-only files:
#    - advance-rag/api/main.py, health.py, datasets.py, documents.py, models.py, chunks.py, sync.py
#    - advance-rag/config.py, system_tenant.py, executor_wrapper.py
#    - advance-rag/pyproject.toml

# 5. Check for new enums in ragflow/api/db/__init__.py
#    Update advance-rag/api/db/__init__.py shim if new enums were added

# 6. Check for new dependencies in ragflow/pyproject.toml
#    Update advance-rag/pyproject.toml accordingly

# 7. Translate imports in manually-merged files
#    All "from api.db.services.*" -> "from db.services.*"
#    All "from api.db.db_models" -> "from db.db_models"

# 8. Check for new DB columns in ragflow/api/db/db_models.py
#    Create Knex migration for any new columns
#    Add Peewee model fields to advance-rag/db/db_models.py

# 9. Port relevant improvements to TypeScript backend services
#    Check upstream Python service changes for features worth concept-porting

# 10. Test
cd advance-rag && DB_TYPE=postgres python -m uvicorn api.main:app --reload
npm run build && npm test

# 11. Create patch note for the new version
cp patches/ragflow-port-v0.25.0-df2cc32.md patches/ragflow-port-v<NEW_VERSION>-<NEW_HASH>.md
```

### Lessons Learned from v0.25.0 Port

1. **Backup opensearch_conn.py before copying rag/utils/** -- it has b-knowledge-specific customizations
2. **Check for missing Peewee model definitions** -- b-knowledge may not have all models that upstream services reference (e.g., `API4Conversation`, `UserCanvasVersion` were missing)
3. **Docx get_picture methods removed upstream** -- `DocxParser` parent class now provides this via `LazyDocxImage`, so parser subclasses (naive.py, manual.py, qa.py) no longer need their own implementations
4. **Skip sync_data_source.py** -- b-knowledge does not include RAGFlow's data source connector system
5. **Skip handle_save_to_memory_task** -- b-knowledge handles memory through its Node.js backend module

---

## File Counts

| Directory | Files | Source |
|---|---|---|
| `advance-rag/rag/` | ~120 | Copied from ragflow/rag/ |
| `advance-rag/deepdoc/` | ~40 | Copied from ragflow/deepdoc/ |
| `advance-rag/common/` | ~30 | Copied from ragflow/common/ |
| `advance-rag/db/` | ~30 | Copied from ragflow/api/db/ (protected: manual updates only) |
| `advance-rag/memory/` | ~5 | Copied from ragflow/memory/ |
| `advance-rag/conf/` | ~5 | Copied from ragflow/conf/ |
| `advance-rag/api/` | 10 | **NEW** (b-knowledge integration) |
| `advance-rag/*.py` | 4 | **NEW** (config, system_tenant, executor_wrapper, __init__) |
| **Total** | ~300 | ~285 upstream + ~15 new |

---

## Commit History

| Commit | Description | Wave |
|---|---|---|
| `7038384` | Safe overwrite of 9 pure RAGFlow directories (263 files) | 1 |
| `0369c79` | Merge rag/app/ files (EPUB support, import translation) | 2 |
| `c18c34f` | Merge rag/svr/ and rag/graphrag/ files (collision guard, response normalization) | 2 |
| `8c7ad1c` | Update Python deps, Peewee models, Knex migration | 3 |
| `6acbade` | Port upstream improvements to db/services/ (deadlock retry, parsing status, canvas versioning) | 3 |
| `be7f7d8` | Port dataset and search improvements to RAG services | 4 |
| `5671ee3` | Port chat, agent, and memory improvements | 4 |
| `1824ca3` | Fix pre-existing roleHierarchy type error in guideline components | 5 |
