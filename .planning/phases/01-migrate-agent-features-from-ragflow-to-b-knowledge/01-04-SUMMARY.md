---
phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
plan: 04
subsystem: ui
tags: [react, tanstack-query, i18n, routing, agents, agent-canvas]

requires:
  - phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
    provides: "Agent types, query keys, canvas store (Plan 02)"
provides:
  - "Agent API layer (agentApi.ts) with CRUD, versioning, templates, runs HTTP calls"
  - "TanStack Query hooks (agentQueries.ts) with 12 hooks for all agent operations"
  - "AgentListPage with card grid, tabs, search, mode filter, create dialog"
  - "AgentCard component with kebab dropdown actions"
  - "TemplateGallery with responsive grid and skeleton loading"
  - "Sidebar nav entry for Agents (Workflow icon)"
  - "Route /agents and /agents/:id with lazy loading"
  - "Agent-first unification links in chat/search creation flows"
  - "i18n strings in en, vi, ja locales"
affects: [01-05, 01-06, 01-07, 01-08, 01-09, 01-10]

tech-stack:
  added: []
  patterns:
    - "agentApi object pattern (matching projectApi style with query string builder)"
    - "Spread pattern for exactOptionalPropertyTypes on optional DTO fields"
    - "Mode-based left border accent color on agent cards"

key-files:
  created:
    - fe/src/features/agents/api/agentApi.ts
    - fe/src/features/agents/api/agentQueries.ts
    - fe/src/features/agents/pages/AgentListPage.tsx
    - fe/src/features/agents/components/AgentCard.tsx
    - fe/src/features/agents/components/TemplateGallery.tsx
    - fe/src/features/chat/components/CreateChatAssistantDialog.tsx
    - fe/src/features/search/components/CreateSearchAppDialog.tsx
  modified:
    - fe/src/app/App.tsx
    - fe/src/app/routeConfig.ts
    - fe/src/layouts/sidebarNav.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json

key-decisions:
  - "Spread pattern for optional description to satisfy exactOptionalPropertyTypes"
  - "Agent-first links as separate component files (not inline in management pages)"
  - "AgentCanvasPage lazy import points to AgentListPage as placeholder until canvas is built"

patterns-established:
  - "agentApi query string builder pattern (URLSearchParams, no params option on api.get)"
  - "Mode border accent: violet for agent, cyan for pipeline"

requirements-completed: [AGENT-LIST-UI, AGENT-FIRST-UNIFICATION]

duration: 8min
completed: 2026-03-22
---

# Phase 01 Plan 04: Agent List Page & API Layer Summary

**Agent API layer with 12 TanStack Query hooks, responsive card grid list page with tabs/search/filter, sidebar nav entry, and agent-first unification links in chat/search creation flows**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-22T17:04:41Z
- **Completed:** 2026-03-22T17:12:50Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Complete agent API layer with raw HTTP calls for CRUD, versioning, templates, and runs
- 12 TanStack Query hooks with proper cache invalidation via queryKeys.agents factory
- AgentListPage with card grid (3/2/1 responsive columns), tabs (All/My Agents/Templates), search, mode filter dropdown
- AgentCard with kebab dropdown menu (Edit, Duplicate, Delete, Export JSON)
- TemplateGallery with responsive grid and skeleton loading
- Sidebar nav entry with Workflow icon placed before Chat
- Agent-first unification: subtle "Create as Agent Workflow (Advanced)" links in both chat and search creation flows
- i18n strings for all 3 locales (en, vi, ja) with 28 agent-specific keys each

## Task Commits

Each task was committed atomically:

1. **Task 1: Create agent API layer and TanStack Query hooks** - `102f415` (feat)
2. **Task 2: Create AgentListPage with navigation, routing, i18n, and agent-first unification** - `7769260` (feat)

## Files Created/Modified
- `fe/src/features/agents/api/agentApi.ts` - Raw HTTP API calls for agent CRUD, versioning, templates, runs
- `fe/src/features/agents/api/agentQueries.ts` - 12 TanStack Query hooks wrapping agentApi
- `fe/src/features/agents/pages/AgentListPage.tsx` - Main agent list page with card grid, tabs, search, create dialog
- `fe/src/features/agents/components/AgentCard.tsx` - Agent card with mode/status badges and kebab menu
- `fe/src/features/agents/components/TemplateGallery.tsx` - Template picker grid with skeleton loading
- `fe/src/features/chat/components/CreateChatAssistantDialog.tsx` - Agent-first link for chat creation
- `fe/src/features/search/components/CreateSearchAppDialog.tsx` - Agent-first link for search creation
- `fe/src/app/App.tsx` - Added agent routes with lazy loading
- `fe/src/app/routeConfig.ts` - Added /agents and /agents/:id route metadata
- `fe/src/layouts/sidebarNav.ts` - Added Agents nav entry with Workflow icon
- `fe/src/i18n/locales/en.json` - Added nav.agents and agents.* keys
- `fe/src/i18n/locales/vi.json` - Added Vietnamese translations for all agent keys
- `fe/src/i18n/locales/ja.json` - Added Japanese translations for all agent keys

## Decisions Made
- Spread pattern for optional description to satisfy exactOptionalPropertyTypes TypeScript config
- Agent-first unification links implemented as separate component files (CreateChatAssistantDialog.tsx, CreateSearchAppDialog.tsx) rather than inline modifications to management pages
- AgentCanvasPage lazy import temporarily points to AgentListPage as placeholder until the canvas page is built in a later plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed api.get params option**
- **Found during:** Task 1 (agentApi.ts)
- **Issue:** api.get does not accept `{ params }` option - FetchOptions has no `params` property
- **Fix:** Built query string manually using URLSearchParams (matching projectApi pattern)
- **Files modified:** fe/src/features/agents/api/agentApi.ts
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 102f415 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript strict errors**
- **Found during:** Task 2 (AgentListPage, AgentCard)
- **Issue:** exactOptionalPropertyTypes rejected `string | undefined` for optional `description`; implicit `any` on event handlers
- **Fix:** Used spread pattern for optional fields; added explicit type annotations on event parameters
- **Files modified:** fe/src/features/agents/pages/AgentListPage.tsx, fe/src/features/agents/components/AgentCard.tsx
- **Verification:** TypeScript compiles cleanly
- **Committed in:** 7769260 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for TypeScript strict mode compliance. No scope creep.

## Issues Encountered
None beyond the TypeScript fixes documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Agent list page and API layer complete, ready for agent canvas page (Plan 05)
- Agent-first unification links in place, ready for canvas to handle ?mode=chat and ?mode=search params
- All i18n keys added, ready for future agent feature pages

---
*Phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge*
*Completed: 2026-03-22*
