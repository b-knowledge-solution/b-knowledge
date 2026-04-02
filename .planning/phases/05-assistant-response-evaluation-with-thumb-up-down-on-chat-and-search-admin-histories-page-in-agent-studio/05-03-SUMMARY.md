---
phase: 05-assistant-response-evaluation
plan: 03
subsystem: histories-feedback
tags: [admin-histories, feedback-indicators, agent-runs, csv-export, feedback-filter]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [histories-feedback-ui, agent-runs-tab, feedback-export]
  affects: [admin-history-service, histories-page, i18n]
tech_stack:
  added: []
  patterns: [feedback-enrichment-subqueries, read-only-feedback-display, csv-export-pattern]
key_files:
  created:
    - fe/src/features/histories/components/AdminAgentRunsDetailView.tsx
    - fe/src/features/histories/components/FeedbackExportButton.tsx
    - fe/tests/features/histories/FeedbackExportButton.test.tsx
  modified:
    - be/src/modules/admin/services/admin-history.service.ts
    - be/src/modules/admin/controllers/admin-history.controller.ts
    - be/src/modules/admin/routes/admin-history.routes.ts
    - be/tests/admin/admin-history.service.test.ts
    - fe/src/features/histories/types/histories.types.ts
    - fe/src/features/histories/api/historiesApi.ts
    - fe/src/features/histories/api/historiesQueries.ts
    - fe/src/features/histories/hooks/useHistoriesFilters.ts
    - fe/src/features/histories/components/AdminSessionListSidebar.tsx
    - fe/src/features/histories/components/AdminChatDetailView.tsx
    - fe/src/features/histories/components/AdminSearchDetailView.tsx
    - fe/src/features/histories/components/AdminFilterDialog.tsx
    - fe/src/features/histories/pages/HistoriesPage.tsx
    - fe/src/features/histories/index.ts
    - fe/src/lib/queryKeys.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json
decisions:
  - Agent run queries use db() directly since admin-history service aggregates across tables
  - Read-only feedback display per D-08 (no FeedbackCommentPopover in agent runs view)
  - feedbackFilter maps 'all' to empty string on API call (no backend filter)
  - CSV export uses client-side conversion from JSON array to avoid server-side streaming complexity
metrics:
  duration: 39min
  completed: 2026-03-31
  tasks: 3
  files: 21
---

# Phase 05 Plan 03: Admin Histories Feedback Enhancement Summary

Enriched admin Histories page with feedback count subqueries, Agent Runs tab, feedback filter dropdown, and CSV export button across BE service/controller/routes and FE types/API/hooks/components.

## Changes Made

### Task 1: BE Admin History Feedback Enrichment + Agent Runs Endpoint (3e57019)

**Service layer (`admin-history.service.ts`):**
- Added `positive_count` and `negative_count` feedback subqueries to `getChatHistory()` (both external and internal queries) and `getSearchHistory()` via `answer_feedback` table joins
- Added `applyFeedbackFilter()` private method supporting 4 filter modes: `positive` (EXISTS with thumbup=true), `negative` (EXISTS with thumbup=false), `any` (EXISTS), `none` (NOT EXISTS)
- Added `getAgentRunHistory()` method joining `agent_runs` with `agents` and `users` tables, including feedback count subqueries with `source='agent'`
- Added `getAgentRunDetails()` returning run record, execution steps, and feedback records

**Controller + Routes:**
- Added `parseFeedbackFilter()` validation on controller
- Added `getAgentRunHistory` and `getAgentRunDetails` controller methods
- Added `GET /api/admin/history/agent-runs` and `GET /api/admin/history/agent-runs/:runId` routes

**Tests:** 16 passing tests covering feedback enrichment, filter modes, agent run history, and agent run details.

### Task 2: FE Types/API/Hooks Updates (f0fe3ea)

- Extended `ChatSessionSummary` and `SearchSessionSummary` with `positive_count`/`negative_count`
- Added `AgentRunSessionSummary` and `ExternalAgentRunDetail` types
- Extended `HistoriesTab` to `'chat' | 'search' | 'agentRuns'`
- Added `feedbackFilter` to `FilterState`
- Added `fetchAgentRunHistory()`, `fetchAgentRunDetails()`, `exportFeedback()` API functions
- Added agent runs infinite query and details query to `useHistoriesData` hook
- Added `agentRunsInfinite` and `agentRunDetails` query keys
- Updated `useHistoriesFilters` to include feedbackFilter in `isFiltered` derivation

### Task 3: FE Histories Page UI (2ada2df)


- **AdminSessionListSidebar:** 3-tab switcher (Chat/Search/Agent Runs with Bot icon), feedback count badges (ThumbsUp green-500 / ThumbsDown red-500) on session cards, agent run items with status badges and duration
- **AdminChatDetailView/AdminSearchDetailView:** Read-only feedback indicators (thumb icon) with Collapsible comment display per message
- **AdminFilterDialog:** Feedback Select dropdown (All/Positive/Negative/Any/None) using shadcn Select component
- **AdminAgentRunsDetailView:** New component showing run input/output, execution steps, and read-only feedback records with collapsible comments. Does NOT import FeedbackCommentPopover (per D-08 read-only requirement)
- **FeedbackExportButton:** Outline button with Download icon, CSV conversion with field escaping, browser download trigger, loading spinner, error toast via sonner
- **HistoriesPage:** Updated to support 3 tabs, conditional rendering for agent runs, export button in top-right corner
- **i18n:** All keys added in 3 locales (en, vi with proper diacritics, ja with kanji/hiragana)
- **Tests:** FeedbackExportButton test suite (render, API call, CSV conversion, loading state, error toast)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all components are fully wired to backend APIs.

## Self-Check: PASSED

All artifacts verified: 6 key files exist, 3 commits found (3e57019, f0fe3ea, 2ada2df), all must-have patterns present in target files.
