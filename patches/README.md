# RAGFlow Patch Tracking

This directory tracks modifications made to RAGFlow source code for b-knowledge integration.

## Strategy: Copy ALL, Enable Incrementally

All RAGFlow source directories are copied **unmodified** into `advance-rag/`:
- `ragflow/rag/` → `advance-rag/rag/` (all parsers, LLM wrappers, GraphRAG, etc.)
- `ragflow/deepdoc/` → `advance-rag/deepdoc/` (all document parsers, OCR, layout)
- `ragflow/common/` → `advance-rag/common/` (utilities, settings, constants)
- `ragflow/api/db/` → `advance-rag/db/` (Peewee models, services)
- `ragflow/memory/` → `advance-rag/memory/` (agent memory service)

## Key Discovery: No Source Patches Needed (Phase 1)

RAGFlow **already supports PostgreSQL natively**:
- `db_models.py` has `PooledDatabase.POSTGRES = RetryingPooledPostgresqlDatabase`
- `DATABASE_TYPE` is controlled by `DB_TYPE` env var (default: "mysql", set to "postgres")
- `TextFieldType.POSTGRES = "TEXT"` already handles LONGTEXT → TEXT
- `DatabaseLock.POSTGRES` and `DatabaseMigrator.POSTGRES` already exist

**No modifications to ragflow source files are required.**

## b-knowledge Additions (not patches)

These files are NEW, added alongside unmodified ragflow source:

| File | Purpose |
|---|---|
| `advance-rag/config.py` | Environment-based configuration |
| `advance-rag/system_tenant.py` | Single system tenant initialization |
| `advance-rag/executor_wrapper.py` | Redis pub/sub progress hook for task executor |
| `advance-rag/api/main.py` | FastAPI entry point |
| `advance-rag/api/health.py` | Health check endpoint |
| `advance-rag/api/datasets.py` | Dataset CRUD endpoints |
| `advance-rag/api/documents.py` | Document upload/parse endpoints |
| `advance-rag/api/db/__init__.py` | Import shim: redirects `api.db.*` → `db.*` |
| `advance-rag/api/utils/*` | Copied from ragflow/api/utils/ (needed by db_models.py) |
| `advance-rag/conf/service_conf.yaml` | Service configuration for config_utils.py |
| `advance-rag/pyproject.toml` | Python package definition |
| `advance-rag/Dockerfile` | Container image |

## Upgrade Workflow

When RAGFlow releases a new version:

```bash
# 1. Update ragflow/ reference
cd ragflow && git pull origin main

# 2. Re-copy source directories (overwrite)
cp -r ragflow/rag/ advance-rag/rag/
cp -r ragflow/deepdoc/ advance-rag/deepdoc/
cp -r ragflow/common/ advance-rag/common/
cp -r ragflow/api/db/ advance-rag/db/
cp -r ragflow/memory/ advance-rag/memory/
cp ragflow/api/utils/*.py advance-rag/api/utils/

# 3. Re-copy api/db/__init__.py (ragflow's version, not our shim)
# IMPORTANT: Do NOT overwrite advance-rag/api/db/__init__.py — that's our shim.
# The original ragflow/api/db/__init__.py enums are duplicated in our shim.
# Check if new enums were added and update the shim accordingly.

# 4. Test
DB_TYPE=postgres python -m uvicorn api.main:app

# 5. If ragflow introduces breaking changes, create a patch:
diff -ruN ragflow/path/to/file.py advance-rag/path/to/file.py > patches/NNN-description.patch
```

## Future Patches (if needed)

If we need to modify ragflow source files in the future:

```bash
# Generate patch
diff -ruN ragflow/rag/svr/task_executor.py advance-rag/rag/svr/task_executor.py > patches/001-task-executor-changes.patch

# Apply patch to fresh ragflow code
cd advance-rag && patch -p1 < ../patches/001-task-executor-changes.patch
```

Naming convention: `NNN-short-description.patch`
