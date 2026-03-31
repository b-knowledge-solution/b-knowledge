# Phase 5: Assistant Response Evaluation - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Add assistant response evaluation (thumb up/down with optional comment) to chat, search, and agent run results. Enhance the admin Histories page to surface feedback data (indicators, filters, comments, export). Add a "Response Quality" summary section to the admin Dashboard with satisfaction ratio, recent negative feedback, source breakdown, and top flagged sessions.

</domain>

<decisions>
## Implementation Decisions

### Admin Feedback View
- **D-01:** **Dual location: enhanced Histories + Dashboard section.** Feedback data is surfaced in two places: (1) inline feedback indicators and filters on the existing admin Histories page, and (2) a dedicated "Response Quality" section on the admin Dashboard page.
- **D-02:** **Histories page gets feedback enhancements.** Add thumb up/down indicators on individual messages in the detail view, aggregated counts on session cards in the sidebar, a feedback filter dropdown (all/positive/negative/any feedback), and user comment display as collapsible notes below messages.
- **D-03:** **Dashboard gets stat cards section.** A "Response Quality" section with 4 stat cards: (1) satisfaction percentage with trend, (2) recent negative feedback list, (3) feedback by source breakdown (chat/search/agent), (4) top flagged sessions.
- **D-04:** **Feedback export.** Add an "Export feedback" button on the Histories page to download feedback records as CSV for external analysis.

### User-Side Feedback UX
- **D-05:** **Thumbs + optional comment on thumb down.** Thumb up is one-click (no prompt). Thumb down shows a small popover with an optional text input ("What was wrong?") plus Submit/Skip buttons. This applies to chat messages, search results, and agent run results.
- **D-06:** **Backend already supports comments.** The `answer_feedback` table has a `comment` column. The `ChatMessage.tsx` and `SearchResultCard.tsx` already have thumb buttons but don't expose the comment input — this phase adds the comment popover UI.

### Agent Run Feedback
- **D-07:** **Add thumb up/down to agent run results.** When a user views an agent run result, they can rate it with thumb up/down (same UX as chat/search). Stored in `answer_feedback` with `source='agent'`.
- **D-08:** **Agent feedback visible in admin Histories.** Agent run feedback appears in the admin Histories page. The existing Chat/Search tabs may need an Agent Runs tab or feedback from agents surfaces through existing views.

### Data Model
- **D-09:** **Extend answer_feedback source enum.** Add `'agent'` as a valid source value alongside existing `'chat'` and `'search'` in the `answer_feedback` table check constraint.
- **D-10:** **No new tables needed.** The existing `answer_feedback` table schema (source, source_id, message_id, user_id, thumbup, comment, query, answer, chunks_used, trace_id, tenant_id) is sufficient. Only the source constraint needs updating.

### Claude's Discretion
- Dashboard stat card component design and chart library choice (if any)
- CSV export format and column selection
- Feedback aggregation query optimization (materialized view vs live query)
- Agent run result view component integration approach
- How to add the Agent Runs tab to admin Histories (new tab vs extending existing)
- Popover vs inline comment input implementation for thumb-down feedback

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Feedback Infrastructure
- `be/src/modules/feedback/` — Full feedback module: controller, service, model, routes, schemas
- `be/src/modules/feedback/models/answer-feedback.model.ts` — AnswerFeedbackModel with findBySource, findByUser queries
- `be/src/modules/feedback/services/feedback.service.ts` — FeedbackService with createFeedback, getFeedbackBySource
- `be/src/modules/feedback/controllers/feedback.controller.ts` — POST /api/feedback endpoint
- `be/src/modules/feedback/schemas/feedback.schemas.ts` — Zod validation schemas
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — answer_feedback table definition (lines 1313-1332)

### Chat Feedback (Already Implemented)
- `fe/src/features/chat/components/ChatMessage.tsx` — Existing thumb up/down buttons (ThumbsUp/ThumbsDown from lucide)
- `fe/src/features/chat/api/chatApi.ts` — `sendFeedback()` method (line ~168)
- `be/src/modules/chat/services/chat-conversation.service.ts` — `saveFeedback()` with dual-write to answer_feedback (line ~678)

### Search Feedback (Already Implemented)
- `fe/src/features/search/components/SearchResultCard.tsx` — Existing thumb up/down on search results
- `fe/src/features/search/api/searchApi.ts` — `submitFeedback()` method (line ~252)
- `fe/src/features/search/api/searchQueries.ts` — `useSubmitSearchFeedback` mutation hook (line ~105)
- `be/src/modules/search/routes/search.routes.ts` — POST /api/search/apps/:id/feedback (line ~131)

### Admin Histories (Existing Page to Enhance)
- `fe/src/features/histories/pages/HistoriesPage.tsx` — Admin histories page with Chat/Search tabs
- `fe/src/features/histories/components/AdminSessionListSidebar.tsx` — Session list sidebar
- `fe/src/features/histories/components/AdminChatDetailView.tsx` — Chat session detail view
- `fe/src/features/histories/components/AdminSearchDetailView.tsx` — Search session detail view
- `fe/src/features/histories/components/AdminFilterDialog.tsx` — Filter dialog
- `fe/src/features/histories/types/histories.types.ts` — Type definitions
- `fe/src/features/histories/api/historiesApi.ts` — History API calls
- `fe/src/features/histories/api/historiesQueries.ts` — TanStack Query hooks
- `be/src/modules/admin/services/admin-history.service.ts` — Backend admin history service

### Agent Run History (Existing Component)
- `fe/src/features/agents/components/RunHistorySheet.tsx` — Agent run history sheet (needs feedback buttons added)
- `be/src/modules/agents/models/agent-run.model.ts` — Agent run data model
- `fe/src/features/agents/types/agent.types.ts` — AgentRun, AgentRunStatus types

### Dashboard (Existing Page to Enhance)
- `be/src/modules/dashboard/dashboard.service.ts` — Dashboard service (needs feedback stats queries)

### Architecture
- `be/CLAUDE.md` — Backend conventions, module layout, validation patterns
- `fe/CLAUDE.md` — Frontend conventions, feature module structure, API layer split

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ChatMessage.tsx thumb buttons**: Existing ThumbsUp/ThumbsDown button pattern with feedback state tracking — extend with comment popover
- **SearchResultCard.tsx thumb buttons**: Same pattern for search — extend identically
- **FeedbackController + FeedbackService**: Backend CRUD already exists, just needs list/aggregate queries for admin views
- **AnswerFeedbackModel**: BaseModel with findBySource/findByUser — needs aggregate stats methods
- **AdminHistoryService**: Existing paginated history queries — needs feedback join/enrichment
- **RunHistorySheet**: Agent run list component — needs feedback buttons added to run items
- **answer_feedback table**: Full schema with source, thumbup, comment, query, answer, chunks_used, trace_id — no new columns needed

### Established Patterns
- **Feedback state**: `useState<'up' | 'down' | null>` pattern used in both ChatMessage and SearchResultCard
- **API layer split**: `*Api.ts` for raw HTTP + `*Queries.ts` for TanStack Query hooks
- **Admin pages**: Histories page uses sidebar + detail view pattern with filter dialog
- **Dashboard**: Stat cards with data from DashboardService
- **Popover/Sheet components**: shadcn/ui Popover available for comment input UI

### Integration Points
- **DB migration**: Update answer_feedback source check constraint to include 'agent'
- **Feedback module routes**: Add GET endpoints for listing/aggregating feedback (currently only POST exists)
- **Dashboard service**: Add feedback stats queries
- **Histories API**: Enrich history responses with feedback data (join answer_feedback)
- **i18n**: New keys for feedback UI strings in all 3 locales (en, vi, ja)

</code_context>

<specifics>
## Specific Ideas

- Thumb down comment popover: small popover below the thumb-down button with textarea + Submit/Skip. Matches shadcn/ui Popover component pattern.
- Dashboard "Response Quality" section: 4 stat cards in a 2x2 grid, consistent with existing dashboard card styling
- Feedback filter on Histories: dropdown alongside existing Email/Date/Source filters
- CSV export: download all feedback records matching current filters, include query, answer, thumbup, comment, user_email, source, created_at
- Agent feedback uses the same answer_feedback table with source='agent', source_id = agent_run_id

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-assistant-response-evaluation*
*Context gathered: 2026-03-31*
