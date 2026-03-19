---
phase: 07-milestone-gap-closure
plan: 01
subsystem: ui
tags: [react, chat, search, document-preview, deep-research, i18n]

requires:
  - phase: 03-document-lifecycle
    provides: "DocumentPreviewer, CitationDocDrawer, SearchResultDocDialog components"
  - phase: 05-advanced-rag
    provides: "Deep Research pipeline, DeepResearchEvent type, useChatStream deepResearchEvents"
provides:
  - "CitationDocDrawer wired into ChatPage for citation click document preview"
  - "SearchResultDocDialog wired into SearchPage for result click document preview"
  - "DeepResearchProgress inline component for deep research streaming status"
affects: []

tech-stack:
  added: []
  patterns:
    - "Inline streaming progress component using derived state from SSE events array"

key-files:
  created:
    - fe/src/features/chat/components/DeepResearchProgress.tsx
  modified:
    - fe/src/features/chat/pages/ChatPage.tsx
    - fe/src/features/search/pages/SearchPage.tsx
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "Omit selectedChunk prop from SearchResultDocDialog due to SearchResult vs Chunk type mismatch"
  - "Nested chat.deepResearch i18n namespace for new keys (existing flat keys preserved for backward compat)"

patterns-established:
  - "DeepResearchProgress derives display state from events array reverse scan (latest-first)"

requirements-completed: [DOCM-02, RETR-04, RETR-06]

duration: 7min
completed: 2026-03-19
---

# Phase 7 Plan 1: Milestone Gap Closure - Wire Orphaned Components Summary

**CitationDocDrawer and SearchResultDocDialog wired into consumer pages, plus inline DeepResearchProgress component with sub-query tracking and budget indicators**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-19T12:04:25Z
- **Completed:** 2026-03-19T12:11:25Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- ChatPage now renders CitationDocDrawer (with full DocumentPreviewer) on citation click, replacing the basic ChatDocumentPreviewDrawer
- SearchPage now renders SearchResultDocDialog (large dialog with DocumentPreviewer) on result click, replacing SearchDocumentPreviewDrawer
- New DeepResearchProgress component shows sub-query label, progress counter (N of M), token/call budget indicators, warning and exhaustion messages inline in chat area
- i18n keys added in all 3 locales (en, vi with diacriticals, ja with kanji/katakana)

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire CitationDocDrawer into ChatPage and SearchResultDocDialog into SearchPage** - `56c884c` (feat)
2. **Task 2: Create DeepResearchProgress component and wire into ChatPage with i18n** - `1f210d4` (feat)

## Files Created/Modified
- `fe/src/features/chat/components/DeepResearchProgress.tsx` - New inline progress component for deep research streaming
- `fe/src/features/chat/pages/ChatPage.tsx` - Replaced ChatDocumentPreviewDrawer with CitationDocDrawer, added DeepResearchProgress render
- `fe/src/features/search/pages/SearchPage.tsx` - Replaced SearchDocumentPreviewDrawer with SearchResultDocDialog
- `fe/src/i18n/locales/en.json` - Added chat.deepResearch nested keys
- `fe/src/i18n/locales/vi.json` - Added chat.deepResearch nested keys with Vietnamese diacriticals
- `fe/src/i18n/locales/ja.json` - Added chat.deepResearch nested keys with Japanese characters

## Decisions Made
- Omit selectedChunk prop from SearchResultDocDialog: SearchResult type does not match Chunk type expected by the prop. DocumentPreviewer handles chunk display internally.
- Used nested chat.deepResearch i18n namespace for new keys rather than extending existing flat deepResearch* keys, for cleaner organization.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three orphaned component gaps from the v1.0 milestone audit are now closed
- ChatPage, SearchPage, and DeepResearchProgress ready for end-to-end testing

---
*Phase: 07-milestone-gap-closure*
*Completed: 2026-03-19*
