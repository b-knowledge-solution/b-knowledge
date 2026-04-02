---
created: 2026-03-23T10:33:31.359Z
title: Merge latest RAGFlow upstream to b-knowledge
area: rag
files:
  - advance-rag/rag/
  - advance-rag/deepdoc/
  - advance-rag/common/
  - advance-rag/db/
  - advance-rag/memory/
  - advance-rag/api/utils/
  - advance-rag/api/db/__init__.py
  - be/src/modules/rag/
  - fe/src/features/datasets/
  - fe/src/features/chat/
  - fe/src/features/search/
  - patches/ragflow-port-v0.24.0-c732a1c.md
---

## Problem

Need to merge the latest RAGFlow source code (from the local `ragflow/` folder in the workspace, NOT from git) into b-knowledge's current codebase. The last upstream sync was at commit `c732a1c8e03aef804ce00c9c8fa5e4b39393e3eb` (RAGFlow v0.24.0), documented in `patches/ragflow-port-v0.24.0-c732a1c.md`.

This affects multiple b-knowledge features:
- **advance-rag** — Core RAG pipeline (parsers, deepdoc, common, db services, memory)
- **dataset** — Dataset CRUD, document management, chunking
- **chat** — Chat assistant features that use RAG retrieval
- **search** — Search app features that use RAG retrieval

## Solution

### Detailed Migration Plan

#### Phase 1: Upstream Diff Analysis
1. Identify the current RAGFlow version in the local `ragflow/` folder (check `ragflow/pyproject.toml` or git log)
2. Generate a diff between the old upstream (`c732a1c`) and the new HEAD to understand all changes
3. Categorize changes by area: rag/, deepdoc/, common/, api/db/, memory/, api/utils/

#### Phase 2: Copy Upstream Source (No-Patch Directories)
Per the established upgrade workflow in the patch doc:
1. `cp -r ragflow/rag/ advance-rag/rag/` — RAG pipeline
2. `cp -r ragflow/deepdoc/ advance-rag/deepdoc/` — Document parsing, OCR, layout
3. `cp -r ragflow/common/ advance-rag/common/` — Utilities, settings, constants
4. `cp -r ragflow/api/db/ advance-rag/db/` — Peewee models + service files
5. `cp -r ragflow/memory/ advance-rag/memory/` — Agent memory service
6. `cp -r ragflow/api/utils/*.py advance-rag/api/utils/` — API utility functions

**DO NOT overwrite b-knowledge integration files:**
- `advance-rag/api/db/__init__.py` (import shim)
- `advance-rag/api/main.py` (FastAPI entry)
- `advance-rag/api/datasets.py`, `documents.py`, `models.py`, `chunks.py`, `sync.py`
- `advance-rag/config.py`, `system_tenant.py`, `executor_wrapper.py`

#### Phase 3: Integration Layer Updates
1. Check for new enums in `ragflow/api/db/__init__.py` → update import shim
2. Check for new dependencies in `ragflow/pyproject.toml` → update `advance-rag/pyproject.toml`
3. Check for new service files in `ragflow/api/db/services/` → may need new FastAPI endpoints
4. Check for new parser types in `ragflow/rag/` → may need UI support
5. Check for schema changes in `ragflow/api/db/db_models.py` → create Knex migrations

#### Phase 4: Feature-Specific Migration Assessment
For each feature (dataset, chat, search), check:
1. **New RAGFlow API endpoints** that b-knowledge doesn't expose yet
2. **Changed service interfaces** that break existing FastAPI wrappers
3. **New configuration options** that need env vars or UI
4. **New model provider support** in TenantLLM
5. **New parser/chunking methods** that need frontend forms

#### Phase 5: Backend (be/) Updates
1. Update `be/src/modules/rag/` proxy endpoints if advance-rag APIs changed
2. Add new Knex migrations for any Peewee schema changes
3. Update TypeScript types to match new advance-rag response shapes

#### Phase 6: Frontend (fe/) Updates
1. Update dataset feature for new parser types or config options
2. Update chat feature for any new RAG retrieval capabilities
3. Update search feature for new search modes or ranking options
4. Add i18n strings for new features (en, vi, ja)

#### Phase 7: Testing & Validation
1. Start advance-rag service and verify health endpoint
2. Test document upload + parsing pipeline
3. Test search/retrieval with new changes
4. Test chat integration
5. Run existing test suites
6. Create new patch doc: `patches/ragflow-port-v<NEW_VERSION>-<NEW_HASH>.md`
