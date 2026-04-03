---
phase: 08-frontend-rename
plan: 01
subsystem: ui
tags: [react, typescript, tanstack-query, rename, knowledge-base, routing]

# Dependency graph
requires:
  - phase: 07-db-be-python-rename
    provides: Backend API routes renamed from /api/projects to /api/knowledge-base
provides:
  - Renamed FE feature directory from projects/ to knowledge-base/
  - All Project-prefixed files, types, functions renamed to KnowledgeBase
  - API endpoints calling /api/knowledge-base/ instead of /api/projects/
  - Centralized query keys using knowledgeBase namespace
  - Routes serving at /data-studio/knowledge-base/:knowledgeBaseId
  - Sidebar nav pointing to /data-studio/knowledge-base
affects: [08-frontend-rename, fe-i18n-rename, cross-feature-references]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "KnowledgeBase naming convention across FE feature module"
    - "Centralized queryKeys factory with full key coverage for knowledge-base domain"

key-files:
  created: []
  modified:
    - fe/src/features/knowledge-base/api/knowledgeBaseApi.ts
    - fe/src/features/knowledge-base/api/knowledgeBaseQueries.ts
    - fe/src/features/knowledge-base/types/knowledge-base.types.ts
    - fe/src/features/knowledge-base/index.ts
    - fe/src/features/knowledge-base/pages/KnowledgeBaseListPage.tsx
    - fe/src/features/knowledge-base/pages/KnowledgeBaseDetailPage.tsx
    - fe/src/lib/queryKeys.ts
    - fe/src/app/App.tsx
    - fe/src/app/routeConfig.ts
    - fe/src/layouts/sidebarNav.ts

key-decisions:
  - "Used projectId key in JobListFilter objects since the system module's interface hasn't been renamed yet"
  - "Deleted CategoryFilterTabs.tsx as dead code per Phase 3 D-03-03"
  - "Fixed queryKeys.projects references in chat and search features to prevent build breakage"

patterns-established:
  - "KnowledgeBase prefix for all domain types, API functions, and components in the feature"
  - "queryKeys.knowledgeBase factory with list/detail/categories/versions/documents/chats/searches/permissions/members/datasets/activity/syncConfigs keys"

requirements-completed: [REN-04]

# Metrics
duration: 17min
completed: 2026-04-02
---

# Phase 08 Plan 01: Frontend Feature Rename Summary

**Renamed projects/ feature directory to knowledge-base/ with all 47 files, types, API layer, query keys, routes, and navigation updated to KnowledgeBase naming**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-02T09:22:40Z
- **Completed:** 2026-04-02T09:39:40Z
- **Tasks:** 2
- **Files modified:** 51

## Accomplishments
- Renamed entire fe/src/features/projects/ directory to fe/src/features/knowledge-base/ with all 47 files
- Renamed all Project-prefixed types (Project, ProjectChat, ProjectSearch, etc.) to KnowledgeBase-prefixed
- Updated all API endpoints from /api/projects/ to /api/knowledge-base/ including ragflowApi.ts
- Expanded centralized queryKeys factory from 3 keys to 13 keys covering all knowledge-base domain queries
- Updated App.tsx routes, routeConfig.ts, and sidebarNav.ts for /data-studio/knowledge-base paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Rename feature directory and files, update types and API layer** - `3b5aca4` (feat)
2. **Task 2: Update routes, navigation, and App.tsx integration** - `302e0e7` (feat)

## Files Created/Modified
- `fe/src/features/knowledge-base/` - Entire feature directory (47 files, renamed from projects/)
- `fe/src/features/knowledge-base/api/knowledgeBaseApi.ts` - All types and API functions renamed
- `fe/src/features/knowledge-base/api/knowledgeBaseQueries.ts` - All hooks renamed with centralized query keys
- `fe/src/features/knowledge-base/api/ragflowApi.ts` - Endpoints updated to /api/knowledge-base/
- `fe/src/features/knowledge-base/types/knowledge-base.types.ts` - Type barrel re-exports updated
- `fe/src/features/knowledge-base/index.ts` - Barrel exports with new names
- `fe/src/lib/queryKeys.ts` - Expanded knowledgeBase query key factory
- `fe/src/app/App.tsx` - Lazy imports and route paths updated
- `fe/src/app/routeConfig.ts` - Route metadata with knowledgeBase.title
- `fe/src/layouts/sidebarNav.ts` - Sidebar nav path and label updated
- `fe/src/components/NavigationLoader.tsx` - Example paths in JSDoc updated
- `fe/src/features/search/pages/SearchAppManagementPage.tsx` - queryKeys.projects -> knowledgeBase
- `fe/src/features/chat/pages/ChatAssistantManagementPage.tsx` - queryKeys.projects -> knowledgeBase

## Decisions Made
- Used `projectId` key when constructing `JobListFilter` objects passed to the system module's `getConverterJobs` since the `JobListFilter` interface in `fe/src/features/system/` hasn't been renamed yet (out of scope for this plan)
- Deleted `CategoryFilterTabs.tsx` as confirmed dead code per Phase 3 decision D-03-03
- Fixed `queryKeys.projects` references in chat and search feature modules to prevent build breakage from the queryKeys rename

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed queryKeys.projects references in chat and search features**
- **Found during:** Task 2 (build verification)
- **Issue:** `ChatAssistantManagementPage.tsx` and `SearchAppManagementPage.tsx` referenced `queryKeys.projects.all` which no longer exists after the queryKeys rename
- **Fix:** Updated both files to use `queryKeys.knowledgeBase.all` and `/api/knowledge-base` endpoint
- **Files modified:** fe/src/features/chat/pages/ChatAssistantManagementPage.tsx, fe/src/features/search/pages/SearchAppManagementPage.tsx
- **Committed in:** 302e0e7 (Task 2 commit)

**2. [Rule 3 - Blocking] Fixed JobListFilter compatibility in knowledge-base components**
- **Found during:** Task 2 (build verification)
- **Issue:** Components passed `knowledgeBaseId` property to `getConverterJobs()` but `JobListFilter` interface expects `projectId`
- **Fix:** Used `projectId: knowledgeBaseId` syntax in filter objects to match the system module's interface
- **Files modified:** ConversionStatusModal.tsx, DocumentsTab.tsx, DocumentsTabRedesigned.tsx, JobManagementModal.tsx, JobManagementPanel.tsx
- **Committed in:** 302e0e7 (Task 2 commit)

**3. [Rule 3 - Blocking] Fixed remaining type name references missed by initial rename**
- **Found during:** Task 2 (build verification)
- **Issue:** Several components still used old type names (ProjectChat, ProjectSearch, ProjectPermission, etc.) in variable declarations and type annotations
- **Fix:** Applied regex-based replacement for all remaining old type names across 9 component files
- **Files modified:** ChatTab.tsx, SearchTab.tsx, SettingsTab.tsx, EntityPermissionModal.tsx, SyncConfigPanel.tsx, SyncStatusPanel.tsx, SyncTab.tsx, ChatModal.tsx, SearchModal.tsx
- **Committed in:** 302e0e7 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All auto-fixes necessary for build correctness. No scope creep.

## Known Stubs

None - all data sources are wired and functional.

## Issues Encountered
- Pre-existing TypeScript errors in unrelated features (ProviderFormDialog.tsx, ChatMessageList.tsx, UploadFilesModal.tsx) prevent clean `npm run build -w fe`. These errors exist on the branch prior to this plan and are out of scope.
- The `JobListFilter` interface in `fe/src/features/system/api/converterApi.ts` still uses `projectId` property name. This will be addressed in plan 08-02 or 08-03 when cross-feature references are updated.
- The `fe/src/features/system/api/converterApi.ts` line 266 still has `/api/projects/` endpoint URL. Out of scope (different feature module).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Feature directory and all internal references fully renamed
- Cross-feature references in chat and search features updated
- Ready for Plan 02 (i18n key rename) and Plan 03 (remaining cross-feature cleanup)
- Pre-existing build errors should be fixed independently

---
*Phase: 08-frontend-rename*
*Completed: 2026-04-02*

## Self-Check: PASSED
- All key files verified present
- Both task commits verified in git log
