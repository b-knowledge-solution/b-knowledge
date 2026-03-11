# Projects & Datasets Refactor - Design Specification

## Overview

Refactor Projects (multi-category: office, datasync, source_code) and Datasets (migrate RAGFlow settings) features.

---

## A. PROJECTS REFACTOR

### Categories
- **office**: Office docs (Word, Excel, PPT) with versioning
- **datasync**: External sources (SharePoint, JIRA, Confluence, GitLab, GitHub)
- **source_code**: Reserved for future (disabled in UI)

### Auto-Create Dataset
- On project create → auto-generate dataset: `{project_name}_{timestamp}`
- Dataset owned by project (cascade delete for auto_created=true)
- Dataset inherits project settings (parser, embedding model, language)

### New DB Tables (migration: `20260311140000_project_datasets_and_sync.ts`)

```sql
-- project_datasets: junction linking projects to datasets
project_datasets (
  id TEXT PK DEFAULT gen_random_uuid(),
  project_id TEXT FK -> projects.id ON DELETE CASCADE,
  dataset_id UUID FK -> datasets.id ON DELETE CASCADE,
  auto_created BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, dataset_id)
)

-- project_sync_configs: external data source sync
project_sync_configs (
  id TEXT PK DEFAULT gen_random_uuid(),
  project_id TEXT FK -> projects.id ON DELETE CASCADE,
  source_type TEXT CHECK IN ('sharepoint','jira','confluence','gitlab','github'),
  connection_config TEXT (encrypted),
  sync_schedule TEXT,
  filter_rules JSONB DEFAULT '{}',
  last_synced_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_by TEXT, updated_by TEXT,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
```

### BE Module: `be/src/modules/projects/`

```
modules/projects/
├── routes/projects.routes.ts
├── controllers/projects.controller.ts
├── services/
│   ├── projects.service.ts           # Core CRUD + auto-create dataset
│   ├── project-category.service.ts   # Category + version management
│   ├── project-chat.service.ts
│   ├── project-search.service.ts
│   └── project-sync.service.ts       # Sync config management
├── models/
│   ├── project.model.ts
│   ├── project-permission.model.ts
│   ├── project-dataset.model.ts
│   ├── project-sync-config.model.ts
│   ├── document-category.model.ts
│   ├── document-category-version.model.ts
│   ├── document-category-version-file.model.ts
│   ├── project-chat.model.ts
│   ├── project-search.model.ts
│   └── project-entity-permission.model.ts
├── schemas/projects.schemas.ts
└── index.ts
```

### API Endpoints

```
Projects CRUD:
  GET    /api/projects
  POST   /api/projects              (+ auto-create dataset)
  GET    /api/projects/:id
  PUT    /api/projects/:id
  DELETE /api/projects/:id          (cascade auto_created datasets)

Permissions:
  GET    /api/projects/:id/permissions
  POST   /api/projects/:id/permissions
  DELETE /api/projects/:id/permissions/:permId

Project Datasets:
  GET    /api/projects/:id/datasets
  POST   /api/projects/:id/datasets (link or create new)
  DELETE /api/projects/:id/datasets/:datasetId

Categories & Versions:
  GET/POST/PUT/DELETE /api/projects/:id/categories[/:catId]
  GET/POST/PUT/DELETE /api/projects/:id/categories/:catId/versions[/:verId]
  POST   .../versions/:verId/documents (multipart)
  POST   .../versions/:verId/documents/parse
  POST   .../versions/:verId/documents/convert

Chat & Search:
  GET/POST/PUT/DELETE /api/projects/:id/chats[/:chatId]
  GET/POST/PUT/DELETE /api/projects/:id/searches[/:searchId]

Sync Configs (datasync only):
  GET    /api/projects/:id/sync-configs
  POST   /api/projects/:id/sync-configs
  PUT    /api/projects/:id/sync-configs/:configId
  DELETE /api/projects/:id/sync-configs/:configId

Entity Permissions:
  GET/POST/DELETE /api/projects/:id/entity-permissions[/:permId]
```

### Permission Model

| Role    | Create Projects | Manage Own | View Team Projects |
|---------|----------------|------------|-------------------|
| admin   | Yes            | All        | All               |
| leader  | Yes            | If granted | If team has perm  |
| member  | No             | No         | If team has perm  |

---

## B. DATASETS REFACTOR (RAGFlow Settings Migration)

### New Endpoints on RAG Module

```
Dataset Settings:
  GET    /api/rag/datasets/:id/settings
  PUT    /api/rag/datasets/:id/settings

Chunk Management:
  GET    /api/rag/datasets/:id/chunks?page=&limit=&search=&doc_id=
  POST   /api/rag/datasets/:id/chunks         (add manual chunk)
  PUT    /api/rag/datasets/:id/chunks/:chunkId (edit chunk)
  DELETE /api/rag/datasets/:id/chunks/:chunkId

Retrieval Test:
  POST   /api/rag/datasets/:id/retrieval-test
```

### Features to Migrate from RAGFlow

| Feature | Status |
|---------|--------|
| General settings (name, desc, language, embedding, permission) | Already implemented |
| Chunking method selector (14 types) + per-method config | Already implemented (BE), need Settings UI |
| GraphRAG & RAPTOR config | Already implemented (BE), need Settings UI |
| Retrieval testing | Already implemented (BE), need dedicated UI |
| Chunk view/edit/delete/add | Needs full implementation |
| Data source connectors | Handled via project sync configs |
| Custom metadata management | Planned (not in this phase) |
| Knowledge graph visualization | Not in scope |

---

## C. UI/UX DESIGN

### 1. Project List Page
- Category filter tabs: All | Office | DataSync | Source Code (disabled)
- Cards show: name, category badge, dataset count, last updated
- Create button → multi-step modal

### 2. Create Project Modal (3 steps)
- Step 1: Select category (office/datasync/source_code)
- Step 2: Project details + auto-dataset name preview
- Step 3 (datasync only): Sync source configuration

### 3. Project Detail Page
- Tabs: Documents | Chat | Search | Settings | Sync (datasync only)
- Settings tab extended with dataset settings section
- Sync tab: connector config, schedule, status, manual trigger

### 4. Dataset Settings Drawer (NEW)
- Accessible from DatasetDetailPage header (gear icon)
- Sheet/drawer from right (70vw)
- Tabs: General | Chunking | Advanced | Retrieval Test
- General: name, desc, language, permission, embedding model
- Chunking: method selector + dynamic config fields per method
- Advanced: GraphRAG toggle, RAPTOR config, auto_keywords/questions sliders
- Retrieval Test: query input, method selector, results panel

### 5. Chunk Management (NEW)
- Table: content preview, source doc, token count
- Search/filter, pagination
- Inline edit, delete, add manual chunk

### 6. Sync Config Panel (datasync projects)
- Source selector with icons (SharePoint/JIRA/Confluence/GitLab/GitHub)
- Dynamic connection fields per source type
- Schedule config (preset or cron)
- Filter rules (file types, date range, labels)
- Test connection, sync status, manual trigger

### Navigation
- No sidebar changes needed
- Route config additions: `/datasets/:id/settings`, `/datasets/:id/chunks`

---

## D. IMPLEMENTATION PHASES

1. DB Migration (new tables)
2. BE Models (10 model files)
3. BE Types (shared/models/types.ts)
4. BE Schemas (Zod validation)
5. BE Services (5 project services + RAG settings/chunks extensions)
6. BE Controller + Routes
7. BE Route Registration
8. FE Types + API layer
9. FE Components (project category, dataset settings, chunks, sync)
10. FE Pages (update project list/detail, add dataset settings)
11. i18n (en/vi/ja)
12. Tests (unit + integration + e2e)
