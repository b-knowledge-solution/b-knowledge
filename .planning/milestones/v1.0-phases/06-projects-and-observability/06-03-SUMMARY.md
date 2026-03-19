---
phase: 06-projects-and-observability
plan: 03
subsystem: api
tags: [analytics, feedback, query-logging, langfuse, knex, postgresql]

# Dependency graph
requires:
  - phase: 06-01
    provides: query_log table, QueryLogService, answer_feedback table
provides:
  - Query analytics API endpoint (GET /analytics/queries)
  - Feedback analytics API endpoint (GET /analytics/feedback)
  - Async query logging wired into chat and search pipelines
affects: [06-04, 06-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget analytics logging, tenant-scoped aggregation queries, Langfuse trace URL construction]

key-files:
  created: []
  modified:
    - be/src/modules/dashboard/dashboard.service.ts
    - be/src/modules/dashboard/dashboard.controller.ts
    - be/src/modules/dashboard/dashboard.routes.ts
    - be/src/modules/chat/services/chat-conversation.service.ts
    - be/src/modules/search/services/search.service.ts
    - be/src/modules/search/controllers/search.controller.ts

key-decisions:
  - "Query logging wired into search.service.ts executeSearch (not raw rag-search.service.ts) because userId/tenantId context is only available at the service layer"
  - "Spread pattern for optional confidence_score to satisfy exactOptionalPropertyTypes TypeScript config"
  - "Worst datasets uses LEFT JOIN with knowledgebase table for dataset name resolution"

patterns-established:
  - "Tenant-scoped analytics: all aggregation queries include WHERE tenant_id = ? for org isolation"
  - "Langfuse trace URL: strip trailing slash from baseUrl before constructing /trace/{traceId}"

requirements-completed: [OBSV-01, OBSV-02, OBSV-03]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 6 Plan 3: Query Analytics and Feedback Aggregation Summary

**Tenant-scoped query analytics and feedback aggregation API endpoints with async query logging wired into chat and search pipelines**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T11:06:22Z
- **Completed:** 2026-03-19T11:11:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Query analytics endpoint returning totalQueries, avgResponseTime, failedRate, lowConfRate, topQueries, trend
- Feedback analytics endpoint returning satisfactionRate, totalFeedback, zeroResultRate, worstDatasets, trend, negativeFeedback with Langfuse trace URLs
- Chat and search pipelines log queries to query_log table asynchronously (fire-and-forget)

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard analytics + feedback service methods and API routes** - `14146a0` (feat)
2. **Task 2: Wire query logging into chat and search pipelines** - `e834d38` (feat)

## Files Created/Modified
- `be/src/modules/dashboard/dashboard.service.ts` - Added getQueryAnalytics, getFeedbackAnalytics, getLangfuseTraceUrl methods with QueryAnalytics and FeedbackAnalytics interfaces
- `be/src/modules/dashboard/dashboard.controller.ts` - Added getQueryAnalytics and getFeedbackAnalytics controller methods with tenant extraction
- `be/src/modules/dashboard/dashboard.routes.ts` - Added /analytics/queries and /analytics/feedback routes with requireTenant middleware
- `be/src/modules/chat/services/chat-conversation.service.ts` - Added fire-and-forget queryLogService.logQuery after chat response
- `be/src/modules/search/services/search.service.ts` - Added fire-and-forget queryLogService.logQuery in executeSearch with userId parameter
- `be/src/modules/search/controllers/search.controller.ts` - Passes userId from session to executeSearch for analytics logging

## Decisions Made
- Query logging wired into search.service.ts executeSearch (not raw rag-search.service.ts) because userId/tenantId context is only available at the service layer
- Used spread pattern for optional confidence_score to satisfy exactOptionalPropertyTypes TypeScript config
- Worst datasets query uses LEFT JOIN with knowledgebase table for human-readable dataset names

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Search logging wired into search.service.ts instead of rag-search.service.ts**
- **Found during:** Task 2
- **Issue:** Plan specified rag-search.service.ts but that's the low-level OpenSearch client without userId/tenantId context
- **Fix:** Wired logging into search.service.ts executeSearch where all required context (userId, tenantId, query, results) is available
- **Files modified:** be/src/modules/search/services/search.service.ts, be/src/modules/search/controllers/search.controller.ts
- **Verification:** npm run build -w be passes
- **Committed in:** e834d38

**2. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes compatibility**
- **Found during:** Task 2
- **Issue:** TypeScript build failed because `confidence_score: topScore ?? undefined` is not assignable when exactOptionalPropertyTypes is enabled
- **Fix:** Used spread pattern `...(topScore != null ? { confidence_score: topScore } : {})` instead
- **Files modified:** be/src/modules/chat/services/chat-conversation.service.ts, be/src/modules/search/services/search.service.ts
- **Verification:** npm run build -w be passes
- **Committed in:** e834d38

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correct integration. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Analytics API endpoints ready for frontend dashboard tabs (Plan 04/05)
- Query logging producing data for analytics aggregation
- Langfuse trace URLs available for negative feedback deep-linking

---
*Phase: 06-projects-and-observability*
*Completed: 2026-03-19*
