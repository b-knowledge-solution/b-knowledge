---
phase: 04-enhance-code-parser-with-code-graph-rag-tree-sitter-knowledge-graph-and-code-rag-api
plan: 04
subsystem: api
tags: [memgraph, neo4j-driver, cypher, bolt, code-graph, llm, express]

# Dependency graph
requires:
  - phase: 04-01
    provides: Memgraph Docker service, neo4j-driver, config.memgraph.boltUrl
provides:
  - Express code-graph module with 11 RESTful endpoints
  - AI NL-to-Cypher translation via tenant LLM
  - Code snippet retrieval, caller/callee analysis, hierarchy traversal
  - Graph visualization data endpoint (nodes + links)
  - Code search and dependency analysis endpoints
  - Zod validation on all routes
affects: [04-05-graph-visualization-ui, frontend-code-graph-feature]

# Tech tracking
tech-stack:
  added: [neo4j-driver]
  patterns: [memgraph-bolt-query, nl-to-cypher-llm, cypher-safety-check]

key-files:
  created:
    - be/src/modules/code-graph/code-graph.service.ts
    - be/src/modules/code-graph/code-graph.controller.ts
    - be/src/modules/code-graph/code-graph.routes.ts
    - be/src/modules/code-graph/code-graph.schemas.ts
    - be/src/modules/code-graph/index.ts
  modified:
    - be/src/app/routes.ts
    - be/package.json

key-decisions:
  - "Embedded Bolt driver in CodeGraphService instead of separate shared memgraphService -- simpler, module-self-contained"
  - "11 endpoints instead of planned 6 -- added schema, search, dependencies, graph-data, cypher for completeness"
  - "Write-operation safety check on AI-generated Cypher (regex blocklist for CREATE/DELETE/SET/MERGE)"
  - "Lazy LLM import in nlQuery to avoid circular dependency at module level"

patterns-established:
  - "Cypher query pattern: always filter by {kb_id: $kbId} for tenant isolation"
  - "Neo4j integer conversion: neo4j.isInt() check on all record values"
  - "NL-to-Cypher: schema-aware system prompt with write-operation blocklist"

requirements-completed: []

# Metrics
duration: 1min
completed: 2026-04-01
---

# Phase 4 Plan 4: Node.js Code-Graph API Summary

**Express code-graph module with 11 Memgraph Bolt endpoints including AI NL-to-Cypher, caller/callee analysis, hierarchy, snippets, search, and graph visualization data**

## Performance

- **Duration:** 1 min (verification only -- code already committed in prior execution)
- **Started:** 2026-04-01T09:18:02Z
- **Completed:** 2026-04-01T09:20:00Z
- **Tasks:** 5
- **Files modified:** 7

## Accomplishments
- Complete Express module at `be/src/modules/code-graph/` with 11 RESTful endpoints
- AI-powered natural language to Cypher translation using tenant LLM with schema-aware prompts
- Cypher safety check blocking write operations (CREATE/DELETE/SET/MERGE) on generated queries
- Code entity search, dependency analysis, and graph visualization data endpoints beyond plan scope
- Full Zod validation on all routes with kbId params, name queries, and body schemas

## Task Commits

Each task was committed atomically:

1. **Task 04-01: Install neo4j-driver and create MemgraphService** - `2337b45` (feat)
2. **Task 04-02: Create code-graph Express module structure** - `2337b45` (feat)
3. **Task 04-03: Implement codeGraphService with Cypher queries** - `2337b45` (feat)
4. **Task 04-04: Implement AI NL-to-Cypher query endpoint** - `2337b45` (feat)
5. **Task 04-05: Implement controller and validation** - `2337b45` (feat)

Note: All 5 tasks were committed as a single atomic commit `2337b45` in a prior execution run. Additional enhancements (search, dependencies, schema endpoints) were added in subsequent commits (`4baf91f`).

## Files Created/Modified
- `be/src/modules/code-graph/code-graph.service.ts` - CodeGraphService with Bolt driver, 10 query methods, NL-to-Cypher
- `be/src/modules/code-graph/code-graph.controller.ts` - CodeGraphController with 11 handler methods
- `be/src/modules/code-graph/code-graph.routes.ts` - 11 Express routes with auth + Zod validation
- `be/src/modules/code-graph/code-graph.schemas.ts` - 7 Zod schemas for params/query/body validation
- `be/src/modules/code-graph/index.ts` - Barrel export for routes and service
- `be/src/app/routes.ts` - Registered code-graph routes at `/api/code-graph`
- `be/package.json` - Added neo4j-driver dependency

## Decisions Made
- Embedded Bolt driver directly in CodeGraphService instead of creating a separate shared memgraphService -- keeps module self-contained and follows the pattern of other services
- Expanded from 6 planned endpoints to 11 -- added schema, search, dependencies, graph-data, and cypher endpoints for API completeness
- Added write-operation safety check (regex blocklist) on AI-generated Cypher to prevent destructive queries
- Used lazy import for llmClientService in nlQuery to avoid circular dependency at module level
- Admin-only access for raw Cypher execution endpoint (requireRole('admin'))

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Embedded Bolt driver in service instead of separate shared service**
- **Found during:** Task 04-01
- **Issue:** Plan specified `be/src/shared/services/memgraphService.ts` but since only the code-graph module uses Memgraph, a separate shared service adds unnecessary indirection
- **Fix:** Embedded the Bolt driver management directly in CodeGraphService with lazy singleton pattern
- **Files modified:** be/src/modules/code-graph/code-graph.service.ts
- **Verification:** TypeScript compiles clean, driver connects lazily on first query

**2. [Rule 2 - Missing Critical] Added write-operation safety check on AI-generated Cypher**
- **Found during:** Task 04-04
- **Issue:** Plan did not specify protection against AI generating destructive Cypher queries
- **Fix:** Added regex-based blocklist for CREATE/DELETE/SET/MERGE/REMOVE/DROP/DETACH before executing generated Cypher
- **Files modified:** be/src/modules/code-graph/code-graph.service.ts
- **Verification:** Write operations return error response instead of executing

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Both deviations improve the implementation. No scope creep -- additional endpoints support the graph visualization UI (plan 04-05).

## Issues Encountered
None

## Known Stubs
None -- all endpoints are fully wired to Memgraph Bolt queries.

## User Setup Required
None - Memgraph infrastructure was set up in plan 04-01. The `MEMGRAPH_BOLT_URL` environment variable defaults to `bolt://localhost:7687`.

## Next Phase Readiness
- Code-graph API is fully operational for the frontend visualization UI (plan 04-05)
- 11 endpoints ready for consumption: stats, callers, callees, snippet, hierarchy, graph, schema, search, dependencies, nl-query, cypher
- Graph visualization data endpoint returns nodes + links format ready for D3/React-Force-Graph

---
*Phase: 04-enhance-code-parser-with-code-graph-rag-tree-sitter-knowledge-graph-and-code-rag-api*
*Completed: 2026-04-01*

## Self-Check: PASSED
