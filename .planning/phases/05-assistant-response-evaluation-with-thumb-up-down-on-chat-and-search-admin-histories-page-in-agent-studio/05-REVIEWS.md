---
phase: 5
reviewers: [codex]
reviewed_at: "2026-03-31T09:15:00Z"
plans_reviewed: [05-01-PLAN.md, 05-02-PLAN.md, 05-03-PLAN.md, 05-04-PLAN.md]
---

# Cross-AI Plan Review — Phase 5

## Codex Review

## 05-01 Review

**Summary**

This is a solid backend foundation plan. It covers the minimum schema change, extends validation/types consistently, and adds the admin-facing feedback list/stats/export primitives needed by later frontend work. The main weakness is that it mixes generic feedback admin APIs with dashboard-specific aggregation in a way that may duplicate responsibility and leave auth/tenant/export constraints under-specified.

**Strengths**

- Keeps the data model minimal and aligned with D-09/D-10 by reusing `answer_feedback`.
- Extends DB, TypeScript types, and Zod schemas together, which reduces drift risk.
- Adds model-level query methods instead of pushing query logic into services/controllers.
- Includes test updates for schema and model behavior.
- Uses paginated list endpoints plus aggregate stats, which fits the admin UI needs.

**Concerns**

- `HIGH` `GET /api/feedback`, `/stats`, and `/export` are only described with `requireAuth`, not clearly `requireAdmin`. These are admin analytics/export endpoints and should not be user-accessible.
- `HIGH` Export returning raw JSON “for CSV conversion on the frontend” is workable, but the requirement is feedback export; without clear size limits, this can become an unbounded data dump and expose sensitive `query`/`answer` data too broadly.
- `MEDIUM` `findPaginated` and export filters omit user/email/source-name level filters that Plan 03’s Histories export UX may need to match “current filters”.
- `MEDIUM` `countBySource` description says “using COUNT(*) FILTER ... grouped by source”; that is internally inconsistent. One row with filtered aggregates is enough; `GROUP BY` is unnecessary and can complicate mapping.
- `MEDIUM` Dashboard ownership is fuzzy. Adding `getFeedbackSourceBreakdown()` in `dashboard.service.ts` while also adding `/api/feedback/stats` creates two aggregation sources for similar data.
- `LOW` Date validation is weak. Plain `z.string().optional()` for `startDate/endDate` can allow malformed values and timezone ambiguity.
- `LOW` No mention of deduplication/idempotency for repeated feedback submissions on the same source item.

**Suggestions**

- Require `requireAdmin` on list/stats/export routes unless there is a documented non-admin use case.
- Define export constraints now: max rows, required date range, or server-side CSV streaming if volume can grow.
- Align filter contracts with Histories early: include `userEmail`, `feedbackFilter`, and possibly `sourceName` if Phase 5 export must mirror admin page filtering.
- Keep dashboard aggregation in one place. Either consume `/api/feedback/stats` from FE or make dashboard endpoints authoritative, not both.
- Tighten Zod query schemas with date parsing/coercion and page/limit bounds.
- Clarify whether one source item can have multiple feedback rows; if not, enforce/update behavior in service/model.

**Risk Assessment**

**MEDIUM**. The core implementation path is sound, but admin authorization and export/data-governance details are under-specified, and those are the highest-risk parts of this backend slice.

---

## 05-02 Review

**Summary**

This plan is strong on UX consistency and reuse. Moving the thumb-down comment flow into a shared component is the right architectural choice for this monorepo. The biggest risks are behavioral regressions in existing chat/search feedback flows, unclear persistence/loading behavior in the shared component, and a likely mismatch between “component owns state” vs “parent owns current feedback state”.

**Strengths**

- Correctly centralizes shared UX in `fe/src/components/`, respecting module boundaries.
- Reuses the same interaction model across chat, search, and agent runs.
- Keeps thumb-up fast and thumb-down richer, matching the requirement.
- Adds i18n coverage in all three locales.
- Adds a dedicated component test suite instead of relying only on integration coverage.
- Restricts agent feedback UI to completed runs, which is sensible.

**Concerns**

- `HIGH` The plan says the component receives `feedback` as a prop but also says “the component handles its own state” and “remove old local state”. That ownership model is inconsistent and likely to cause bugs.
- `HIGH` “Re-clicking active thumb toggles it off” has no corresponding backend unsubmit/delete plan. UI state may imply feedback removal that the API does not support.
- `MEDIUM` “Send feedback” disabled when textarea empty conflicts with the requirement that comment is optional. If comment is optional, thumb-down submit should be allowed without text; otherwise “Skip” is the only empty path.
- `MEDIUM` No explicit loading/submission state in the popover. Users can double-submit if mutation latency exists.
- `MEDIUM` Chat/search existing feedback APIs may have different request shapes; the plan assumes both can cleanly accept `comment` without checking actual contracts.
- `MEDIUM` Agent run feedback posts directly to `/api/feedback`, but there is no plan to surface pre-existing feedback state when reopening run history.
- `LOW` “Clicking outside closes and reverts thumb state to null” may feel odd if the parent already set temporary state or if existing feedback exists from the server.

**Suggestions**

- Decide state ownership explicitly:
  - Parent owns persisted/current feedback.
  - Popover owns only transient open/comment draft state.
- Remove toggle-off unless backend supports deleting/updating feedback; otherwise keep one-way submission semantics.
- Add pending state and disable both buttons during submission.
- Preserve existing feedback if one already exists; don’t revert to `null` on dismiss in that case.
- Verify chat/search API contracts before locking the shared `onFeedback(thumbup, comment?)` abstraction.
- Add at least one integration test per surface, not just the shared component.

**Risk Assessment**

**MEDIUM**. The componentization strategy is good, but the state model and toggle semantics are likely to cause regressions unless tightened before implementation.

---

## 05-03 Review

**Summary**

This is the broadest and riskiest plan in the phase. It clearly maps to the Histories/admin requirements and covers both backend enrichment and frontend UX, but it is doing too much in one wave: new backend query enrichment, new agent-run history endpoints, new FE tab, new filters, new export path, and i18n. The biggest risks are backend query complexity/performance, filter-contract mismatch across layers, and scope overlap with Plan 01’s feedback export/list APIs.

**Strengths**

- Covers the admin requirements comprehensively: indicators, filters, comments, Agent Runs tab, export.
- Correctly treats admin history feedback as read-only display, not writable feedback UI.
- Adds counts at the session-card level and comments at the detail-view level, which matches the product goal well.
- Includes FE types/API/hooks changes rather than burying data-contract drift in UI components.
- Includes targeted tests for backend enrichment and FE export behavior.

**Concerns**

- `HIGH` Query design in `admin-history.service.ts` uses correlated subqueries for every row. On large histories, this can become expensive; counts and `EXISTS` filters may need joins/CTEs/materialized summaries instead.
- `HIGH` Agent runs likely belong to a different module/domain than chat/search histories. Adding them into admin histories may violate module boundary expectations unless the admin module already owns cross-domain reporting.
- `HIGH` Export path is split-brain: Plan 01 adds `/api/feedback/export`, while Plan 03 also expects histories-specific current filters and `user_email` in CSV. Raw `answer_feedback` export may not contain enough joined data.
- `MEDIUM` `feedbackFilter` contract differs between BE (`positive|negative|any|none`) and FE (`all|positive|negative|any|none`). That is manageable, but the mapping needs to be explicitly owned somewhere.
- `MEDIUM` `getAgentRunDetails` says “with steps and feedback records”, but the source context only mentions run model/history sheet, not step schema. That may be scope creep.
- `MEDIUM` No security note on admin-only protection for the new `/api/admin/history/agent-runs*` routes.
- `MEDIUM` There is no explicit plan for how chat/search detail queries will include message-level feedback/comment data; session summary enrichment alone is not enough.
- `LOW` CSV generation on the client is fine for modest data, but no row cap or cancellation behavior is defined.

**Suggestions**

- Separate summary counts from detail feedback enrichment in the backend design. Session-list queries and session-detail queries likely need different shapes.
- Rework counts/filter SQL to use pre-aggregated subqueries or left joins instead of per-row correlated subqueries if history volume is non-trivial.
- Explicitly define the export contract: which endpoint is canonical, and whether it joins user/session metadata server-side.
- Confirm agent run “details” shape before planning steps/output expansion; avoid inventing a schema not already present.
- Add admin auth requirements to all new admin routes.
- Add tests for detail-view feedback/comment enrichment, not just summary counts.
- Consider splitting this into two implementation chunks even if kept in one plan document: backend data contract first, FE rendering second.

**Risk Assessment**

**HIGH**. This plan can achieve the phase goal, but it has the most moving parts, the most query/performance risk, and the most opportunity for backend/FE contract mismatch.

---

## 05-04 Review

**Summary**

This is a focused and mostly appropriate dashboard plan. It leverages the work from Plan 01 and avoids inventing new storage. The main issue is some overlap/ambiguity between existing `getFeedbackAnalytics()` and the new `/api/feedback/stats` source, which could create a fragmented dashboard data model if not normalized.

**Strengths**

- Clearly scoped to dashboard completion rather than general feedback plumbing.
- Reuses existing analytics where possible instead of rebuilding the dashboard wholesale.
- Adds only the missing pieces for D-03: source breakdown, source visibility, top flagged sessions.
- Keeps FE additions fairly modular with dedicated dashboard components/types/hooks.
- Correctly notes that trend can remain aggregate for v1.

**Concerns**

- `MEDIUM` The dashboard would now combine data from two backend sources: `getFeedbackAnalytics()` and `/api/feedback/stats`. That can create inconsistent date filtering, caching, and loading behavior.
- `MEDIUM` `FeedbackSummaryCards.tsx` appears to already contain multiple cards; adding source breakdown there while also adding a separate top-flagged card may make layout ownership messy unless `AdminDashboardPage` is refactored cleanly.
- `MEDIUM` No test coverage is specified for the new dashboard types/API/components.
- `LOW` Plan includes `FeedbackTrendChart.tsx` in modified files but likely leaves it unchanged; that suggests mild scope looseness.
- `LOW` Color mapping says purple for agent, which may conflict with existing design tokens/themes if not aligned with the design system.

**Suggestions**

- Decide whether dashboard FE should call one combined dashboard endpoint or intentionally compose two endpoints; if two, define shared date/filter params and loading states.
- Add at least lightweight FE tests for `TopFlaggedSessionsCard` and source rendering in `NegativeFeedbackTable`.
- Keep `FeedbackSummaryCards` narrow; if the component becomes overloaded, split source breakdown into its own card component.
- Ensure the backend negative feedback query includes `source` in a stable typed contract, not an optional ad hoc addition.

**Risk Assessment**

**LOW-MEDIUM**. This is the cleanest plan of the four, with moderate integration risk mainly from mixed data sources rather than implementation complexity.

---

## Cross-Plan Assessment

**Summary**

The phase decomposition is generally good: Plan 01 establishes backend primitives, Plan 02 handles end-user submission UX, Plan 03 handles admin histories, and Plan 04 finishes dashboard visibility. The major cross-plan risk is contract drift. Export, stats, feedback state semantics, and dashboard/admin data ownership are defined in slightly different ways across plans.

**Strengths**

- Dependency ordering is mostly sensible.
- Reuse of existing `answer_feedback` infrastructure is the right choice.
- FE shared component strategy is appropriate for NX-style boundaries.
- Admin surfaces and user submission surfaces are treated separately.

**Concerns**

- `HIGH` Authorization is not consistently called out for admin-only endpoints.
- `HIGH` Export semantics are inconsistent between Plan 01 and Plan 03.
- `HIGH` Feedback state semantics are inconsistent in Plan 02, especially toggle-off vs persisted submission.
- `MEDIUM` Query/filter contracts are not fully harmonized across BE feedback APIs, admin history APIs, and dashboard APIs.
- `MEDIUM` Performance risk is concentrated in Plan 03’s admin-history enrichment.
- `MEDIUM` Test strategy is uneven; Plan 04 especially lacks explicit tests.

**Suggestions**

- Standardize these contracts before implementation:
  - Who can access `/api/feedback` GET endpoints.
  - Whether feedback is immutable, updatable, or removable.
  - Which endpoint owns export.
  - Which endpoint owns source breakdown/top flagged data for dashboard.
  - Exact filter vocabulary and date semantics.
- Add a short API contract document for Phase 5 before coding.
- Add negative-path tests:
  - unauthorized admin access,
  - malformed date/filter params,
  - duplicate feedback submission,
  - export size limits/failures,
  - empty-state handling for agent runs and dashboard cards.

**Overall Risk Assessment**

**MEDIUM-HIGH**. The plans are directionally correct and likely sufficient to deliver the phase, but they need tighter contract alignment and stronger attention to admin auth, export design, and query performance before execution.

---

## Post-Review Fixes Already Applied

Several HIGH-severity concerns from this review were identified independently during our own code review and have already been fixed:

### 1. Authorization on admin endpoints (HIGH — FIXED)
**Codex concern:** "GET /api/feedback, /stats, and /export are only described with requireAuth, not clearly requireAdmin."
**Fix applied:** Added `requireTenant` + `requireRole('admin', 'leader')` to all three GET routes in `feedback.routes.ts`.

### 2. Tenant isolation (HIGH — FIXED)
**Codex concern (implicit):** Controller used `(req.user as any)?.tenant_id || 'default'` which is wrong.
**Fix applied:** Replaced with `getTenantId(req)` + 403 guard in all 4 controller methods.

### 3. Feedback state toggle semantics (HIGH — FIXED)
**Codex concern:** "Re-clicking active thumb toggles it off has no corresponding backend unsubmit/delete plan."
**Fix applied:** Clarified as intentionally final (no toggle). Removed misleading `aria-pressed` attributes and comments.

### 4. Missing i18n strings (MEDIUM — FIXED)
**Codex concern (implicit from i18n coverage):** Hardcoded English strings in AdminAgentRunsDetailView.
**Fix applied:** Wrapped "Execution Steps", "Positive/Negative feedback" in `t()` calls.

### 5. FE type strictness (LOW — FIXED)
**Fix applied:** Added `| undefined` to optional props in FeedbackSummaryCards for `exactOptionalPropertyTypes` compliance.

## Remaining Concerns (Not Yet Addressed)

| Severity | Concern | Status |
|----------|---------|--------|
| HIGH | Export path split-brain (Plan 01 `/api/feedback/export` vs Plan 03 histories filters) | Acceptable — different use cases: raw export vs filtered admin view |
| HIGH | Plan 03 correlated subqueries performance | Monitor — acceptable for MVP, optimize if history volume grows |
| MEDIUM | Dashboard data from two sources (getFeedbackAnalytics + /api/feedback/stats) | Acceptable — different data shapes for different dashboard sections |
| MEDIUM | No explicit loading/submission state in popover | Acceptable for v1 — fast mutation, low latency |
| MEDIUM | feedbackFilter contract mapping (BE vs FE enum values) | Implemented correctly — FE maps 'all' to omit param |
| LOW | No deduplication for repeated feedback submissions | Acceptable — backend upserts or last-write-wins is fine |
| LOW | Date validation weakness in Zod schemas | Low risk — dates come from date picker UI, not free text |

---

*Review conducted: 2026-03-31*
*Reviewer: Codex (OpenAI)*
