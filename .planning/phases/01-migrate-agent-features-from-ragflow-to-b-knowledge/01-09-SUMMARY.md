---
phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
plan: 09
subsystem: agents
tags: [mcp, docker, sandbox, credentials, encryption, tavily, wikipedia, tools]

# Dependency graph
requires:
  - phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
    plan: 06
    provides: "Node executor dispatch table, agent Redis service, executor service"
provides:
  - "MCP client service for standardized tool calling via Model Context Protocol"
  - "Docker sandbox service for ephemeral code execution with resource limits"
  - "Encrypted tool credential service with agent/tenant fallback"
  - "Tool credential CRUD REST endpoints"
  - "BaseTool abstract class for extensible tool pattern"
  - "Tavily web search tool implementation"
  - "Wikipedia article search tool implementation"
affects: [agent-execution, tool-management, code-execution]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk", "dockerode", "@types/dockerode"]
  patterns: ["MCP connection pooling", "ephemeral Docker sandbox", "encrypt-at-rest credentials", "BaseTool abstract pattern"]

key-files:
  created:
    - be/src/modules/agents/services/agent-mcp.service.ts
    - be/src/modules/agents/services/agent-sandbox.service.ts
    - be/src/modules/agents/services/agent-tool-credential.service.ts
    - be/src/modules/agents/controllers/agent-tool.controller.ts
    - advance-rag/rag/agent/tools/__init__.py
    - advance-rag/rag/agent/tools/base_tool.py
    - advance-rag/rag/agent/tools/tavily_tool.py
    - advance-rag/rag/agent/tools/wikipedia_tool.py
  modified:
    - be/src/modules/agents/routes/agent.routes.ts
    - be/src/modules/agents/schemas/agent.schemas.ts
    - be/src/modules/agents/index.ts
    - be/package.json
    - advance-rag/rag/agent/node_executor.py

key-decisions:
  - "MCP connection pool at service level keyed by server URL"
  - "Docker sandbox uses tmpfs /tmp mount for languages needing temp files with read-only rootfs"
  - "Tool credential lookup uses agent-specific first, tenant-level fallback"
  - "Tavily credentials injected via config.credentials by Node.js orchestrator"

patterns-established:
  - "BaseTool ABC: all tools extend with execute(input_data, config, credentials)"
  - "Tool credential sanitization: strip encrypted_credentials from all API responses"

requirements-completed: [AGENT-MCP-SANDBOX-TOOLS]

# Metrics
duration: 6min
completed: 2026-03-22
---

# Phase 01 Plan 09: MCP, Sandbox, Tool Credentials, and Tool Implementations Summary

**MCP client with connection pooling, Docker sandbox with 256MB/no-network isolation, encrypted tool credentials with CRUD endpoints, and Tavily/Wikipedia tool implementations using BaseTool ABC pattern**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-22T17:35:58Z
- **Completed:** 2026-03-22T17:42:00Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- MCP service with connect/listTools/callTool/disconnect lifecycle and connection pooling
- Docker sandbox with ephemeral containers: 256MB memory, 1 CPU, no network, read-only rootfs, auto-remove
- Tool credential service with AES-256-CBC encryption via CryptoService, agent-specific and tenant-level fallback
- REST endpoints for credential CRUD under /api/agents/tools/credentials
- BaseTool abstract class providing extensible pattern for all 23+ agent tools
- Tavily and Wikipedia tools with real HTTP API implementations replacing stubs in node_executor.py

## Task Commits

Each task was committed atomically:

1. **Task 1: Create MCP service, sandbox service, and tool credential service** - `3a9665e` (feat)
2. **Task 2: Implement Python tool base class, Tavily, and Wikipedia tools** - `4f1e268` (feat)

## Files Created/Modified
- `be/src/modules/agents/services/agent-mcp.service.ts` - MCP client with connection pooling and timeout-guarded tool calls
- `be/src/modules/agents/services/agent-sandbox.service.ts` - Docker sandbox for ephemeral code execution
- `be/src/modules/agents/services/agent-tool-credential.service.ts` - Encrypted credential CRUD with agent/tenant fallback
- `be/src/modules/agents/controllers/agent-tool.controller.ts` - REST handlers for credential management
- `be/src/modules/agents/routes/agent.routes.ts` - Added /tools/credentials routes before /:id
- `be/src/modules/agents/schemas/agent.schemas.ts` - Added createCredentialSchema, updateCredentialSchema
- `be/src/modules/agents/index.ts` - Barrel exports for new services
- `be/package.json` - Added @modelcontextprotocol/sdk, dockerode, @types/dockerode
- `advance-rag/rag/agent/tools/__init__.py` - Package init with tool exports
- `advance-rag/rag/agent/tools/base_tool.py` - Abstract base class for all tools
- `advance-rag/rag/agent/tools/tavily_tool.py` - Tavily web search implementation
- `advance-rag/rag/agent/tools/wikipedia_tool.py` - Wikipedia article search implementation
- `advance-rag/rag/agent/node_executor.py` - Updated tavily/wikipedia handlers to use real tools

## Decisions Made
- MCP connection pool at service level keyed by server URL for client reuse
- Docker sandbox uses tmpfs /tmp mount since read-only rootfs prevents temp file creation
- Tool credential lookup uses agent-specific override first, then tenant-level fallback
- Tavily credentials injected via config.credentials dict by the Node.js orchestrator
- McpTool interface uses `string | undefined` (not optional) for exactOptionalPropertyTypes compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript exactOptionalPropertyTypes compatibility**
- **Found during:** Task 1
- **Issue:** MCP SDK transport type and McpTool interface incompatible with exactOptionalPropertyTypes
- **Fix:** Cast transport via Parameters<> type helper; used `string | undefined` instead of optional `?` on McpTool
- **Files modified:** be/src/modules/agents/services/agent-mcp.service.ts
- **Committed in:** 3a9665e (Task 1 commit)

**2. [Rule 1 - Bug] Fixed controller request property access patterns**
- **Found during:** Task 1
- **Issue:** Used req.tenantId/req.userId which don't exist on Express Request type
- **Fix:** Used getTenantId(req) helper and req.user?.id matching existing controller patterns
- **Files modified:** be/src/modules/agents/controllers/agent-tool.controller.ts
- **Committed in:** 3a9665e (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the type compatibility issues documented above.

## User Setup Required
None - no external service configuration required. Docker and MCP servers are runtime dependencies.

## Next Phase Readiness
- All 9 core agent plans complete
- MCP, sandbox, and credential services ready for Plan 10 (if applicable) or integration testing
- BaseTool pattern ready for implementing remaining 21+ external tools
- Tool credential endpoints ready for frontend integration

## Self-Check: PASSED

All 8 created files verified on disk. Both commit hashes (3a9665e, 4f1e268) found in git log.

---
*Phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge*
*Completed: 2026-03-22*
