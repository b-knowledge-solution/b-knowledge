---
phase: 07-db-be-python-rename
plan: 02
subsystem: api
tags: [express, typescript, knex, casl, module-rename]

requires:
  - phase: 07-01
    provides: "DB migration renaming project tables to knowledge_base tables"
provides:
  - "Complete be/src/modules/knowledge-base/ directory with 19 renamed files"
  - "All model classes referencing knowledge_base* table names"
  - "All CASL subjects updated to 'KnowledgeBase'"
  - "Barrel exports with knowledgeBase* naming"
affects: [07-03, 08-fe-rename]

tech-stack:
  added: []
  patterns: ["Module directory rename with content-level class/table/column renames"]

key-files:
  created:
    - be/src/modules/knowledge-base/index.ts
    - be/src/modules/knowledge-base/models/knowledge-base.model.ts
    - be/src/modules/knowledge-base/models/knowledge-base-permission.model.ts
    - be/src/modules/knowledge-base/models/knowledge-base-entity-permission.model.ts
    - be/src/modules/knowledge-base/models/knowledge-base-dataset.model.ts
    - be/src/modules/knowledge-base/models/knowledge-base-chat.model.ts
    - be/src/modules/knowledge-base/models/knowledge-base-search.model.ts
    - be/src/modules/knowledge-base/models/knowledge-base-sync-config.model.ts
    - be/src/modules/knowledge-base/models/document-category.model.ts
    - be/src/modules/knowledge-base/models/document-category-version.model.ts
    - be/src/modules/knowledge-base/models/document-category-version-file.model.ts
    - be/src/modules/knowledge-base/services/knowledge-base.service.ts
    - be/src/modules/knowledge-base/services/knowledge-base-category.service.ts
    - be/src/modules/knowledge-base/services/knowledge-base-chat.service.ts
    - be/src/modules/knowledge-base/services/knowledge-base-search.service.ts
    - be/src/modules/knowledge-base/services/knowledge-base-sync.service.ts
    - be/src/modules/knowledge-base/controllers/knowledge-base.controller.ts
    - be/src/modules/knowledge-base/routes/knowledge-base.routes.ts
    - be/src/modules/knowledge-base/schemas/knowledge-base.schemas.ts
  modified: []

key-decisions:
  - "Renamed document-category model method from findByProjectId to findByKnowledgeBaseId for consistency"
  - "Updated all raw SQL table references (knowledge_base_permissions, knowledge_base_datasets) in service JOIN queries"

patterns-established:
  - "KnowledgeBase as CASL subject string for all route ability checks"
  - "knowledge_base_id as FK column name in all junction tables"

requirements-completed: [REN-03]

duration: 12min
completed: 2026-04-02
---

# Phase 7 Plan 2: BE Module Rename (projects/ to knowledge-base/) Summary

**Complete rename of be/src/modules/projects/ to knowledge-base/ with all 19 files, class names, table references, CASL subjects, and barrel exports updated to KnowledgeBase naming**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-02T08:16:34Z
- **Completed:** 2026-04-02T08:28:46Z
- **Tasks:** 1
- **Files modified:** 27 (19 created in knowledge-base/, 19 deleted from projects/, some detected as renames)

## Accomplishments
- Moved all 19 files from projects/ to knowledge-base/ with renamed filenames
- Updated all 7 model classes to reference knowledge_base* table names (knowledge_base, knowledge_base_permissions, etc.)
- Renamed all class names from Project* to KnowledgeBase* (ProjectModel -> KnowledgeBaseModel, etc.)
- Updated all 46 CASL subject references from 'Project' to 'KnowledgeBase' in route definitions
- Renamed all singleton exports (projectsService -> knowledgeBaseService, etc.)
- Updated all internal relative imports to new file paths
- Renamed all Zod schema names (createProjectSchema -> createKnowledgeBaseSchema, etc.)
- Updated all project_id column references to knowledge_base_id
- Deleted old projects/ directory completely

## Task Commits

Each task was committed atomically:

1. **Task 1: Move and rename module directory with all file renames and content updates** - `ba2c96c` (feat)

## Files Created/Modified
- `be/src/modules/knowledge-base/index.ts` - Barrel export with knowledgeBase* naming
- `be/src/modules/knowledge-base/models/knowledge-base.model.ts` - Main KnowledgeBase model (tableName='knowledge_base')
- `be/src/modules/knowledge-base/models/knowledge-base-permission.model.ts` - KnowledgeBasePermission model
- `be/src/modules/knowledge-base/models/knowledge-base-entity-permission.model.ts` - KnowledgeBaseEntityPermission model
- `be/src/modules/knowledge-base/models/knowledge-base-dataset.model.ts` - KnowledgeBaseDataset model
- `be/src/modules/knowledge-base/models/knowledge-base-chat.model.ts` - KnowledgeBaseChat model
- `be/src/modules/knowledge-base/models/knowledge-base-search.model.ts` - KnowledgeBaseSearch model
- `be/src/modules/knowledge-base/models/knowledge-base-sync-config.model.ts` - KnowledgeBaseSyncConfig model
- `be/src/modules/knowledge-base/models/document-category.model.ts` - DocumentCategory with knowledge_base_id FK
- `be/src/modules/knowledge-base/models/document-category-version.model.ts` - Unchanged structure
- `be/src/modules/knowledge-base/models/document-category-version-file.model.ts` - Unchanged structure
- `be/src/modules/knowledge-base/services/knowledge-base.service.ts` - Core KnowledgeBaseService with RBAC
- `be/src/modules/knowledge-base/services/knowledge-base-category.service.ts` - Category/version management
- `be/src/modules/knowledge-base/services/knowledge-base-chat.service.ts` - Chat assistant CRUD
- `be/src/modules/knowledge-base/services/knowledge-base-search.service.ts` - Search app CRUD
- `be/src/modules/knowledge-base/services/knowledge-base-sync.service.ts` - Sync config CRUD
- `be/src/modules/knowledge-base/controllers/knowledge-base.controller.ts` - All HTTP handlers
- `be/src/modules/knowledge-base/routes/knowledge-base.routes.ts` - Route definitions with KnowledgeBase CASL
- `be/src/modules/knowledge-base/schemas/knowledge-base.schemas.ts` - Zod validation schemas

## Decisions Made
- Renamed document-category model method from findByProjectId to findByKnowledgeBaseId for full consistency
- Updated all raw SQL table references in service JOIN queries (knowledge_base_permissions, knowledge_base_datasets)
- Kept ragflow_dataset_id/ragflow_dataset_name column names unchanged (these reference the RAG system, not the project rename)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None - all changes are complete renames with no placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Module directory fully renamed, ready for Plan 03 (shared code updates: types.ts, factory.js, routes.ts consumers)
- External imports from other modules still reference old `@/modules/projects/` paths -- Plan 03 will update those
- CASL ability definitions need updating in Plan 03 (shared/middleware/auth.middleware.ts)

---
*Phase: 07-db-be-python-rename*
*Completed: 2026-04-02*
