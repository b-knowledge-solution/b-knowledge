# Phase 6: Projects and Observability - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete multi-tenant project scoping (CRUD, dataset binding, member management, cross-project search) and surface RAG quality analytics (query analytics dashboard, feedback aggregation, quality metrics with Langfuse deep-dive links). Projects organize knowledge bases for SDLC teams; observability gives admins visibility into retrieval quality and usage patterns.

</domain>

<decisions>
## Implementation Decisions

### Project-Dataset Binding Model
- **Many-to-many** — a dataset can belong to multiple projects. Uses junction table
- **Reuse org roles** — project members have their org role applied at project scope. No project-specific role system
- **Admin creates, admin/leader manage members** — only org admins create/delete projects. Admins and leaders add/remove members and bind datasets
- **Extend existing projects module** — build on `be/src/modules/projects/` and `fe/src/features/projects/`. Don't rebuild
- **Dedicated Projects page** in Data Studio sidebar for project management
- **Immediate access revocation** on dataset unbind — no grace period
- **Org-level assistants with project scope** — chat assistants are org-level; when user is in project context, assistant auto-scopes to project's bound datasets. No per-project assistants

### Cross-Project Search
- **Project as dataset filter** — resolves which datasets user can access across projects, then uses existing Phase 5 cross-dataset search with ABAC. No new search infrastructure
- **Auto-include all authorized projects** — search automatically includes datasets from all user's projects. No explicit project selector needed
- **Dataset source only** on results — no project breadcrumb. Projects are organizational, dataset is what matters for content context

### Query Analytics Dashboard
- **Presets + custom date range** — 7d, 30d, 90d presets plus custom date picker. Default 30 days
- **Dedicated query_log table** — log every search/chat query to PostgreSQL: query text, user_id, tenant_id, dataset_ids, result_count, response_time, confidence_score, timestamp. Lightweight async insert
- **Essential metrics view** — 4 summary cards (total queries, avg response time, failed retrieval rate, low-confidence rate) + top 10 queries table + queries-over-time line chart + failed queries list
- **Access**: admin + super-admin have analytics by default. Leaders get analytics access when granted by admin (not automatic)
- **Extend existing dashboard module** — add analytics sections to `be/src/modules/dashboard/`
- **Manual refresh + stale indicator** — loads on page visit with "Last updated: X minutes ago" + refresh button. TanStack Query staleTime for caching. No auto-refresh

### RAG Quality Metrics + Feedback
- **Feedback-derived metrics** in B-Knowledge — thumbs up/down ratio, zero-result rate, low-confidence rate from existing answer_feedback table
- **LLM-based evaluation via Langfuse** — Langfuse already integrated, collects all LLM request traces from chat/search. Used for debugging and detailed evaluation externally
- **Feedback summary + trend** dashboard — overall satisfaction rate card, total feedback count, datasets with lowest satisfaction. Feedback trend line chart. Recent negative feedback table with query + answer
- **View + Langfuse link** for actionability — admin views feedback data, clicks "View in Langfuse" for trace inspection. No in-app remediation actions

### Langfuse Trace Configuration
- **Trace everything by default** — all LLM calls including embeddings, auto-extraction, clinical classification
- **LANGFUSE_TRACE_EMBEDDINGS=true by default** — env variable to disable embedding traces (set to false to save space)

### Charting Library
- **Recharts** — React-native, composable, works well with shadcn/Tailwind

### Project Activity Feed
- **Activity feed on project page** — recent activity list (dataset added, user joined, document parsed). Pulls from existing audit log data filtered by project scope. No real-time notifications

### Claude's Discretion
- query_log table schema details
- Recharts chart configuration and styling
- Activity feed pagination/loading
- Dashboard layout and responsive breakpoints
- Langfuse trace ID linking strategy
- Project member invitation UX flow

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Projects Module
- `be/src/modules/projects/` — Backend projects module (controllers, models, routes, schemas, services). Extend this
- `fe/src/features/projects/` — Frontend projects feature (api, components, pages, types). Extend this

### Existing Dashboard Module
- `be/src/modules/dashboard/` — Dashboard controller, routes, service. Extend with analytics

### Existing Feedback Module
- `be/src/modules/feedback/` — Feedback controllers, routes, services
- `be/src/shared/db/migrations/20260318000000_answer_feedback.ts` — answer_feedback table schema

### Phase 2 ABAC Integration
- `be/src/shared/services/ability.service.ts` — CASL ability builder, buildAccessFilters for ABAC enforcement
- `be/src/shared/middleware/tenant.middleware.ts` — requireTenant middleware
- `be/src/shared/middleware/auth.middleware.ts` — requireAbility middleware

### Phase 5 Cross-Dataset Search
- `be/src/modules/rag/services/rag-search.service.ts` §searchMultipleDatasets — Cross-dataset search with ABAC filters

### Audit Module (Activity Feed Source)
- `be/src/modules/audit/` — Audit service, models. Project activity feed pulls from this data

### Langfuse Integration
- `be/src/modules/chat/services/chat-conversation.service.ts` — Langfuse trace wrapping in chat pipeline
- `be/src/shared/config/index.ts` — Langfuse configuration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Projects module (BE + FE)**: Full CRUD infrastructure already exists — extend with dataset binding and member management
- **Dashboard module**: Controller + routes + service exist — extend with analytics API endpoints
- **Feedback module**: Controllers + routes exist — extend with aggregation queries
- **answer_feedback table**: Phase 1 migration exists with vote, comment, chunks fields
- **Audit module**: Full audit logging exists — filter by project scope for activity feed
- **searchMultipleDatasets**: Phase 5 cross-dataset search — reuse for cross-project search
- **CASL ability service**: Phase 2 ABAC — project access controlled via abilities

### Established Patterns
- **TanStack Query + queryKeys**: Centralized query key factory for all data fetching
- **Module boundary rules**: Projects module can't import from dashboard directly — use shared services
- **i18n**: All UI strings in 3 locales (en, vi, ja)
- **Dark mode**: Class-based Tailwind dark mode support required

### Integration Points
- **Data Studio sidebar**: Add "Projects" nav item (CASL-gated)
- **Dashboard page**: Add analytics tabs/sections
- **Chat pipeline**: Query logging hook point for analytics data capture
- **Search pipeline**: Query logging hook point
- **Langfuse**: Existing trace IDs can link dashboard to Langfuse UI

</code_context>

<specifics>
## Specific Ideas

- Cross-project search is essentially "resolve datasets from user's projects → call existing searchMultipleDatasets" — minimal new code
- Project activity feed reuses audit log data with project scope filter — no new logging infrastructure
- Langfuse deep-dive link on negative feedback entries gives admins the full trace without building a trace viewer
- Analytics access for leaders is permission-grantable by admin, not automatic — gives admins control over who sees usage data

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-projects-and-observability*
*Context gathered: 2026-03-19*
