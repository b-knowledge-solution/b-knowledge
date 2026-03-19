# Phase 6: Projects and Observability - Research

**Researched:** 2026-03-19
**Domain:** Multi-tenant project management, query analytics, RAG quality observability
**Confidence:** HIGH

## Summary

Phase 6 extends two existing modules (projects and dashboard) and one existing table (answer_feedback) to deliver project-scoped access control and observability dashboards. The codebase already has substantial infrastructure: a full projects module with CRUD, permissions, and dataset binding (BE + FE); a dashboard module with Recharts-based charts; a feedback module with answer_feedback table including trace_id for Langfuse linking; and a CASL-based ABAC system with OpenSearch filter translation.

The main implementation gaps are: (1) the projects table lacks a `tenant_id` column, which is required for multi-tenant isolation; (2) there is no project member management concept distinct from the tab-permission system -- the current `project_permissions` table controls tab-level access (documents/chat/settings) but the CONTEXT.md decision says to "reuse org roles" at project scope, meaning members are simply users granted any permission on a project; (3) the `query_log` table does not exist and must be created; (4) the dashboard module needs analytics endpoints beyond the existing activity stats; (5) cross-project search requires a thin resolver layer that maps user's projects to dataset IDs before calling `searchMultipleDatasets`.

**Primary recommendation:** Extend existing modules in-place. Add `tenant_id` to projects table via migration. Create `query_log` table. Wire query logging as async fire-and-forget in chat and search pipelines. Build analytics and feedback aggregation as new dashboard service methods. Use existing Recharts + shadcn Card patterns from the admin dashboard for the new analytics pages.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Many-to-many project-dataset binding** using junction table (project_datasets already exists)
- **Reuse org roles** at project scope -- no project-specific role system
- **Admin creates, admin/leader manage members** -- only org admins create/delete projects; admins and leaders add/remove members and bind datasets
- **Extend existing projects module** -- build on `be/src/modules/projects/` and `fe/src/features/projects/`
- **Dedicated Projects page** in Data Studio sidebar
- **Immediate access revocation** on dataset unbind
- **Org-level assistants with project scope** -- chat assistants are org-level; project context auto-scopes to bound datasets
- **Project as dataset filter** for cross-project search -- resolve datasets, use existing Phase 5 cross-dataset search
- **Auto-include all authorized projects** in search -- no explicit project selector
- **Dataset source only** on results -- no project breadcrumb
- **Presets + custom date range** for analytics (7d, 30d, 90d + custom; default 30d)
- **Dedicated query_log table** in PostgreSQL for query analytics
- **Essential metrics view** -- 4 summary cards + top 10 queries + queries-over-time chart + failed queries list
- **Admin + super-admin** get analytics by default; leaders only when granted
- **Extend existing dashboard module** for analytics
- **Manual refresh + stale indicator** -- TanStack Query staleTime, no auto-refresh
- **Feedback-derived metrics** -- thumbs up/down ratio, zero-result rate, low-confidence rate from answer_feedback
- **LLM-based evaluation via Langfuse** -- external, not built in-app
- **Feedback summary + trend dashboard** -- satisfaction rate, feedback count, lowest-satisfaction datasets, trend chart, negative feedback table
- **View in Langfuse link** for trace inspection -- no in-app remediation
- **Trace everything by default** -- LANGFUSE_TRACE_EMBEDDINGS=true by default
- **Recharts** for charting library
- **Activity feed on project page** -- recent activity from audit log filtered by project scope

### Claude's Discretion
- query_log table schema details
- Recharts chart configuration and styling
- Activity feed pagination/loading
- Dashboard layout and responsive breakpoints
- Langfuse trace ID linking strategy
- Project member invitation UX flow

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-01 | Project CRUD -- create, update, delete projects within an org | Existing projects module has full CRUD. Needs tenant_id migration and Data Studio UI page. Extend existing ProjectsService and ProjectListPage |
| PROJ-02 | Project-dataset binding -- map datasets to SDLC projects with team-level access | project_datasets junction table exists. Extend with tenant-aware queries, dataset picker UI, and immediate revocation on unbind |
| PROJ-03 | Project member management -- add/remove team members with project-scoped roles | project_permissions table exists with tab-level access. Reuse org roles; member = user with any project permission. Add member list UI and invite flow |
| PROJ-04 | Cross-project search for authorized users -- search across multiple projects with access enforcement | Resolve user's project memberships to dataset IDs, feed into existing searchMultipleDatasets with ABAC filters. Thin resolver layer needed |
| OBSV-01 | Query analytics -- most common queries, failed retrievals, low-confidence answers | New query_log table + async logging in chat/search pipelines + dashboard analytics endpoints + FE analytics page with Recharts |
| OBSV-02 | RAG quality metrics dashboard -- track retrieval precision, answer faithfulness, hallucination rate | Feedback-derived metrics from answer_feedback table + Langfuse link for LLM-evaluated metrics. Dashboard service aggregation queries |
| OBSV-03 | Answer feedback analytics -- aggregate feedback signals for retrieval tuning insights | Extend feedback service with aggregation queries (satisfaction rate, per-dataset breakdown, trend). Dashboard UI with negative feedback table |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Recharts | 3.8.0 | React charting | Already in fe/package.json; composable, works with shadcn/Tailwind dark mode |
| @casl/ability | 6.8.0 | ABAC enforcement | Already integrated; project access controlled via abilities |
| date-fns | (installed) | Date manipulation | Already used in AdminDashboardPage for presets |
| Knex | (installed) | SQL query builder | Standard ORM for all BE models and migrations |
| TanStack Query | 5.x | Server state | Standard data fetching; staleTime for manual refresh pattern |

### Supporting (No New Dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Langfuse SDK | (installed) | Trace linking | Generate Langfuse deep-link URLs from trace_id in answer_feedback |
| Zod | (installed) | Validation | All mutation endpoints need Zod schemas |
| Lucide React | (installed) | Icons | Dashboard cards, project UI icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts | Chart.js/react-chartjs-2 | Recharts already installed and used in dashboard; no reason to switch |
| PostgreSQL query_log | OpenSearch analytics | PostgreSQL simpler for aggregation queries; OpenSearch better for full-text search on query text but overkill |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure (New/Modified Files)

```
be/src/
├── modules/
│   ├── projects/
│   │   ├── services/
│   │   │   └── projects.service.ts          # EXTEND: member management, tenant-aware queries
│   │   ├── controllers/
│   │   │   └── projects.controller.ts       # EXTEND: member endpoints, activity feed
│   │   ├── models/
│   │   │   └── project.model.ts             # EXTEND: tenant-scoped queries
│   │   ├── routes/
│   │   │   └── projects.routes.ts           # EXTEND: member + activity routes
│   │   └── schemas/
│   │       └── projects.schemas.ts          # EXTEND: member + activity validation
│   ├── dashboard/
│   │   ├── dashboard.service.ts             # EXTEND: analytics + feedback aggregation methods
│   │   ├── dashboard.controller.ts          # EXTEND: analytics + feedback endpoints
│   │   └── dashboard.routes.ts              # EXTEND: analytics + feedback routes
│   ├── rag/
│   │   └── services/
│   │       └── query-log.service.ts         # NEW: async query logging
│   └── chat/
│       └── services/
│           └── chat-conversation.service.ts # MODIFY: add query logging hook
├── shared/
│   ├── db/migrations/
│   │   ├── 20260320000000_add_tenant_id_to_projects.ts   # NEW
│   │   └── 20260320000001_create_query_log.ts            # NEW
│   └── models/
│       └── types.ts                         # EXTEND: QueryLog type

fe/src/
├── features/
│   ├── projects/
│   │   ├── components/
│   │   │   ├── ProjectMemberList.tsx        # NEW: member management UI
│   │   │   ├── ProjectDatasetPicker.tsx     # NEW: dataset binding UI
│   │   │   └── ProjectActivityFeed.tsx      # NEW: activity feed component
│   │   └── pages/
│   │       ├── ProjectListPage.tsx          # EXTEND: Data Studio page
│   │       └── ProjectDetailPage.tsx        # EXTEND: members tab, activity feed
│   ├── dashboard/
│   │   ├── components/
│   │   │   ├── QueryAnalyticsCards.tsx      # NEW: 4 summary metric cards
│   │   │   ├── TopQueriesTable.tsx          # NEW: top 10 queries
│   │   │   ├── QueriesOverTimeChart.tsx     # NEW: line chart
│   │   │   ├── FailedQueriesTable.tsx       # NEW: failed retrieval list
│   │   │   ├── FeedbackSummaryCards.tsx     # NEW: satisfaction rate cards
│   │   │   ├── FeedbackTrendChart.tsx       # NEW: feedback trend line
│   │   │   └── NegativeFeedbackTable.tsx    # NEW: recent negative feedback
│   │   ├── pages/
│   │   │   └── AdminDashboardPage.tsx       # EXTEND: add analytics tabs/sections
│   │   └── api/
│   │       ├── dashboardApi.ts              # EXTEND: analytics + feedback API calls
│   │       └── dashboardQueries.ts          # EXTEND: analytics + feedback hooks
│   └── ...
```

### Pattern 1: Async Query Logging (Fire-and-Forget)
**What:** Log every chat/search query to PostgreSQL asynchronously without blocking the response
**When to use:** In chat and search pipeline after the response starts streaming/returning
**Example:**
```typescript
// Source: Established pattern from Phase 1 dual-write feedback (try/catch non-blocking)
class QueryLogService {
  async logQuery(data: CreateQueryLog): Promise<void> {
    try {
      await ModelFactory.queryLog.create(data)
    } catch (err) {
      // Non-blocking: never fail the user request for logging
      log.warn('Failed to log query', { error: String(err) })
    }
  }
}
```

### Pattern 2: Project-to-Dataset Resolver for Cross-Project Search
**What:** Resolve all datasets a user can access through their project memberships
**When to use:** Before calling searchMultipleDatasets in the search/chat pipeline
**Example:**
```typescript
// Resolve datasets from all user's authorized projects
async function resolveProjectDatasets(userId: string, tenantId: string): Promise<string[]> {
  // Get all projects where user has any permission
  const userPerms = await ModelFactory.projectPermission.findByGrantee('user', userId)
  const projectIds = userPerms.map(p => p.project_id)

  // Get all datasets linked to those projects
  const datasetIds: string[] = []
  for (const pid of projectIds) {
    const links = await ModelFactory.projectDataset.findByProjectId(pid)
    links.forEach(l => datasetIds.push(l.dataset_id))
  }

  // Deduplicate (same dataset may be in multiple projects)
  return [...new Set(datasetIds)]
}
```

### Pattern 3: Dashboard Service Extension for Analytics
**What:** Add analytics aggregation methods to existing DashboardService
**When to use:** New analytics endpoints that query query_log and answer_feedback tables
**Example:**
```typescript
// Follows existing DashboardService pattern with parallel Knex queries
async getQueryAnalytics(tenantId: string, startDate: string, endDate: string) {
  const [totalQueries, avgResponseTime, failedRate, lowConfRate, topQueries, trend] =
    await Promise.all([
      this.countQueryLogs(tenantId, startDate, endDate),
      this.avgResponseTime(tenantId, startDate, endDate),
      this.failedRetrievalRate(tenantId, startDate, endDate),
      this.lowConfidenceRate(tenantId, startDate, endDate),
      this.topQueries(tenantId, startDate, endDate, 10),
      this.queryTrend(tenantId, startDate, endDate),
    ])
  return { totalQueries, avgResponseTime, failedRate, lowConfRate, topQueries, trend }
}
```

### Pattern 4: Langfuse Deep-Link URL Construction
**What:** Build a clickable URL to the Langfuse trace viewer from a stored trace_id
**When to use:** Negative feedback table rows need a "View in Langfuse" link
**Example:**
```typescript
// Construct Langfuse trace URL from config base URL and trace ID
function getLangfuseTraceUrl(traceId: string): string {
  const baseUrl = config.langfuse.baseUrl || 'https://cloud.langfuse.com'
  return `${baseUrl}/trace/${traceId}`
}
```

### Anti-Patterns to Avoid
- **Cross-module imports between projects and dashboard:** Use shared service or pass data through API. Projects module must not import from dashboard.
- **Synchronous query logging:** Never block chat/search response for analytics logging. Always async fire-and-forget.
- **Project-specific role system:** CONTEXT.md says reuse org roles. Do not create a project_roles table.
- **Auto-refresh dashboards:** Decision is manual refresh + stale indicator. Do not use polling/refetch intervals.
- **Building in-app trace viewer:** Use Langfuse deep links. Do not replicate trace inspection UI.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Charting | Custom SVG charts | Recharts 3.8.0 (already installed) | Composable, dark mode via CSS vars, responsive |
| ABAC enforcement | Custom permission checks | CASL ability.can() + buildAccessFilters | Already integrated in Phase 2, tested |
| Cross-dataset search | New search infrastructure | searchMultipleDatasets from Phase 5 | Handles OpenSearch terms filter, ABAC, tenant isolation |
| Date range presets | Custom date picker | date-fns + existing DateRangePicker component | Already used in AdminDashboardPage |
| LLM evaluation | In-app eval pipeline | Langfuse external evaluation | Decision says Langfuse handles LLM-based evaluation |
| Activity feed events | Custom event system | Audit log filtered by project scope | AuditService already logs all relevant actions |

**Key insight:** Nearly all infrastructure exists. This phase is primarily about wiring existing capabilities together with new database tables and UI pages.

## Common Pitfalls

### Pitfall 1: Missing tenant_id on Projects Table
**What goes wrong:** The projects table has no tenant_id column. Without it, project listing and ABAC cannot enforce org isolation.
**Why it happens:** Initial schema predates multi-tenant ABAC (Phase 2). Projects were originally scoped by created_by user.
**How to avoid:** Migration MUST add tenant_id to projects table with index, backfill from created_by user's org, and make it NOT NULL after backfill.
**Warning signs:** Projects from org A visible to org B users.

### Pitfall 2: Query Logging Performance Impact
**What goes wrong:** Synchronous INSERT on every query adds latency to chat/search responses.
**Why it happens:** Developer puts await queryLogService.logQuery() in the request pipeline before response.
**How to avoid:** Fire-and-forget pattern (no await, or await with try/catch that never throws). Consider batching if volume is high.
**Warning signs:** Chat response time increases by 5-20ms per message.

### Pitfall 3: N+1 Queries in Project-Dataset Resolution
**What goes wrong:** Resolving datasets for N projects generates N+1 database queries.
**Why it happens:** Loop over projects calling findByProjectId individually.
**How to avoid:** Use a single query: `SELECT dataset_id FROM project_datasets WHERE project_id IN (...)`.
**Warning signs:** Cross-project search latency grows linearly with number of projects.

### Pitfall 4: Feedback Aggregation Without Tenant Isolation
**What goes wrong:** Analytics dashboard shows feedback from all orgs, not just the admin's org.
**Why it happens:** answer_feedback has tenant_id but aggregation query forgets the WHERE clause.
**How to avoid:** ALL analytics queries MUST include `WHERE tenant_id = ?` clause. Dashboard controller passes tenantId from req.user context.
**Warning signs:** Admin sees feedback volume that doesn't match their org's usage.

### Pitfall 5: Stale Query Key Conflicts with Existing Dashboard
**What goes wrong:** Analytics queries invalidate existing dashboard stats cache or vice versa.
**Why it happens:** Reusing overlapping query keys in queryKeys.dashboard.
**How to avoid:** Use distinct query key segments: `queryKeys.dashboard.analytics(...)` and `queryKeys.dashboard.feedback(...)` separate from existing `queryKeys.dashboard.stats(...)`.
**Warning signs:** Dashboard flickers or refetches unexpectedly when switching between tabs.

### Pitfall 6: Langfuse Base URL Trailing Slash
**What goes wrong:** Deep-link URL has double slash: `https://cloud.langfuse.com//trace/abc`.
**Why it happens:** Config baseUrl may or may not end with `/`, and template adds `/trace/`.
**How to avoid:** Strip trailing slash from baseUrl before constructing URL.
**Warning signs:** "View in Langfuse" link returns 404.

### Pitfall 7: Project Deletion Cascading to Shared Datasets
**What goes wrong:** Deleting a project removes datasets that are shared with other projects.
**Why it happens:** Many-to-many binding means a dataset can be in multiple projects. Cascade delete on project_datasets only removes the link, but auto-created datasets get soft-deleted.
**How to avoid:** On project deletion, only soft-delete auto_created datasets that have NO other project links. Check before deleting.
**Warning signs:** Datasets disappear from other projects when one project is deleted.

## Code Examples

### query_log Table Schema (Recommended)
```typescript
// Migration: 20260320000001_create_query_log.ts
await knex.schema.createTable('query_log', (table) => {
  table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()::TEXT'))
  // Source: 'chat' or 'search'
  table.text('source').notNullable().checkIn(['chat', 'search'])
  // The source entity ID (conversation_id for chat, search_app_id for search)
  table.text('source_id').notNullable()
  table.text('user_id').notNullable()
  table.text('tenant_id').notNullable()
  // The actual query text
  table.text('query').notNullable()
  // Dataset IDs searched (JSON array of UUIDs)
  table.jsonb('dataset_ids').defaultTo('[]')
  // Number of results returned
  table.integer('result_count').defaultTo(0)
  // Response time in milliseconds
  table.integer('response_time_ms').nullable()
  // Confidence score from RAG pipeline (0.0-1.0, null if not available)
  table.float('confidence_score').nullable()
  // Whether this query returned zero results (derived, but indexed for fast filtering)
  table.boolean('failed_retrieval').defaultTo(false)
  table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())

  // Indexes for analytics queries
  table.index(['tenant_id', 'created_at'])
  table.index(['tenant_id', 'failed_retrieval'])
  table.index(['source'])
  table.index(['user_id'])
})
```

### tenant_id Migration for Projects
```typescript
// Migration: 20260320000000_add_tenant_id_to_projects.ts
export async function up(knex: Knex): Promise<void> {
  // Add tenant_id column, nullable initially for backfill
  await knex.schema.alterTable('projects', (table) => {
    table.text('tenant_id').nullable()
    table.index('tenant_id')
  })

  // Backfill tenant_id from the creator's current org
  await knex.raw(`
    UPDATE projects p
    SET tenant_id = COALESCE(
      (SELECT ut.tenant_id FROM user_tenant ut WHERE ut.user_id = p.created_by LIMIT 1),
      'default'
    )
    WHERE p.tenant_id IS NULL
  `)

  // Make NOT NULL after backfill
  await knex.schema.alterTable('projects', (table) => {
    table.text('tenant_id').notNullable().alter()
  })
}
```

### Dashboard Analytics Endpoint Pattern
```typescript
// Follows existing dashboard.routes.ts pattern
router.get(
  '/analytics/queries',
  requireAuth,
  requireRole('admin', 'super-admin'),
  controller.getQueryAnalytics.bind(controller)
)

router.get(
  '/analytics/feedback',
  requireAuth,
  requireRole('admin', 'super-admin'),
  controller.getFeedbackAnalytics.bind(controller)
)
```

### Recharts Pattern (From Existing Dashboard)
```typescript
// Source: fe/src/features/dashboard/components/ActivityTrendChart.tsx
// Reuse same CSS variable pattern for dark mode support
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Use CSS custom properties for theme-aware chart colors
const cssVar = (name: string, defaultValue: string): string => {
  if (typeof document === 'undefined') return defaultValue
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || defaultValue
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Project scoped by created_by | Tenant-isolated with tenant_id | Phase 6 migration | Proper multi-tenant isolation |
| No query analytics | Dedicated query_log table | Phase 6 | Enables usage analytics dashboard |
| Feedback as flat records | Feedback aggregation + Langfuse linking | Phase 6 | Actionable RAG quality signals |
| Separate dashboard module | Extended dashboard with analytics tabs | Phase 6 | Unified admin analytics experience |

## Open Questions

1. **Confidence score source**
   - What we know: query_log needs confidence_score. Chat pipeline has LLM responses but no standard confidence metric.
   - What's unclear: Where does confidence_score come from? Is it the top chunk's similarity score? An LLM self-assessment?
   - Recommendation: Use the maximum chunk similarity score from the retrieval step as proxy confidence. Simple, available, and correlates with answer quality.

2. **Leader analytics access gating**
   - What we know: Leaders get analytics "when granted by admin" per CONTEXT.md decision.
   - What's unclear: Is this a new CASL ability (e.g., `read AuditLog` already gated), or a separate permission flag?
   - Recommendation: Add a CASL ability `read Analytics` subject. Admins have it by default; leaders get it via ABAC policy. Minimal new code, consistent with Phase 2 pattern.

3. **Activity feed scope precision**
   - What we know: Activity feed pulls from audit_logs filtered by project scope.
   - What's unclear: How to reliably link audit log entries to a specific project (audit_logs may not have project_id).
   - Recommendation: Filter audit_logs by resource_id matching project's dataset IDs or project ID. May need to add project_id to audit log entries for project-specific actions.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x |
| Config file | be/vitest.config.ts, fe/vitest.config.ts |
| Quick run command | `npm run test -w be -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROJ-01 | Project CRUD with tenant isolation | unit | `npm run test -w be -- --run tests/projects/projects.service.test.ts` | No -- Wave 0 |
| PROJ-02 | Dataset binding and unbinding | unit | `npm run test -w be -- --run tests/projects/project-dataset.test.ts` | No -- Wave 0 |
| PROJ-03 | Member add/remove with role enforcement | unit | `npm run test -w be -- --run tests/projects/project-members.test.ts` | No -- Wave 0 |
| PROJ-04 | Cross-project dataset resolution | unit | `npm run test -w be -- --run tests/projects/cross-project-search.test.ts` | No -- Wave 0 |
| OBSV-01 | Query logging and analytics aggregation | unit | `npm run test -w be -- --run tests/dashboard/query-analytics.test.ts` | No -- Wave 0 |
| OBSV-02 | Feedback aggregation metrics | unit | `npm run test -w be -- --run tests/dashboard/feedback-analytics.test.ts` | No -- Wave 0 |
| OBSV-03 | Negative feedback listing with Langfuse links | unit | `npm run test -w be -- --run tests/dashboard/feedback-analytics.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `be/tests/projects/projects.service.test.ts` -- covers PROJ-01 (CRUD + tenant isolation)
- [ ] `be/tests/projects/project-dataset.test.ts` -- covers PROJ-02 (binding/unbinding)
- [ ] `be/tests/projects/project-members.test.ts` -- covers PROJ-03 (member management)
- [ ] `be/tests/projects/cross-project-search.test.ts` -- covers PROJ-04 (dataset resolution)
- [ ] `be/tests/dashboard/query-analytics.test.ts` -- covers OBSV-01 (query log aggregation)
- [ ] `be/tests/dashboard/feedback-analytics.test.ts` -- covers OBSV-02, OBSV-03 (feedback aggregation)

## Sources

### Primary (HIGH confidence)
- Existing codebase: `be/src/modules/projects/` -- full projects module with CRUD, permissions, dataset binding
- Existing codebase: `be/src/modules/dashboard/` -- dashboard service with parallel Knex queries, Recharts charts
- Existing codebase: `be/src/modules/feedback/` -- feedback service with answer_feedback model
- Existing codebase: `be/src/shared/services/ability.service.ts` -- CASL ABAC with OpenSearch filter translation
- Existing codebase: `be/src/shared/db/migrations/20260312000000_initial_schema.ts` -- projects table schema (no tenant_id)
- Existing codebase: `be/src/shared/db/migrations/20260318000000_answer_feedback.ts` -- answer_feedback schema with trace_id
- Existing codebase: `fe/src/features/dashboard/` -- AdminDashboardPage with Recharts charts, date-fns presets
- npm registry: Recharts 3.8.0 (verified, already installed)

### Secondary (MEDIUM confidence)
- Langfuse trace URL format: `{baseUrl}/trace/{traceId}` -- based on Langfuse SDK patterns and standard URL convention

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in codebase
- Architecture: HIGH -- extending existing modules with well-established patterns
- Pitfalls: HIGH -- identified from direct code inspection (missing tenant_id, N+1 queries, cascade deletion)

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable -- internal codebase, no external dependency changes expected)
