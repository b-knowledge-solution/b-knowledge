---
phase: 03-document-management
plan: 05
subsystem: ui
tags: [react, shadcn, metadata, parser-settings, cron, search-filters, i18n]

requires:
  - phase: 03-02
    provides: DocumentTable with kebab menu, parser settings component
  - phase: 03-04
    provides: bulk metadata API, tag aggregation API, parsing scheduler API

provides:
  - ParserSettingsFields with auto-extraction toggles (auto_keywords, auto_questions, enable_metadata)
  - MetadataSchemaBuilder writing to parser_config.metadata for LLM extraction
  - MetadataManageDialog bulk mode writing to parser_config.metadata_tags
  - DocumentTable bulk "Edit Tags" action
  - TagFilterChips with metadata_filter conditions for search API
  - CronSchedulerSettings in SystemToolsPage
  - i18n keys for all new components in en/vi/ja

affects: [search, system-admin, dataset-config]

tech-stack:
  added: []
  patterns:
    - Toggle+count pattern for auto-extraction settings (Switch + conditional Input)
    - Tag filter chips with popover value selection and metadata_filter API integration
    - Bulk metadata dialog with merge/overwrite mode

key-files:
  created:
    - fe/src/features/datasets/components/MetadataSchemaBuilder.tsx
    - fe/src/features/search/components/TagFilterChips.tsx
    - fe/src/features/system/components/CronSchedulerSettings.tsx
  modified:
    - fe/src/features/datasets/components/ParserSettingsFields.tsx
    - fe/src/features/datasets/components/MetadataManageDialog.tsx
    - fe/src/features/datasets/components/DocumentTable.tsx
    - fe/src/features/datasets/api/datasetApi.ts
    - fe/src/features/datasets/api/datasetQueries.ts
    - fe/src/features/search/pages/SearchPage.tsx
    - fe/src/features/search/types/search.types.ts
    - fe/src/features/system/pages/SystemToolsPage.tsx
    - fe/src/lib/queryKeys.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "Toggle+count pattern replaces slider for auto_keywords/auto_questions (cleaner on/off semantics with count input)"
  - "Bulk metadata dialog uses separate state for key-value tags vs single-mode metadata fields"
  - "TagFilterChips use tag_kwd field in metadata_filter conditions matching rag-search.service.ts buildMetadataFilters()"

patterns-established:
  - "Toggle+count: Switch toggles feature on/off, count Input appears conditionally when enabled"
  - "Bulk edit dialog: same component supports single and bulk mode via optional datasetIds prop"

requirements-completed: [DOCM-04, DOCM-05, DOCM-06]

duration: 14min
completed: 2026-03-19
---

# Phase 3 Plan 05: Metadata Management UI Summary

**Auto-extraction toggles, metadata schema builder, bulk tag editor, search tag filter chips, and cron scheduler settings**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-19T03:21:57Z
- **Completed:** 2026-03-19T03:36:14Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- ParserSettingsFields extended with three auto-extraction toggles (keywords, questions, metadata) using toggle+count pattern
- MetadataSchemaBuilder writes RAGFlow-compatible schema to parser_config.metadata
- MetadataManageDialog supports bulk mode for editing parser_config.metadata_tags with merge/overwrite
- TagFilterChips discovers tags via aggregation API and passes metadata_filter conditions to search
- CronSchedulerSettings allows admin to configure parsing schedule with presets
- All i18n keys added for en, vi, ja locales

## Task Commits

1. **Task 1: Parser settings + MetadataSchemaBuilder + bulk MetadataManageDialog** - `f57174f` (feat)
2. **Task 2: TagFilterChips + CronSchedulerSettings + i18n** - `9e836b5` (feat)

## Files Created/Modified
- `fe/src/features/datasets/components/MetadataSchemaBuilder.tsx` - Visual schema builder for metadata extraction fields
- `fe/src/features/search/components/TagFilterChips.tsx` - Inline tag filter chips below search bar
- `fe/src/features/system/components/CronSchedulerSettings.tsx` - Cron schedule config with presets
- `fe/src/features/datasets/components/ParserSettingsFields.tsx` - Added auto-extraction section
- `fe/src/features/datasets/components/MetadataManageDialog.tsx` - Extended with bulk mode
- `fe/src/features/datasets/components/DocumentTable.tsx` - Added bulk Edit Tags action
- `fe/src/features/datasets/api/datasetApi.ts` - bulkUpdateMetadata, getTagAggregations, scheduler APIs
- `fe/src/features/datasets/api/datasetQueries.ts` - useBulkUpdateMetadata, useTagAggregations hooks
- `fe/src/features/search/pages/SearchPage.tsx` - Wired TagFilterChips with metadata_filter
- `fe/src/features/search/types/search.types.ts` - Added metadata_filter to SearchFilters
- `fe/src/features/system/pages/SystemToolsPage.tsx` - Added CronSchedulerSettings section
- `fe/src/lib/queryKeys.ts` - tagAggregations, parsingScheduler keys

## Decisions Made
- Toggle+count pattern replaces slider for auto_keywords/auto_questions -- cleaner on/off semantics with conditional count input
- Bulk metadata dialog reuses same MetadataManageDialog component via optional datasetIds prop
- TagFilterChips use tag_kwd field in metadata_filter conditions matching rag-search.service.ts buildMetadataFilters()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added metadata_filter field to SearchFilters type with `| undefined`**
- **Found during:** Task 2
- **Issue:** exactOptionalPropertyTypes TS config requires explicit `| undefined` for optional properties
- **Fix:** Added `| undefined` to the metadata_filter type definition
- **Files modified:** `fe/src/features/search/types/search.types.ts`
- **Verification:** FE build passes
- **Committed in:** 9e836b5 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** TypeScript strictness fix required for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All metadata management UI components complete
- Ready for Phase 3 Plan 6 (if any remaining plans) or Phase 4

---
*Phase: 03-document-management*
*Completed: 2026-03-19*
