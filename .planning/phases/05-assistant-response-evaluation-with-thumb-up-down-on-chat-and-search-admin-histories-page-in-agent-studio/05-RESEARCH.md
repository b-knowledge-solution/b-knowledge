# Phase 05: Assistant Response Evaluation - Research

**Researched:** 2026-03-31
**Domain:** Full-stack feedback UX + admin analytics (React 19 / Express / PostgreSQL / TanStack Query)
**Confidence:** HIGH

## Summary

This phase enhances existing feedback infrastructure (thumb up/down on chat and search) with comment support, extends feedback to agent runs, enriches the admin Histories page with feedback data, and adds a "Response Quality" dashboard section. The codebase already has substantial infrastructure in place: an `answer_feedback` table with the right schema, a `FeedbackService` with create/query methods, existing thumb buttons in `ChatMessage.tsx` and `SearchResultCard.tsx`, a `DashboardService` with a complete `getFeedbackAnalytics()` method, and admin Histories page with sidebar+detail pattern.

The primary work is: (1) adding a comment popover to thumb-down buttons, (2) wiring agent run feedback through the existing `answer_feedback` table with a new `'agent'` source value, (3) enriching admin history queries with feedback join data, (4) adding feedback filter/export to Histories, and (5) building 4 stat cards for the Dashboard "Response Quality" section.

**Primary recommendation:** Leverage existing `answer_feedback` table and `DashboardService.getFeedbackAnalytics()` heavily. The DB migration is minimal (update check constraint to include `'agent'`). Most work is frontend component enhancement and new admin UI sections.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Dual location: enhanced Histories + Dashboard section. Feedback data is surfaced in two places: (1) inline feedback indicators and filters on the existing admin Histories page, and (2) a dedicated "Response Quality" section on the admin Dashboard page.
- **D-02:** Histories page gets feedback enhancements. Add thumb up/down indicators on individual messages in the detail view, aggregated counts on session cards in the sidebar, a feedback filter dropdown (all/positive/negative/any feedback), and user comment display as collapsible notes below messages.
- **D-03:** Dashboard gets stat cards section. A "Response Quality" section with 4 stat cards: (1) satisfaction percentage with trend, (2) recent negative feedback list, (3) feedback by source breakdown (chat/search/agent), (4) top flagged sessions.
- **D-04:** Feedback export. Add an "Export feedback" button on the Histories page to download feedback records as CSV for external analysis.
- **D-05:** Thumbs + optional comment on thumb down. Thumb up is one-click (no prompt). Thumb down shows a small popover with an optional text input ("What was wrong?") plus Submit/Skip buttons. This applies to chat messages, search results, and agent run results.
- **D-06:** Backend already supports comments. The `answer_feedback` table has a `comment` column. The `ChatMessage.tsx` and `SearchResultCard.tsx` already have thumb buttons but don't expose the comment input -- this phase adds the comment popover UI.
- **D-07:** Add thumb up/down to agent run results. When a user views an agent run result, they can rate it with thumb up/down (same UX as chat/search). Stored in `answer_feedback` with `source='agent'`.
- **D-08:** Agent feedback visible in admin Histories. Agent run feedback appears in the admin Histories page. The existing Chat/Search tabs may need an Agent Runs tab or feedback from agents surfaces through existing views.
- **D-09:** Extend answer_feedback source enum. Add `'agent'` as a valid source value alongside existing `'chat'` and `'search'` in the `answer_feedback` table check constraint.
- **D-10:** No new tables needed. The existing `answer_feedback` table schema is sufficient. Only the source constraint needs updating.

### Claude's Discretion
- Dashboard stat card component design and chart library choice (if any)
- CSV export format and column selection
- Feedback aggregation query optimization (materialized view vs live query)
- Agent run result view component integration approach
- How to add the Agent Runs tab to admin Histories (new tab vs extending existing)
- Popover vs inline comment input implementation for thumb-down feedback

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19 | UI components | Project standard |
| TanStack Query | 5 | Data fetching, mutations, cache | Project standard for all API calls |
| shadcn/ui | latest | Popover, Dialog, Badge, Button, Sheet | Already used throughout; Popover component exists at `fe/src/components/ui/popover.tsx` |
| lucide-react | latest | ThumbsUp, ThumbsDown, Download, MessageSquareWarning icons | Already used for feedback icons |
| Knex | latest | DB queries, migrations | Project ORM standard |
| Zod | latest | Request validation schemas | Project validation standard |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| i18next / react-i18next | latest | All UI strings in en/vi/ja | Every new string |
| Tailwind CSS | 3.4 | All styling | Every component |

### No New Libraries Needed
No new npm packages are required. CSV export uses native browser APIs (`Blob`, `URL.createObjectURL`, `<a download>`). Dashboard stat cards use plain Tailwind-styled divs. No chart library needed for the 4 stat cards (they show numbers, percentages, and lists -- not graphs).

## Architecture Patterns

### Recommended Changes by Layer

```
be/src/
├── modules/
│   ├── feedback/
│   │   ├── controllers/feedback.controller.ts  # ADD: list, aggregate, export endpoints
│   │   ├── services/feedback.service.ts         # ADD: listFeedback, getStats, exportCsv methods
│   │   ├── models/answer-feedback.model.ts      # ADD: findPaginated, countBySource, findWithFilters
│   │   ├── routes/feedback.routes.ts            # ADD: GET routes for listing/aggregating
│   │   └── schemas/feedback.schemas.ts          # UPDATE: source enum to include 'agent'
│   ├── admin/
│   │   └── services/admin-history.service.ts    # UPDATE: join answer_feedback in queries
│   └── dashboard/
│       └── dashboard.service.ts                 # UPDATE: add source='agent' to getFeedbackAnalytics
├── shared/
│   ├── db/migrations/
│   │   └── YYYYMMDD_add_agent_feedback_source.ts  # NEW: alter check constraint
│   └── models/types.ts                            # UPDATE: AnswerFeedback.source union type

fe/src/
├── components/
│   └── FeedbackButtons.tsx                      # NEW: shared thumb up/down + comment popover
├── features/
│   ├── chat/components/ChatMessage.tsx           # UPDATE: use shared FeedbackButtons
│   ├── search/components/SearchResultCard.tsx    # UPDATE: use shared FeedbackButtons
│   ├── agents/components/RunHistorySheet.tsx     # UPDATE: add FeedbackButtons to run items
│   ├── histories/
│   │   ├── components/AdminChatDetailView.tsx    # UPDATE: show feedback indicators
│   │   ├── components/AdminSearchDetailView.tsx  # UPDATE: show feedback indicators
│   │   ├── components/AdminSessionListSidebar.tsx # UPDATE: feedback counts on cards
│   │   ├── components/AdminFilterDialog.tsx      # UPDATE: add feedback filter dropdown
│   │   ├── components/FeedbackExportButton.tsx   # NEW: CSV export button
│   │   ├── pages/HistoriesPage.tsx              # UPDATE: add Agent Runs tab, export button
│   │   ├── api/historiesApi.ts                   # UPDATE: add feedback query params
│   │   ├── api/historiesQueries.ts              # UPDATE: add feedback filter support
│   │   └── types/histories.types.ts             # UPDATE: add feedback fields to types
│   └── dashboard/                               # UPDATE: add Response Quality section
```

### Pattern 1: Shared FeedbackButtons Component
**What:** Extract the duplicated thumb up/down button pattern from ChatMessage.tsx and SearchResultCard.tsx into a shared component at `fe/src/components/FeedbackButtons.tsx`. Add the comment popover for thumb-down.
**When to use:** Any place that needs feedback buttons (chat, search, agent runs).
**Example:**
```typescript
// fe/src/components/FeedbackButtons.tsx
interface FeedbackButtonsProps {
  initialFeedback?: 'up' | 'down' | null
  onFeedback: (thumbup: boolean, comment?: string) => void
  size?: 'sm' | 'md'
}

function FeedbackButtons({ initialFeedback, onFeedback, size = 'sm' }: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(initialFeedback ?? null)
  const [showCommentPopover, setShowCommentPopover] = useState(false)
  const [comment, setComment] = useState('')

  const handleThumbUp = () => {
    const newValue = feedback === 'up' ? null : 'up'
    setFeedback(newValue)
    if (newValue) onFeedback(true)
  }

  const handleThumbDown = () => {
    if (feedback === 'down') {
      setFeedback(null)
      return
    }
    // Show comment popover on thumb-down
    setShowCommentPopover(true)
    setFeedback('down')
  }

  const handleSubmitComment = () => {
    onFeedback(false, comment.trim() || undefined)
    setShowCommentPopover(false)
    setComment('')
  }

  const handleSkipComment = () => {
    onFeedback(false)
    setShowCommentPopover(false)
    setComment('')
  }
  // ... render with Popover from shadcn/ui
}
```

### Pattern 2: Admin History Feedback Enrichment via JOIN
**What:** Enrich admin history queries by LEFT JOINing `answer_feedback` to attach feedback data to session summaries and message details.
**When to use:** AdminHistoryService queries for chat/search sessions.
**Example:**
```typescript
// In AdminHistoryService.getChatHistory()
// Add subquery for feedback counts per session
db.raw(`(
  SELECT COUNT(*) FILTER (WHERE af.thumbup = true) as positive_count,
         COUNT(*) FILTER (WHERE af.thumbup = false) as negative_count
  FROM answer_feedback af
  WHERE af.source = 'chat' AND af.source_id = chat_sessions.id
) as feedback_summary`)
```

### Pattern 3: CSV Export via Client-Side Download
**What:** Backend returns JSON array of feedback records; frontend converts to CSV and triggers download via Blob URL.
**When to use:** The "Export feedback" button on Histories page.
**Example:**
```typescript
// fe/src/features/histories/components/FeedbackExportButton.tsx
function downloadCsv(data: FeedbackRecord[], filename: string) {
  const headers = ['query', 'answer', 'thumbup', 'comment', 'source', 'user_email', 'created_at']
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => escapeCsvField(row[h])).join(','))
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  // Trigger download via anchor element
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Anti-Patterns to Avoid
- **Don't create a separate feedback table for agents:** Use the existing `answer_feedback` table with `source='agent'`. D-10 explicitly locks this.
- **Don't use a chart library for stat cards:** The 4 stat cards show numbers, lists, and a pie-style breakdown. Plain styled divs with Tailwind suffice. Adding recharts/chart.js for this is over-engineering.
- **Don't query feedback inline in loops:** Use SQL JOINs or subqueries to batch-fetch feedback data with session queries. N+1 queries on history pages will be slow.
- **Don't duplicate FeedbackButtons logic:** Extract to shared component. The existing duplication between ChatMessage.tsx and SearchResultCard.tsx should not be extended to a third place.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popover UI | Custom floating div with positioning | shadcn/ui `<Popover>` | Already available, handles positioning, focus trap, accessibility |
| CSV generation | Server-side CSV file generation with temp files | Client-side Blob + createObjectURL | Simpler, no server storage, works offline, standard browser API |
| Date formatting | Custom date format functions | `toLocaleString()` / `toLocaleDateString()` | Already used throughout the project |
| Feedback aggregation | Custom counting in JS | SQL `COUNT(*) FILTER (WHERE ...)` | PostgreSQL handles this natively and efficiently |

**Key insight:** The `DashboardService.getFeedbackAnalytics()` already implements satisfaction rate, negative feedback list, daily trend, and worst datasets. The "Response Quality" dashboard section can mostly reuse this existing endpoint data, potentially with minor additions for source breakdown and top flagged sessions.

## Common Pitfalls

### Pitfall 1: Check Constraint Migration on Existing Data
**What goes wrong:** Altering the `answer_feedback` source check constraint from `['chat', 'search']` to `['chat', 'search', 'agent']` requires dropping and re-adding the constraint. If done incorrectly, existing data with 'chat'/'search' values could violate the new constraint.
**Why it happens:** PostgreSQL `CHECK IN` constraints cannot be simply extended; they must be dropped and recreated.
**How to avoid:** Use `ALTER TABLE answer_feedback DROP CONSTRAINT ...; ALTER TABLE answer_feedback ADD CONSTRAINT ... CHECK (source IN ('chat', 'search', 'agent'))`. Knex migration: `knex.raw('ALTER TABLE answer_feedback DROP CONSTRAINT IF EXISTS answer_feedback_source_check')` then `knex.raw("ALTER TABLE answer_feedback ADD CONSTRAINT answer_feedback_source_check CHECK (source IN ('chat', 'search', 'agent'))")`.
**Warning signs:** Migration fails on rollback if constraint name is wrong.

### Pitfall 2: Dual-Write Inconsistency for Chat Feedback
**What goes wrong:** Chat feedback currently dual-writes: once to `chat_messages.citations` JSON (inline) and once to `answer_feedback` table. The comment popover adds a `comment` field that needs to reach `answer_feedback.comment` but the dual-write in `chat-conversation.service.ts:706` maps `feedback` param to `comment`.
**Why it happens:** The chat feedback endpoint uses `feedback` as the param name (line 76 of schema, line 689 of service) while `answer_feedback` uses `comment`.
**How to avoid:** When adding comment popover support to chat feedback, pass the comment through the existing `feedback` param in `chatApi.sendFeedback()` (4th argument already exists but is unused). The dual-write at line 712 already maps `feedback` to `comment`.
**Warning signs:** Comments appearing in `chat_messages.citations.feedback.text` but not in `answer_feedback.comment`, or vice versa.

### Pitfall 3: Agent Run Feedback Missing Context Fields
**What goes wrong:** The `answer_feedback` table requires `query` and `answer` as NOT NULL fields. Agent runs may not have a clear "query"/"answer" pair like chat/search do.
**Why it happens:** Agent runs have `input`, `output`, and multi-step execution -- not a simple query/answer pair.
**How to avoid:** For agent feedback, use the agent run's trigger input as `query` and the final output as `answer`. If the run has no output (failed), use a placeholder like "[Run failed]". The `source_id` should be the `agent_run.id`.
**Warning signs:** 500 errors when submitting agent feedback due to NOT NULL constraint violations.

### Pitfall 4: History Feedback JOIN Performance
**What goes wrong:** LEFT JOINing `answer_feedback` to history queries slows down pagination when there are many feedback records.
**Why it happens:** The join creates a cartesian product if multiple feedback records exist per session/message.
**How to avoid:** Use subqueries with aggregate functions (`COUNT(*)`, `FILTER`) instead of joins. The existing indexes on `answer_feedback(source, source_id)` will help. Alternatively, use a correlated subquery that returns a single row per session.
**Warning signs:** History page load time increases significantly after feedback data grows.

### Pitfall 5: Feedback Filter Needs Backend Support
**What goes wrong:** Adding a feedback filter dropdown on the frontend (all/positive/negative/any feedback) requires the backend to support filtering sessions by their feedback status.
**Why it happens:** The current `AdminHistoryService.getChatHistory()` and `getSearchHistory()` methods have no feedback awareness.
**How to avoid:** Add an optional `feedbackFilter` query parameter to the admin history endpoints. The backend should use `EXISTS` subqueries to filter sessions that have matching feedback records.
**Warning signs:** Frontend sends filter params that backend ignores silently.

## Code Examples

### Migration: Extend Source Check Constraint
```typescript
// be/src/shared/db/migrations/YYYYMMDD_extend_feedback_source_agent.ts
export async function up(knex: Knex): Promise<void> {
  // Drop existing check constraint on source column
  await knex.raw('ALTER TABLE answer_feedback DROP CONSTRAINT IF EXISTS answer_feedback_source_check')
  // Re-add with 'agent' included
  await knex.raw("ALTER TABLE answer_feedback ADD CONSTRAINT answer_feedback_source_check CHECK (source IN ('chat', 'search', 'agent'))")
}

export async function down(knex: Knex): Promise<void> {
  // Delete any agent feedback records before restoring original constraint
  await knex('answer_feedback').where('source', 'agent').del()
  await knex.raw('ALTER TABLE answer_feedback DROP CONSTRAINT IF EXISTS answer_feedback_source_check')
  await knex.raw("ALTER TABLE answer_feedback ADD CONSTRAINT answer_feedback_source_check CHECK (source IN ('chat', 'search'))")
}
```

### Backend: Feedback List Endpoint for Admin
```typescript
// New method in FeedbackService
async listFeedback(filters: {
  source?: 'chat' | 'search' | 'agent'
  thumbup?: boolean
  startDate?: string
  endDate?: string
  tenantId: string
  page: number
  limit: number
}): Promise<{ data: AnswerFeedback[]; total: number }> {
  let query = ModelFactory.answerFeedback.getKnex()
    .from('answer_feedback')
    .where('tenant_id', filters.tenantId)

  if (filters.source) query = query.where('source', filters.source)
  if (filters.thumbup !== undefined) query = query.where('thumbup', filters.thumbup)
  if (filters.startDate) query = query.where('created_at', '>=', filters.startDate)
  if (filters.endDate) query = query.where('created_at', '<=', `${filters.endDate} 23:59:59`)

  const countResult = await query.clone().count('* as count').first()
  const total = parseInt(countResult?.count as string || '0', 10)

  const data = await query
    .orderBy('created_at', 'desc')
    .limit(filters.limit)
    .offset((filters.page - 1) * filters.limit)

  return { data, total }
}
```

### Frontend: Comment Popover on ThumbDown
```typescript
// Using shadcn/ui Popover
<Popover open={showCommentPopover} onOpenChange={setShowCommentPopover}>
  <PopoverTrigger asChild>
    <Button variant="ghost" size="icon" className={cn('h-6 w-6', feedback === 'down' && 'text-red-500')}
      onClick={handleThumbDown}>
      <ThumbsDown className="h-3 w-3" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-64 p-3" side="bottom" align="start">
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t('feedback.whatWasWrong', 'What was wrong?')}
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full resize-none rounded-md border px-2 py-1.5 text-xs min-h-[60px]"
        placeholder={t('feedback.optionalComment', 'Optional...')}
        maxLength={2000}
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleSkipComment}>
          {t('common.skip', 'Skip')}
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSubmitComment}>
          {t('common.submit', 'Submit')}
        </Button>
      </div>
    </div>
  </PopoverContent>
</Popover>
```

### Dashboard: Source Breakdown Query
```typescript
// Add to DashboardService or extend getFeedbackAnalytics
async getFeedbackSourceBreakdown(tenantId: string, startDate?: string, endDate?: string) {
  let query = db('answer_feedback')
    .select('source')
    .count('* as count')
    .where('tenant_id', tenantId)
    .groupBy('source')

  if (startDate) query = query.where('created_at', '>=', startDate)
  if (endDate) query = query.where('created_at', '<=', `${endDate} 23:59:59`)

  const rows = await query
  return {
    chat: parseInt(rows.find((r: any) => r.source === 'chat')?.count || '0', 10),
    search: parseInt(rows.find((r: any) => r.source === 'search')?.count || '0', 10),
    agent: parseInt(rows.find((r: any) => r.source === 'agent')?.count || '0', 10),
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Thumb up/down only | Thumb up/down + optional comment on thumb-down | This phase | Users can explain why an answer was bad |
| Feedback on chat/search only | Feedback on chat/search/agent | This phase | Unified feedback across all AI response types |
| No admin feedback visibility | Feedback indicators in Histories + Dashboard stats | This phase | Admins can monitor response quality |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file (BE) | `be/vitest.config.ts` |
| Config file (FE) | `fe/vitest.config.ts` |
| Quick run command (BE) | `npm run test -w be -- --run` |
| Quick run command (FE) | `npm run test:run -w fe` |
| Full suite command | `npm run test` |

### Existing Test Coverage
| File | What It Tests |
|------|---------------|
| `be/tests/feedback/answer-feedback.model.test.ts` | AnswerFeedbackModel CRUD operations |
| `be/tests/feedback/feedback.schemas.test.ts` | Zod schema validation for feedback |
| `be/tests/feedback/feedback.service.test.ts` | FeedbackService create/query methods |

### Phase Requirements to Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Source enum includes 'agent' in Zod schema | unit | `npm run test -w be -- --run tests/feedback/feedback.schemas.test.ts` | Exists (needs update) |
| FeedbackService.listFeedback with filters | unit | `npm run test -w be -- --run tests/feedback/feedback.service.test.ts` | Exists (needs new tests) |
| AnswerFeedbackModel aggregate queries | unit | `npm run test -w be -- --run tests/feedback/answer-feedback.model.test.ts` | Exists (needs new tests) |
| Dashboard feedback source breakdown | unit | `npm run test -w be -- --run tests/dashboard/dashboard.service.test.ts` | Does not exist (Wave 0) |
| AdminHistoryService feedback enrichment | unit | `npm run test -w be -- --run tests/admin/admin-history.service.test.ts` | Does not exist (Wave 0) |
| FeedbackButtons component renders popover | unit | `npm run test:run:ui -w fe` | Does not exist (Wave 0) |
| CSV export generates valid file | unit | `npm run test:run:unit -w fe` | Does not exist (Wave 0) |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run` and `npm run test:run -w fe`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `be/tests/dashboard/dashboard.service.test.ts` -- covers feedback source breakdown
- [ ] `fe/tests/features/histories/FeedbackExportButton.test.tsx` -- covers CSV export
- [ ] `fe/tests/components/FeedbackButtons.test.tsx` -- covers shared feedback component

## Open Questions

1. **Agent Runs Tab vs Unified View**
   - What we know: D-08 says agent feedback should appear in admin Histories. The current page has Chat/Search tabs.
   - What's unclear: Whether to add a third "Agent Runs" tab or surface agent feedback within existing tabs.
   - Recommendation: Add a third "Agent Runs" tab. Agent runs have different shapes (trigger_type, status, duration) than chat/search sessions, so mixing them would confuse the UI. The tab pattern is already established and easy to extend. The HistoriesTab type just needs `'agent'` added.

2. **Dashboard Stat Cards: Live Query vs Cached**
   - What we know: `DashboardService.getFeedbackAnalytics()` runs 6 parallel queries. Adding source breakdown and top flagged sessions adds more queries.
   - What's unclear: Whether the dashboard page is used frequently enough to warrant caching/materialized views.
   - Recommendation: Use live queries for now. The existing `getFeedbackAnalytics()` already runs 6 parallel queries successfully. Add source breakdown and top flagged sessions as 2 additional parallel queries. Monitor performance. Materialized views are premature optimization at this stage.

3. **Feedback on Agent Runs: Which View?**
   - What we know: `RunHistorySheet.tsx` shows agent run history in a side sheet with status, duration, and expandable details. D-07 says to add feedback buttons here.
   - What's unclear: Whether feedback goes on the run list items or only in the expanded detail section.
   - Recommendation: Add feedback buttons in the expanded detail section of completed runs. Failed/cancelled runs should not get feedback buttons (no useful output to evaluate). This keeps the compact list view clean while providing feedback where the output is visible.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** -- all findings verified by reading actual source files
- `be/src/modules/feedback/` -- complete feedback module with model, service, controller, routes, schemas
- `be/src/modules/dashboard/dashboard.service.ts` -- existing `getFeedbackAnalytics()` with satisfaction rate, trends, negative entries
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` -- `answer_feedback` table definition (lines 1313-1332)
- `fe/src/features/chat/components/ChatMessage.tsx` -- existing thumb buttons pattern
- `fe/src/features/search/components/SearchResultCard.tsx` -- existing thumb buttons pattern
- `fe/src/features/histories/` -- complete admin histories feature module
- `fe/src/components/ui/popover.tsx` -- shadcn/ui Popover component available
- `fe/src/features/agents/components/RunHistorySheet.tsx` -- agent run history component

### Secondary (MEDIUM confidence)
- shadcn/ui Popover component API -- standard Radix UI Popover, well-known API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- extending existing patterns (feedback module, admin histories, dashboard service)
- Pitfalls: HIGH -- identified from reading actual code paths (dual-write, constraint migration, NOT NULL fields)

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable -- all codebase-specific findings)
