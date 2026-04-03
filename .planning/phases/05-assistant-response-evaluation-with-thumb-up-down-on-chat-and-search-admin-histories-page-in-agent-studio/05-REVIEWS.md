---
phase: 5
reviewers: [codex, gemini]
reviewed_at: "2026-03-31T10:00:00Z"
plans_reviewed: [05-01-PLAN.md, 05-02-PLAN.md, 05-03-PLAN.md, 05-04-PLAN.md]
review_type: post-execution
---

# Cross-AI Plan Review — Phase 5 (Post-Execution)

> This is a post-execution review — plans have been implemented and the reviewers examined both plans AND actual code.

## Codex Review (Post-Execution)

**Findings**

1. **[HIGH] Dashboard feedback UI is bound to the wrong response contract, so the new Response Quality views are likely broken at runtime.**  
   The backend returns `trend: { date, count, satisfactionRate }[]` and `negativeFeedback: { answerPreview, traceId, createdAt, ... }[]` from [dashboard.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/dashboard/dashboard.service.ts#L437), but the frontend expects `trend: { total, positive }[]` and `negativeFeedback: { answer, trace_id, created_at }[]` in [dashboard.types.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/dashboard/types/dashboard.types.ts#L62). The components then render the wrong keys in [FeedbackTrendChart.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/dashboard/components/FeedbackTrendChart.tsx#L178) and [NegativeFeedbackTable.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/dashboard/components/NegativeFeedbackTable.tsx#L129).

2. **[HIGH] Chat/search detail views cannot actually display feedback because the backend detail endpoints never enrich records with feedback fields.**  
   The frontend renders `feedback_thumbup` / `feedback_comment` in [AdminChatDetailView.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/histories/components/AdminChatDetailView.tsx#L142) and similarly in the search detail view, but `getChatSessionDetails()` just returns `history_chat_messages.*` or paired internal chat messages without any feedback join in [admin-history.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/admin/services/admin-history.service.ts#L267). The plan promised detail-level feedback indicators/comments, but the executed BE contract does not supply them.

3. **[HIGH] Admin history queries are not tenant-scoped, which is a real data-isolation risk in a multi-tenant app.**  
   The admin history routes use `requireAuth` + `requireRole('admin')` only in [admin-history.routes.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/admin/routes/admin-history.routes.ts#L26), and the service queries for chat/search/agent history do not filter by tenant at all in [admin-history.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/admin/services/admin-history.service.ts#L77) and [admin-history.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/admin/services/admin-history.service.ts#L447). That diverges from the tenant-scoped feedback/dashboard work elsewhere in the phase.

4. **[MEDIUM] Search thumb-down comments are dropped before they reach the API, so EVAL-01 is incomplete for search results.**  
   `SearchResultCard` supports `(thumbup, result, comment)`, but `SearchResults` re-wraps the callback as `(thumbup) => onFeedback(thumbup, result)` in [SearchResults.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/search/components/SearchResults.tsx#L277). The optional comment collected by the shared popover is lost.

5. **[MEDIUM] Feedback export does not match the promised CSV scope or schema.**  
   The frontend exports columns including `user_email` in [FeedbackExportButton.tsx](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/histories/components/FeedbackExportButton.tsx#L42), but the backend export returns raw `answer_feedback` rows only in [feedback.service.ts](/mnt/d/Project/b-solution/b-knowledge/be/src/modules/feedback/services/feedback.service.ts#L108). The FE request also ignores `source`, `email`, and `sourceName` in [historiesApi.ts](/mnt/d/Project/b-solution/b-knowledge/fe/src/features/histories/api/historiesApi.ts#L125), so the download does not reflect the page filters the plan describes.

Code inspection only. I did not run the builds/tests in this review.

## 05-01 Review

**Summary**  
The plan is mostly well-scoped: reuse the existing `answer_feedback` table, add `agent` to the source enum, and expose list/stats/export endpoints. The main weakness is that the export contract was underdefined, and the implementation shipped an export that is technically functional but insufficient for the CSV UX described later.

**Strengths**
- Reuses the existing feedback model instead of introducing needless schema churn.
- Separates model/service/controller/route responsibilities cleanly.
- Keeps `/api/feedback/stats` tenant-scoped and role-gated.
- Adds source breakdown and top-flagged aggregation in the right layer.

**Concerns**
- **[MEDIUM]** Export payload shape was underspecified, and the implementation returns raw feedback rows without the `user_email` needed by the CSV UX.
- **[LOW]** `page`/`limit` parsing is permissive and lacks min/max validation, so very large or invalid query values are not normalized.
- **[LOW]** The plan says “JSON for CSV conversion,” but it never nails down the exact export schema, which created downstream mismatch.

**Suggestions**
- Define the export response explicitly: include `user_email`, `source`, `query`, `answer`, `thumbup`, `comment`, `created_at`.
- Clamp `page` and `limit` in the query schema.
- Add a contract test for `/api/feedback/export`.

**Risk Assessment**  
**MEDIUM.** The core storage/API work is solid, but EVAL-05 depends on export shape, and that contract gap propagated into the implementation.

## 05-02 Review

**Summary**  
The plan is good architecturally: a shared popover component in `fe/src/components` respects module boundaries, and the agent feedback path sensibly reuses `/api/feedback`. The implementation mostly follows it, but one integration bug means search comments are not actually submitted.

**Strengths**
- Good shared-component extraction; avoids cross-feature imports.
- Chat/search/agent surfaces use a common UX.
- Agent feedback is routed through the shared feedback endpoint instead of inventing a new one.

**Concerns**
- **[MEDIUM]** Search comment text is dropped by the callback wrapper, so the popover UX does not fully work on search results.
- **[LOW]** The shared component does not match some of the plan’s UX details: no `aria-pressed`, no toggle-off behavior, no explicit revert-on-close state.
- **[LOW]** Feedback state is local-only; reopening a view does not appear to rehydrate newly submitted run feedback from the server.

**Suggestions**
- Pass `(thumbup, result, comment)` through unchanged from `SearchResults` to `SearchResultCard`.
- Add component tests for comment propagation through the full search-results chain.
- Either implement or remove the undocumented “toggle off / aria-pressed” behavior from the spec.

**Risk Assessment**  
**MEDIUM.** The shared design is good, but a single dropped callback argument leaves one requirement only partially implemented.

## 05-03 Review

**Summary**  
This is the weakest plan/implementation pair. The intended UX is clear and valuable, but the backend contracts required for detail-level feedback display and safe admin history access were not fully designed, and the executed code reflects that. The page gains visible chrome, but key behaviors are either missing or unsafe.

**Strengths**
- Good product direction: sidebar counts, feedback filters, agent-runs tab, CSV export.
- Read-only agent feedback display in admin views is the right call.
- FE structure stays within the histories feature and shared-component boundaries.

**Concerns**
- **[HIGH]** Chat/search detail views expect feedback fields that the BE detail endpoints never provide.
- **[HIGH]** Admin history queries are not tenant-scoped, including agent-run history and feedback count subqueries.
- **[MEDIUM]** `sourceName` is carried through the FE and BE signatures but never applied in the service queries, so that filter is effectively dead.
- **[MEDIUM]** Export does not honor the page’s full filter set and does not include the promised columns.

**Suggestions**
- Enrich `getChatSessionDetails()` and `getSearchSessionDetails()` with joined or aggregated feedback fields.
- Add tenant filtering to all admin history queries and their feedback subqueries.
- Either implement `sourceName` filtering or remove it from the UI for this phase.
- Move CSV shaping server-side or at least return an enriched export DTO.

**Risk Assessment**  
**HIGH.** Two phase goals, detail-level feedback review and safe admin history access, are not reliably met by the executed code.

## 05-04 Review

**Summary**  
The plan is directionally correct: source breakdown and top-flagged sessions belong in the dashboard, and reusing `/api/feedback/stats` is sensible. The main problem is contract drift between the backend analytics payload and the frontend types/components, which makes this plan look complete on paper but fragile in practice.

**Strengths**
- Good reuse of the feedback stats endpoint instead of duplicating aggregation logic.
- Top-flagged sessions is a good fit for a dedicated card.
- Source breakdown belongs on the dashboard and complements the satisfaction metrics well.

**Concerns**
- **[HIGH]** FE types/components do not match the actual BE payload for trend and negative-feedback items.
- **[MEDIUM]** The plan allowed the dashboard contract to evolve in two places (`/api/admin/dashboard/analytics/feedback` and `/api/feedback/stats`) without a single typed integration checkpoint.
- **[MEDIUM]** The dashboard service builds several raw SQL strings with interpolated date values instead of parameterized filters.

**Suggestions**
- Align one canonical `FeedbackAnalytics` contract across BE and FE, then add an API contract test.
- Either change the backend payload to `total/positive` and `answer/trace_id/created_at`, or update the frontend to consume `count/satisfactionRate` and `answerPreview/traceId/createdAt`.
- Parameterize the raw SQL date conditions.

**Risk Assessment**  
**HIGH.** The dashboard additions are conceptually right, but the payload mismatch is enough to break or misrender the new Response Quality section.

---

## Gemini Review

Gemini CLI was unavailable for this review (429 rate limit exceeded). Only Codex was used.

---

## Consensus Summary

### Critical Issues Found by Codex (Requiring Fixes)

| # | Severity | Issue | Plans Affected |
|---|----------|-------|---------------|
| 1 | **HIGH** | Dashboard FE types don't match BE response shape (trend, negativeFeedback keys) | 05-04 |
| 2 | **HIGH** | Chat/search detail views render feedback fields the BE never provides | 05-03 |
| 3 | **HIGH** | Admin history queries not tenant-scoped | 05-03 |
| 4 | **MEDIUM** | Search thumb-down comments dropped by callback wrapper in SearchResults | 05-02 |
| 5 | **MEDIUM** | Export doesn't include user_email or honor page filters | 05-01, 05-03 |

### Previously Fixed Issues (from earlier review round)

| Issue | Status |
|-------|--------|
| Missing requireRole on admin feedback routes | FIXED |
| Wrong tenant_id resolution in FeedbackController | FIXED |
| Feedback toggle semantics / aria-pressed | FIXED |
| Hardcoded English strings in AdminAgentRunsDetailView | FIXED |
| exactOptionalPropertyTypes violation | FIXED |

### Action Items

These 5 new issues should be addressed before Phase 5 can be considered production-ready:

1. **Align dashboard FE types with BE response** — update `dashboard.types.ts` trend/negativeFeedback interfaces to match actual `dashboard.service.ts` output
2. **Enrich chat/search detail queries** — join `answer_feedback` in `getChatSessionDetails()` and `getSearchSessionDetails()`
3. **Add tenant filtering to admin history queries** — apply tenant_id WHERE clause or requireTenant middleware
4. **Fix search comment callback** — pass `comment` through `SearchResults.tsx` wrapper to `SearchResultCard`
5. **Enrich export DTO** — join user_email, honor current filters in export endpoint


---
*Review conducted: 2026-03-31*
*Reviewer: Codex (OpenAI) — post-execution code review*
*Gemini: unavailable (rate limited)*
