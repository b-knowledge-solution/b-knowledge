---
phase: 03-document-management
plan: 02
subsystem: ui
tags: [react, typescript, shadcn, tanstack-query, i18n, versioning]

# Dependency graph
requires:
  - phase: 03-document-management/03-01
    provides: Dataset versioning migration, service, API endpoints
provides:
  - UploadNewVersionDialog component for version uploads
  - VersionBadge component for version indicators
  - FE Dataset type with version fields
  - createDatasetVersion API function and mutation hook
  - Version metadata display in DatasetCard and DatasetOverviewTab
affects: [03-document-management, datasets-feature]

# Tech tracking
tech-stack:
  added: [dropdown-menu (shadcn)]
  patterns: [kebab-menu-actions, version-badge-pattern]

key-files:
  created:
    - fe/src/features/datasets/components/UploadNewVersionDialog.tsx
    - fe/src/features/datasets/components/VersionBadge.tsx
    - fe/src/components/ui/dropdown-menu.tsx
  modified:
    - fe/src/features/datasets/types/index.ts
    - fe/src/features/datasets/api/datasetApi.ts
    - fe/src/features/datasets/api/datasetQueries.ts
    - fe/src/features/datasets/components/DocumentTable.tsx
    - fe/src/features/datasets/components/DatasetCard.tsx
    - fe/src/features/datasets/components/DatasetOverviewTab.tsx
    - fe/src/features/datasets/pages/DatasetDetailPage.tsx
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "exactOptionalPropertyTypes: build explicit payload object to avoid undefined assignment to optional string"
  - "Kebab dropdown menu added to DocumentTable actions for extensible per-row actions"

patterns-established:
  - "DropdownMenu kebab pattern: MoreHorizontal icon trigger with DropdownMenuContent for row-level actions"
  - "VersionBadge null-safe pattern: returns null for non-version datasets"

requirements-completed: [DOCM-01, DOCM-03]

# Metrics
duration: 12min
completed: 2026-03-19
---

# Phase 3 Plan 02: Version Upload UI Summary

**UploadNewVersionDialog with file drop zone, VersionBadge component, and version metadata wired into DatasetCard/DocumentTable/DatasetOverviewTab across 3 locales**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-19T03:05:23Z
- **Completed:** 2026-03-19T03:17:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Dataset FE type extended with version fields (parent_dataset_id, version_number, change_summary, version_created_by, metadata_config)
- UploadNewVersionDialog created with file drop zone, change summary input, and auto-parse toggle
- VersionBadge displays v{N} badges for version datasets across DatasetCard and DatasetOverviewTab
- DocumentTable kebab menu with "Upload New Version" action triggers the dialog
- DatasetOverviewTab shows version info section or "Original version" fallback
- i18n keys added in en, vi, ja locales (15 new keys each)

## Task Commits

Each task was committed atomically:

1. **Task 1: FE types, API layer, VersionBadge, and UploadNewVersionDialog** - `1803353` (feat)
2. **Task 2: Wire version UI into DocumentTable, DatasetCard, DatasetOverviewTab + i18n** - `bc06c52` (feat)

## Files Created/Modified
- `fe/src/features/datasets/types/index.ts` - Extended Dataset type with version fields
- `fe/src/features/datasets/api/datasetApi.ts` - Added createDatasetVersion multipart upload
- `fe/src/features/datasets/api/datasetQueries.ts` - Added useCreateDatasetVersion mutation hook
- `fe/src/features/datasets/components/VersionBadge.tsx` - New component for v{N} badges
- `fe/src/features/datasets/components/UploadNewVersionDialog.tsx` - New dialog for version uploads
- `fe/src/features/datasets/components/DocumentTable.tsx` - Kebab menu with "Upload New Version"
- `fe/src/features/datasets/components/DatasetCard.tsx` - VersionBadge and change_summary display
- `fe/src/features/datasets/components/DatasetOverviewTab.tsx` - Version info section
- `fe/src/features/datasets/pages/DatasetDetailPage.tsx` - Pass dataset prop to overview tab
- `fe/src/components/ui/dropdown-menu.tsx` - New shadcn dropdown-menu primitive
- `fe/src/i18n/locales/en.json` - 15 version-related i18n keys
- `fe/src/i18n/locales/vi.json` - Vietnamese translations
- `fe/src/i18n/locales/ja.json` - Japanese translations

## Decisions Made
- Used `exactOptionalPropertyTypes`-safe payload construction (explicit object build, no `|| undefined`) for the mutation call
- Added shadcn dropdown-menu component (Rule 3 - blocking: required for kebab menu)
- Kebab menu pattern chosen over inline buttons for extensibility of row-level actions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing shadcn dropdown-menu component**
- **Found during:** Task 2 (DocumentTable kebab menu)
- **Issue:** `@/components/ui/dropdown-menu` did not exist; build failed
- **Fix:** Ran `npx shadcn@latest add dropdown-menu` to install the component
- **Files modified:** fe/src/components/ui/dropdown-menu.tsx, package.json
- **Verification:** FE build passes
- **Committed in:** bc06c52 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Standard shadcn component addition, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Version upload UI complete, ready for chunk detail page (Plan 03-03)
- VersionBadge and UploadNewVersionDialog available for reuse in other contexts

---
*Phase: 03-document-management*
*Completed: 2026-03-19*
