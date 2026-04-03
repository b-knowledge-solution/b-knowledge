---
phase: 4
plan: 6
title: "Code Tab UI Redesign with Git/ZIP Sources"
subsystem: projects
tags: [frontend, backend, ui-redesign, code-import, ide-style]
dependency_graph:
  requires: ["04-04", "04-05"]
  provides: ["import-git-endpoint", "import-zip-endpoint", "code-tab-ide-layout"]
  affects: ["projects-module", "code-graph-feature"]
tech_stack:
  added: ["adm-zip"]
  patterns: ["execFileNoThrow-safe-subprocess", "ide-style-dark-sidebar", "pipeline-status-polling"]
key_files:
  created:
    - be/src/shared/utils/execFileNoThrow.ts
    - fe/src/features/projects/components/CodeSourcePanel.tsx
    - fe/src/features/projects/components/PipelineStatusBar.tsx
  modified:
    - be/src/modules/projects/routes/projects.routes.ts
    - be/src/modules/projects/controllers/projects.controller.ts
    - be/src/modules/projects/services/project-category.service.ts
    - be/src/modules/projects/schemas/projects.schemas.ts
    - be/package.json
    - fe/src/features/projects/components/CodeTabRedesigned.tsx
    - fe/src/features/projects/api/projectApi.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json
decisions:
  - "adm-zip chosen for ZIP extraction (pure JS, no native deps)"
  - "execFileNoThrow created in shared/utils for safe subprocess execution"
  - "PipelineStatusBar uses polling via syncVersionParserStatus instead of socket events (no socket event pattern exists for pipeline status)"
  - "CodeGraphPanel always visible (not collapsible) per plan requirements"
metrics:
  duration: "13min"
  completed: "2026-04-01"
---

# Phase 4 Plan 6: Code Tab UI Redesign with Git/ZIP Sources Summary

Two BE endpoints for Git clone and ZIP upload import into code categories, with IDE-style Code tab redesign featuring dark sidebar, monospace fonts, terminal pipeline status bar, and first-class code graph panel.

## What Was Done

### Task 1: BE Import Endpoints (Git Clone + ZIP Upload)

- Added `importGitSchema` Zod validation for git repo URL, branch, path
- Created `importGitRepo()` service method: shallow clones repo, filters by 17 code extensions, uploads each file to S3, creates File + Document records, queues parsing
- Created `importZipFile()` service method: extracts ZIP with adm-zip, same file processing pipeline
- Created `execFileNoThrow` utility in `shared/utils/` for shell-injection-safe subprocess execution
- Added controller methods returning 202 Accepted with taskId and fileCount
- Registered `POST /:id/categories/:catId/import-git` and `POST /:id/categories/:catId/import-zip` routes
- Installed `adm-zip` and `@types/adm-zip` in BE workspace

### Task 2: FE Code Tab Redesign

- Created `CodeSourcePanel.tsx`: dual-tab panel (Git Clone / ZIP Upload) with IDE dark aesthetic, monospace URL inputs, emerald green action buttons, drag-and-drop ZIP zone
- Created `PipelineStatusBar.tsx`: terminal-style horizontal status bar with parsing/graph/embedding stages, polling-based real-time updates, colored status indicators
- Redesigned `CodeTabRedesigned.tsx`: dark `bg-slate-900` sidebar with `font-mono`, `>` prefix for active category, stacked content area (CodeSourcePanel -> PipelineStatusBar -> DocumentListPanel -> CodeGraphPanel)
- Removed Collapsible wrapper from CodeGraphPanel -- now always visible as first-class citizen
- Added `importGitRepo()` and `importZipFile()` API functions in projectApi.ts
- Added 17 i18n keys in all 3 locales (en/vi/ja) for source import and pipeline status

### Task 3: Checkpoint (Human Verify)

Awaiting human verification of the IDE-style layout and import functionality.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2089258 | BE import endpoints for Git clone and ZIP upload |
| 2 | 550e3c5 | FE Code tab IDE-style redesign with source import |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created execFileNoThrow utility**
- **Found during:** Task 1
- **Issue:** The plan referenced `be/src/utils/execFileNoThrow.ts` but the file did not exist
- **Fix:** Created `be/src/shared/utils/execFileNoThrow.ts` (in shared/utils per BE conventions)
- **Files created:** `be/src/shared/utils/execFileNoThrow.ts`
- **Commit:** 2089258

**2. [Rule 3 - Blocking] PipelineStatusBar uses polling instead of socket events**
- **Found during:** Task 2
- **Issue:** The plan specified `useSocketEvent` for real-time updates, but no `useSocketEvent` hook exists in `fe/src/lib/socket.ts` and no socket events exist for pipeline status
- **Fix:** Used polling via `syncVersionParserStatus` API with 5-second interval instead
- **Files created:** `fe/src/features/projects/components/PipelineStatusBar.tsx`
- **Commit:** 550e3c5

## Known Stubs

None -- all data flows are wired to real API endpoints.

## Self-Check: PENDING (checkpoint not yet passed)
