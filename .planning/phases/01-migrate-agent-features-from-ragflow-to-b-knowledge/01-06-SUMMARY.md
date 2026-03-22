---
phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
plan: 06
subsystem: api
tags: [redis-streams, topological-sort, sse, agent-execution, python-worker]

# Dependency graph
requires:
  - phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
    plan: 03
    provides: Agent CRUD controller, routes, schemas, and models
provides:
  - Agent graph executor with Kahn's topological sort and cycle detection
  - Redis Streams dispatch from Node.js to Python worker
  - SSE streaming for agent run output
  - Run lifecycle endpoints (run, stream, cancel, listRuns)
  - Python agent consumer with 30+ operator type handlers
affects: [01-07, 01-08, 01-09]

# Tech tracking
tech-stack:
  added: []
  patterns: [hybrid-execution-engine, redis-streams-dispatch, kahn-topological-sort, inline-vs-dispatch-node-classification]

key-files:
  created:
    - be/src/modules/agents/services/agent-executor.service.ts
    - be/src/modules/agents/services/agent-redis.service.ts
    - advance-rag/rag/agent/__init__.py
    - advance-rag/rag/agent/agent_consumer.py
    - advance-rag/rag/agent/node_executor.py
  modified:
    - be/src/modules/agents/controllers/agent.controller.ts
    - be/src/modules/agents/routes/agent.routes.ts
    - be/src/modules/agents/schemas/agent.schemas.ts
    - be/src/modules/agents/index.ts

key-decisions:
  - "Inline vs dispatch classification: begin/answer/switch/condition/merge/template/keyword_extract run in Node.js; LLM/retrieval/code/tools dispatched to Python"
  - "Per-node result channels via Redis pub/sub for orchestrator to wait on dispatched results"
  - "5-minute per-node timeout and configurable max_execution_time from DSL settings"
  - "Loop-back edges excluded from DAG cycle detection to allow loop operator"

patterns-established:
  - "Hybrid execution: Node.js graph traversal + Python compute via Redis Streams"
  - "INLINE_NODE_TYPES/DISPATCH_NODE_TYPES sets for node classification"
  - "NODE_HANDLERS dispatch table pattern for Python node execution"

requirements-completed: [AGENT-EXECUTION-ENGINE]

# Metrics
duration: 8min
completed: 2026-03-22
---

# Phase 01 Plan 06: Agent Execution Engine Summary

**Hybrid Node.js/Python execution engine with Kahn's topological sort, Redis Streams dispatch, SSE streaming, and 30+ operator type handlers**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-22T17:15:12Z
- **Completed:** 2026-03-22T17:23:12Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Graph executor with Kahn's topological sort, cycle detection, loop-back edge handling, and execution timeout
- Redis Streams dispatch service following existing rag-redis.service.ts patterns (XADD/XREADGROUP/pub-sub)
- SSE streaming endpoint forwarding Redis pub/sub events to browser clients
- 4 new agent endpoints: POST run, GET stream, POST cancel, GET listRuns
- Python agent consumer with NODE_HANDLERS dispatch table covering all 30+ operator types

## Task Commits

Each task was committed atomically:

1. **Task 1: Create graph executor core and Redis dispatch service** - `3d097f9` (feat)
2. **Task 2: Add run/stream/cancel/listRuns endpoints to controller and routes** - `5a1aba3` (feat)
3. **Task 3: Create Python agent consumer and node executor** - `2978a1c` (feat)

## Files Created/Modified
- `be/src/modules/agents/services/agent-executor.service.ts` - Graph orchestration engine with topological sort, inline/dispatch execution
- `be/src/modules/agents/services/agent-redis.service.ts` - Redis Streams dispatch and pub/sub for Python worker communication
- `be/src/modules/agents/controllers/agent.controller.ts` - Added runAgent, streamAgent, cancelRun, listRuns methods
- `be/src/modules/agents/routes/agent.routes.ts` - Added execution routes (run, stream, cancel, runs)
- `be/src/modules/agents/schemas/agent.schemas.ts` - Added agentRunBodySchema and agentRunIdParamSchema
- `be/src/modules/agents/index.ts` - Added barrel exports for executor and Redis services
- `advance-rag/rag/agent/__init__.py` - Package init for agent execution module
- `advance-rag/rag/agent/agent_consumer.py` - Redis Streams consumer loop with XREADGROUP
- `advance-rag/rag/agent/node_executor.py` - Node type dispatch table with 30+ handlers

## Decisions Made
- Inline vs dispatch node classification: lightweight logic nodes (begin, answer, switch, condition, merge, template, keyword_extract, note, concentrator, message) execute in Node.js; compute-heavy nodes (generate, retrieval, code, all tool types) dispatch to Python
- Per-node Redis pub/sub channels for result delivery (orchestrator subscribes, waits for each dispatched node)
- 5-minute per-node timeout to prevent indefinite hangs on Python side
- Loop-back edges (sourceHandle='loop_back') excluded from DAG validation to allow loop operator without false cycle detection
- ModelFactory uses singular accessor names (agent, agentRun, agentRunStep) matching existing factory pattern

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ModelFactory accessor names**
- **Found during:** Task 1 (agent-executor.service.ts)
- **Issue:** Used plural names (ModelFactory.agents) but factory uses singular (ModelFactory.agent)
- **Fix:** Changed all references to singular form matching existing factory pattern
- **Files modified:** be/src/modules/agents/services/agent-executor.service.ts
- **Committed in:** 3d097f9

**2. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes for runState**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `timeoutId: undefined` assignment violates exactOptionalPropertyTypes
- **Fix:** Used explicit type annotation with optional property instead of initialized-to-undefined
- **Files modified:** be/src/modules/agents/services/agent-executor.service.ts
- **Committed in:** 3d097f9

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes required for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Execution engine is functional but uses stub handlers in Python
- Plan 07 will wire LLM and retrieval handlers to existing infrastructure
- Plan 09 will add sandboxed code execution

---
*Phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge*
*Completed: 2026-03-22*
