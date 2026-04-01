---
phase: 06-add-prompt-builder-to-chat
plan: 02
subsystem: ui
tags: [react, chat, i18n, prompt-builder, sparkles, imperative-handle]

# Dependency graph
requires:
  - phase: 06-01
    provides: "Shared PromptBuilderModal and ChatInput forwardRef imperative handle"
provides:
  - Sparkles trigger button in ChatInput toggle row
  - PromptBuilderModal wired into ChatPage with onApply inserting into textarea
  - Updated i18n strings for direct-insertion behavior in 3 locales (en, ja, vi)
  - Empty/error state i18n keys for prompt builder
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Imperative handle pattern for cross-component text injection (chatInputRef.current.setValue)"
    - "One-shot action button in ChatInput leftSlot (not a toggle)"

key-files:
  created: []
  modified:
    - fe/src/features/chat/pages/ChatPage.tsx
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/ja.json
    - fe/src/i18n/locales/vi.json

key-decisions:
  - "Sparkles button is a one-shot action (not a toggle) matching existing button patterns in ChatInput"
  - "Toast message changed from clipboard-copy wording to direct-insertion wording"

patterns-established:
  - "leftSlot Fragment pattern for multiple buttons in ChatInput toggle row"

requirements-completed: [PB-04, PB-05, PB-06, PB-07]

# Metrics
duration: 3min
completed: 2026-04-01
---

# Phase 06 Plan 02: ChatPage Integration and i18n Summary

**Wired Sparkles trigger button and PromptBuilderModal into ChatPage with direct textarea insertion via imperative handle, updated i18n in 3 locales**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T04:00:00Z
- **Completed:** 2026-04-01T04:03:09Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 4

## Accomplishments
- Sparkles icon button added to ChatInput toggle row (left side, after assistant selector)
- PromptBuilderModal rendered at ChatPage level with onApply wiring to chatInputRef.current.setValue
- Toast message updated from "Prompt copied! Paste it into the chat input." to "Prompt applied to chat input." in all 3 locales
- Added empty/error state i18n keys (emptyHeading, emptyBody, errorHeading, errorBody) in en, ja, vi
- Human verification confirmed: button visible, modal opens, prompt applies to textarea, dark mode correct

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire Sparkles button and PromptBuilderModal into ChatPage** - `7da14fc` (feat)
2. **Task 2: Update i18n strings in all 3 locales** - `9455097` (feat)
3. **Task 3: Verify Prompt Builder integration in chat** - checkpoint approved (no commit)

## Files Created/Modified
- `fe/src/features/chat/pages/ChatPage.tsx` - Added Sparkles button in leftSlot, PromptBuilderModal with onApply, chatInputRef
- `fe/src/i18n/locales/en.json` - Updated appliedToChat wording, added empty/error state keys
- `fe/src/i18n/locales/ja.json` - Updated appliedToChat wording, added empty/error state keys
- `fe/src/i18n/locales/vi.json` - Updated appliedToChat wording, added empty/error state keys

## Decisions Made
- Sparkles button styled as one-shot action button (not toggle) consistent with file upload button pattern
- Toast message changed to reflect direct textarea insertion rather than clipboard copy

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all components are fully wired to live data sources.

## Next Phase Readiness
- Phase 06 is fully complete: Prompt Builder is accessible from chat, generates prompts from glossary data, and inserts directly into chat textarea
- No blockers for future phases

## Self-Check: PASSED

- FOUND: commit 7da14fc (Task 1)
- FOUND: commit 9455097 (Task 2)
- FOUND: 06-02-SUMMARY.md

---
*Phase: 06-add-prompt-builder-to-chat*
*Completed: 2026-04-01*
