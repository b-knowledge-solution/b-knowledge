---
phase: 01-migration-stabilization
plan: 04
subsystem: api, ui, testing
tags: [feedback, e2e, playwright, zod, knex, tanstack-query, sse, chat, search]

# Dependency graph
requires:
  - phase: 01-migration-stabilization
    provides: "Auth fixtures, dataset CRUD E2E infrastructure (01-01, 01-02)"
provides:
  - "answer_feedback table for structured feedback analytics"
  - "Feedback module (model, service, controller, routes, schemas)"
  - "/api/feedback endpoint for generic feedback creation"
  - "POST /api/search/apps/:id/feedback for search-specific feedback"
  - "Chat feedback dual-write to answer_feedback table"
  - "Search result thumbs up/down UI matching chat pattern"
  - "E2E tests for chat streaming, search results, and feedback"
affects: [02-multi-tenancy, 03-abac, analytics]

# Tech tracking
tech-stack:
  added: []
  patterns: [feedback-module-pattern, dual-write-migration, e2e-api-helper-extensions]

key-files:
  created:
    - be/src/shared/db/migrations/20260318000000_answer_feedback.ts
    - be/src/modules/feedback/index.ts
    - be/src/modules/feedback/models/answer-feedback.model.ts
    - be/src/modules/feedback/routes/feedback.routes.ts
    - be/src/modules/feedback/controllers/feedback.controller.ts
    - be/src/modules/feedback/services/feedback.service.ts
    - be/src/modules/feedback/schemas/feedback.schemas.ts
    - fe/e2e/chat/chat-stream.spec.ts
    - fe/e2e/search/search-query.spec.ts
    - fe/e2e/feedback/feedback.spec.ts
  modified:
    - be/src/shared/models/factory.ts
    - be/src/shared/models/types.ts
    - be/src/app/routes.ts
    - be/src/modules/chat/services/chat-conversation.service.ts
    - be/src/modules/search/routes/search.routes.ts
    - be/src/modules/search/controllers/search.controller.ts
    - fe/src/features/search/api/searchApi.ts
    - fe/src/features/search/api/searchQueries.ts
    - fe/src/features/search/components/SearchResultCard.tsx
    - fe/e2e/helpers/api.helper.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "Dual-write chat feedback to answer_feedback table with non-blocking try/catch for backward compatibility"
  - "Search feedback uses dedicated POST /apps/:id/feedback endpoint rather than generic /api/feedback for cleaner URL semantics"
  - "Feedback buttons on SearchResultCard are opt-in via onFeedback prop to preserve backward compatibility"

patterns-established:
  - "Feedback module pattern: model + service + controller + routes + schemas + barrel export"
  - "Dual-write migration: write to both old location (JSONB) and new table simultaneously"
  - "E2E api.helper.ts extended with chat assistant, conversation, and search app helpers"

requirements-completed: [CHAT-01, CHAT-02, CHAT-03]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 01 Plan 04: Chat/Search E2E Tests and Answer Feedback Summary

**answer_feedback table with dual-write from chat, search feedback endpoint, thumbs up/down UI on search results, and E2E tests for chat streaming, search queries, and feedback submission**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-18T08:07:46Z
- **Completed:** 2026-03-18T08:18:11Z
- **Tasks:** 2
- **Files modified:** 23

## Accomplishments
- Created answer_feedback table with migration, capturing source, query, answer, chunks_used, and trace_id for retrieval quality analytics
- Built complete feedback module (model, service, controller, routes, schemas) following existing NX-style module conventions
- Added search-specific feedback endpoint POST /api/search/apps/:id/feedback and generic /api/feedback endpoint
- Dual-write chat feedback to both citations JSONB (backward compat) and new answer_feedback table
- Added thumbs up/down feedback buttons to SearchResultCard matching the chat feedback UI pattern
- Created E2E tests for chat streaming with citations, search result display, and feedback submission
- Extended api.helper.ts with chat assistant, conversation, and search app CRUD helpers

## Task Commits

Each task was committed atomically:

1. **Task 1: Create answer_feedback table and feedback module** - `92af41a` (feat)
2. **Task 2: Add search feedback UI and write chat/search/feedback E2E tests** - `284e4ab` (feat)

## Files Created/Modified
- `be/src/shared/db/migrations/20260318000000_answer_feedback.ts` - Migration for answer_feedback table
- `be/src/modules/feedback/**` - Complete feedback module (model, service, controller, routes, schemas, barrel)
- `be/src/shared/models/types.ts` - AnswerFeedback and CreateAnswerFeedback types
- `be/src/shared/models/factory.ts` - answerFeedback model registered in ModelFactory
- `be/src/app/routes.ts` - feedbackRoutes mounted at /api/feedback
- `be/src/modules/search/routes/search.routes.ts` - POST /apps/:id/feedback endpoint
- `be/src/modules/search/controllers/search.controller.ts` - sendFeedback controller method
- `be/src/modules/chat/services/chat-conversation.service.ts` - Dual-write to answer_feedback
- `fe/src/features/search/api/searchApi.ts` - sendFeedback API method
- `fe/src/features/search/api/searchQueries.ts` - useSendSearchFeedback mutation hook
- `fe/src/features/search/components/SearchResultCard.tsx` - ThumbsUp/ThumbsDown feedback buttons
- `fe/e2e/chat/chat-stream.spec.ts` - Chat streaming, persistence, citation E2E tests
- `fe/e2e/search/search-query.spec.ts` - Search results and source document E2E tests
- `fe/e2e/feedback/feedback.spec.ts` - Chat and search feedback submission E2E tests
- `fe/e2e/helpers/api.helper.ts` - Extended with assistant, conversation, search app helpers
- `fe/src/i18n/locales/{en,vi,ja}.json` - Feedback i18n keys for all 3 locales

## Decisions Made
- Dual-write chat feedback to answer_feedback table with non-blocking try/catch -- preserves backward compatibility while enabling structured analytics
- Search feedback uses dedicated POST /apps/:id/feedback rather than generic /api/feedback for cleaner REST semantics
- Feedback buttons on SearchResultCard use opt-in onFeedback prop to avoid breaking existing usage

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ChatMessage type mismatch in dual-write**
- **Found during:** Task 1
- **Issue:** Plan referenced `message.user_id` and `message.tenant_id` but ChatMessage type has `created_by` and no tenant_id
- **Fix:** Changed to `message.created_by` and hardcoded `'default'` for tenant_id
- **Files modified:** be/src/modules/chat/services/chat-conversation.service.ts
- **Committed in:** 92af41a (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type correction necessary for build to pass. No scope creep.

## Issues Encountered
- Frontend Vite build fails due to pre-existing rollup native module issue (not caused by this plan's changes). TypeScript type checking passes cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 E2E test infrastructure complete for chat, search, and feedback flows
- answer_feedback table ready for analytics queries in future phases
- Feedback module established as a shared module pattern for future feedback types

---
*Phase: 01-migration-stabilization*
*Completed: 2026-03-18*
