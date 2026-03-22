---
phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
plan: 07
subsystem: agents
tags: [socket.io, sse, debug, reactflow, streaming, breakpoints]

requires:
  - phase: 01-05
    provides: ReactFlow canvas with node types and canvasStore
  - phase: 01-06
    provides: Agent executor service with graph traversal and SSE streaming
provides:
  - Debug mode service with step-by-step execution and breakpoints
  - Socket.IO agent:debug:step event pattern for real-time debug UI
  - SSE streaming hook (useAgentStream) for agent run output
  - Debug panel UI with step/continue/stop controls and JSON I/O inspection
  - Toolbar debug toggle wiring with conditional run/step/continue buttons
affects: [01-08, 01-09, 01-10]

tech-stack:
  added: []
  patterns: [socket.io-debug-events, sse-eventsource-hook, debug-panel-overlay]

key-files:
  created:
    - be/src/modules/agents/services/agent-debug.service.ts
    - be/src/modules/agents/controllers/agent-debug.controller.ts
    - fe/src/features/agents/hooks/useAgentStream.ts
    - fe/src/features/agents/hooks/useAgentDebug.ts
    - fe/src/features/agents/components/debug/DebugPanel.tsx
  modified:
    - be/src/modules/agents/routes/agent.routes.ts
    - be/src/modules/agents/index.ts
    - fe/src/features/agents/components/AgentToolbar.tsx
    - fe/src/features/agents/components/AgentCanvas.tsx

key-decisions:
  - "Debug mode executes all nodes inline (Python dispatch simulated) for interactive debugging"
  - "Debug state is ephemeral in-memory Map (not persisted) since debug runs are short-lived"
  - "continueRun executes first step unconditionally, then stops at breakpoints"

patterns-established:
  - "Socket.IO debug event pattern: agent:debug:step with run_id/node_id/status/input/output"
  - "useAgentDebug hook combines Socket.IO subscription with REST API control methods"
  - "Debug toggle in toolbar conditionally swaps Run button for Step/Continue buttons"

requirements-completed: [AGENT-DEBUG-MODE]

duration: 6min
completed: 2026-03-22
---

# Phase 01 Plan 07: Agent Debug Mode & Streaming Summary

**Step-by-step debug execution with Socket.IO events, breakpoints, SSE streaming hook, and debug panel UI**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-22T17:26:46Z
- **Completed:** 2026-03-22T17:33:09Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Debug service with startDebugRun, stepNext, continueRun, set/removeBreakpoint, getStepDetails
- Socket.IO agent:debug:step events for real-time node status updates (pending/running/completed/failed/skipped)
- SSE streaming hook (useAgentStream) with EventSource connection and delta accumulation
- DebugPanel with 360px fixed width, step/continue/stop controls, breakpoint indicators, progress bar, and collapsible JSON I/O
- Toolbar debug toggle switch with conditional Step/Continue buttons replacing Run button

## Task Commits

Each task was committed atomically:

1. **Task 1: Create debug service, controller, and SSE streaming endpoints** - `e941145` (feat)
2. **Task 2: Create DebugPanel, useAgentDebug, useAgentStream hooks, and wire toolbar** - `09991c3` (feat)

## Files Created/Modified
- `be/src/modules/agents/services/agent-debug.service.ts` - Debug service with step-by-step execution, breakpoints, Socket.IO events
- `be/src/modules/agents/controllers/agent-debug.controller.ts` - REST handlers for debug start/step/continue/breakpoint/inspect
- `be/src/modules/agents/routes/agent.routes.ts` - Debug routes under /:id/debug/* namespace
- `be/src/modules/agents/index.ts` - Barrel export with agentDebugService
- `fe/src/features/agents/hooks/useAgentStream.ts` - SSE streaming hook with EventSource
- `fe/src/features/agents/hooks/useAgentDebug.ts` - Socket.IO debug events hook with REST control methods
- `fe/src/features/agents/components/debug/DebugPanel.tsx` - Step-by-step debug viewer panel
- `fe/src/features/agents/components/AgentToolbar.tsx` - Debug toggle switch, Step/Continue buttons
- `fe/src/features/agents/components/AgentCanvas.tsx` - Debug status badge overlays on canvas nodes

## Decisions Made
- Debug mode executes all nodes inline (Python dispatch is simulated with placeholder output) for interactive debugging without requiring Python worker
- Debug state is ephemeral in-memory Map (not persisted to DB) since debug runs are interactive and short-lived
- continueRun executes the first step unconditionally, then stops at breakpoints to avoid immediate pause

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Debug mode is complete and wired into the toolbar and canvas
- SSE streaming hook ready for agent run output display
- Next plans can build on debug events for advanced features (run history, log export)

---
*Phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge*
*Completed: 2026-03-22*
