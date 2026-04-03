---
phase: 03-refactor-project-feature
plan: 05
subsystem: ui
tags: [react, shadcn, i18n, category-views, version-management]

requires:
  - phase: 03-04
    provides: CategorySidebar, ProjectSettingsSheet, 3-tab ProjectDetailPage layout
provides:
  - StandardCategoryView component rendering DocumentListPanel for standard categories
  - CodeCategoryView component with git sync placeholder and language badges
  - VersionList and VersionCard components for Documents category version management
  - Full i18n coverage across en, vi, ja for all project UI strings
  - Updated barrel exports for all new components
affects: [03-06, future-git-sync, future-language-detection]

tech-stack:
  added: []
  patterns: [category-type-discriminated-views, version-card-expansion-pattern]

key-files:
  created:
    - fe/src/features/projects/components/StandardCategoryView.tsx
    - fe/src/features/projects/components/CodeCategoryView.tsx
    - fe/src/features/projects/components/VersionList.tsx
    - fe/src/features/projects/components/VersionCard.tsx
  modified:
    - fe/src/features/projects/pages/ProjectDetailPage.tsx
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json
    - fe/src/features/projects/index.ts

key-decisions:
  - "DocumentListPanel reused as-is for standard/code views, passing dataset_id as versionId"
  - "Git sync panel implemented as disabled placeholder with Collapsible component per RESEARCH.md deferral"
  - "Japanese translations use proper Unicode characters instead of romanized placeholders"

patterns-established:
  - "Category view pattern: null guard on dataset_id before rendering DocumentListPanel"
  - "Version expansion pattern: click VersionCard to toggle inline DocumentListPanel"

requirements-completed: [D-06, D-07, D-08, D-09]

duration: 8min
completed: 2026-03-24
---

# Phase 03 Plan 05: Category Content Views Summary

**StandardCategoryView, CodeCategoryView with git sync placeholder, VersionList/VersionCard for Documents tab, and full 3-locale i18n coverage**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-24T11:32:45Z
- **Completed:** 2026-03-24T11:41:05Z
- **Tasks:** 3 of 4 (checkpoint pending)
- **Files modified:** 9

## Accomplishments

- Created StandardCategoryView rendering DocumentListPanel with parser config badge and null guard
- Created CodeCategoryView with language badges, collapsible git sync placeholder, and DocumentListPanel
- Created VersionList with sorted cards, inline expansion, New Version button, and VersionModal integration
- Created VersionCard with status badges (parsing/ready/error/archived), date formatting, and context menu
- Wired StandardCategoryView and CodeCategoryView into ProjectDetailPage replacing placeholder content
- Added 19 i18n keys across all 3 locale files (en, vi, ja) with full parity
- Updated barrel exports with all new components

## Task Commits

Each task was committed atomically:

1. **Task 1: Create StandardCategoryView, CodeCategoryView, VersionList, VersionCard** - `4854ad7` (feat)
2. **Task 2: Wire views into ProjectDetailPage** - `9b437d6` (feat)
3. **Task 3: Add i18n keys and update barrel exports** - `a15ae3a` (feat)

## Files Created/Modified

- `fe/src/features/projects/components/StandardCategoryView.tsx` - Standard category view with DocumentListPanel and parser badge
- `fe/src/features/projects/components/CodeCategoryView.tsx` - Code category view with git sync placeholder and language badge
- `fe/src/features/projects/components/VersionList.tsx` - Sortable version card list with create/delete/archive actions
- `fe/src/features/projects/components/VersionCard.tsx` - Individual version card with status badges and context menu
- `fe/src/features/projects/pages/ProjectDetailPage.tsx` - Replaced placeholder content with dedicated views
- `fe/src/i18n/locales/en.json` - Added 19 project keys (English)
- `fe/src/i18n/locales/vi.json` - Added 19 project keys (Vietnamese)
- `fe/src/i18n/locales/ja.json` - Added 19 project keys (Japanese)
- `fe/src/features/projects/index.ts` - Added barrel exports for 6 components

## Decisions Made

- **DocumentListPanel reuse:** Standard/Code views pass `dataset_id` as `versionId` to DocumentListPanel. This allows reuse of the existing component without changes. The BE version-based document APIs may need adaptation for non-versioned categories in a future plan.
- **Git sync disabled placeholder:** Implemented as Collapsible with disabled "Connect Repository" button per RESEARCH.md Open Question 1 deferral decision.
- **Proper Japanese translations:** Used actual Japanese characters instead of the romanized placeholders in the plan (e.g., "ドキュメント" instead of "dokumento").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Proper Japanese translations instead of romanized text**
- **Found during:** Task 3
- **Issue:** Plan specified romanized Japanese (e.g., "dokumento", "sutandado") which would display as Latin characters in the Japanese UI
- **Fix:** Used proper Japanese characters (e.g., "ドキュメント", "スタンダード")
- **Files modified:** fe/src/i18n/locales/ja.json
- **Committed in:** a15ae3a (Task 3 commit)

**2. [Rule 1 - Bug] Proper Vietnamese translations with diacritics**
- **Found during:** Task 3
- **Issue:** Plan specified Vietnamese without diacritics (e.g., "Tai lieu") which is unreadable
- **Fix:** Used proper Vietnamese with diacritics (e.g., "Tai lieu" -> "Tài liệu")
- **Files modified:** fe/src/i18n/locales/vi.json
- **Committed in:** a15ae3a (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (2 bug fixes for i18n quality)
**Impact on plan:** Both fixes necessary for i18n correctness. No scope creep.

## Issues Encountered

- FE build fails in worktree due to missing node_modules (pre-existing worktree dependency issue, not caused by plan changes). All errors are "Could not find a declaration file for module 'react'" type, affecting all files equally.

## Known Stubs

- **Git sync panel** in `CodeCategoryView.tsx` line 99-111: Disabled "Connect Repository" button with "coming soon" text. Intentional deferral per RESEARCH.md Open Question 1 - will be resolved in a future git sync integration plan.
- **Language badges** in `CodeCategoryView.tsx` line 82-86: Static "Code" badge. Language detection from uploaded files deferred to actual usage phase.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 3 category content views are implemented and wired
- Task 4 (human verification checkpoint) is pending - requires manual testing of the full end-to-end flow
- After verification, the project feature refactor (Phase 03) is complete

---
*Phase: 03-refactor-project-feature*
*Completed: 2026-03-24*
