---
phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge
plan: 02
subsystem: api
tags: [opensearch, casl, memory, express, hybrid-search, fifo]

requires:
  - phase: 02-01
    provides: Memory model, migration, schemas, ModelFactory.memory

provides:
  - Memory pool CRUD service (memoryService singleton)
  - OpenSearch memory message service (memoryMessageService singleton)
  - Hybrid vector+text search for memory messages
  - FIFO forgetting policy enforcement
  - REST API at /api/memory with full CRUD + message management
  - CASL 'Memory' subject type with admin/leader manage permissions

affects: [02-03-extraction, 02-04-chat-integration, 02-05-frontend]

tech-stack:
  added: []
  patterns: [opensearch-per-tenant-index, fifo-size-enforcement, hybrid-knn-text-search]

key-files:
  created:
    - be/src/modules/memory/services/memory.service.ts
    - be/src/modules/memory/services/memory-message.service.ts
    - be/src/modules/memory/controllers/memory.controller.ts
    - be/src/modules/memory/routes/memory.routes.ts
  modified:
    - be/src/shared/services/ability.service.ts
    - be/src/modules/memory/index.ts
    - be/src/app/routes.ts

key-decisions:
  - "Spread pattern for optional DTO fields to satisfy exactOptionalPropertyTypes (consistent with prior decisions)"
  - "FIFO enforcement uses search-then-delete (not deleteByQuery with sort) because OpenSearch deleteByQuery does not support sort"
  - "Empty embedding vector in search controller as placeholder -- full embedding wired in extraction plan (02-03)"
  - "Index mapping cast to any for knn_vector fields -- OpenSearch client types too strict for knn_vector dimension/method"

patterns-established:
  - "memory_{tenantId} index naming for per-tenant OpenSearch isolation"
  - "indexCache Set for avoiding redundant OpenSearch index exists checks"

requirements-completed: [MEM-CRUD-API, MEM-MESSAGES]

duration: 6min
completed: 2026-03-23
---

# Phase 02 Plan 02: Memory Backend Services Summary

**Memory pool CRUD + OpenSearch message storage with hybrid vector+text search, FIFO forgetting, and ABAC-protected REST API at /api/memory**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T03:59:56Z
- **Completed:** 2026-03-23T04:05:27Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Memory pool CRUD service with tenant-scoped permission filtering (me/team visibility)
- OpenSearch message service with index lifecycle, hybrid search, FIFO enforcement, and status management
- Full REST API with 9 endpoints: pool CRUD (5), message listing, search, forget, delete
- CASL 'Memory' subject registered for admin and leader roles

## Task Commits

Each task was committed atomically:

1. **Task 1: Memory service + message service (OpenSearch)** - `674a393` (feat)
2. **Task 2: ABAC subject registration + controller + routes + route registration** - `dc3721a` (feat)

## Files Created/Modified

- `be/src/modules/memory/services/memory.service.ts` - Pool CRUD with tenant isolation and me/team filtering
- `be/src/modules/memory/services/memory-message.service.ts` - OpenSearch message CRUD, hybrid search, FIFO cleanup
- `be/src/modules/memory/controllers/memory.controller.ts` - Express request handlers for all memory endpoints
- `be/src/modules/memory/routes/memory.routes.ts` - Route definitions with requireAuth + requireTenant + requireAbility
- `be/src/modules/memory/index.ts` - Updated barrel exports with services, controller, routes
- `be/src/shared/services/ability.service.ts` - Added 'Memory' to Subjects type union and role grants
- `be/src/app/routes.ts` - Registered /api/memory route mount

## Decisions Made

- Spread pattern for optional DTO fields to satisfy exactOptionalPropertyTypes (consistent with Phase 02 Plan 02 prior decision)
- FIFO enforcement uses two-step search-then-delete because OpenSearch deleteByQuery does not support sort parameter
- Empty embedding vector in search controller as placeholder -- full embedding integration deferred to extraction plan (02-03)
- Index mapping cast to `any` for knn_vector fields due to overly strict OpenSearch client type definitions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed exactOptionalPropertyTypes incompatibility in createPool**
- **Found during:** Task 1
- **Issue:** Spreading DTO directly into ModelFactory.memory.create() caused type error because optional string fields could be `undefined` but Memory interface expects `string | null`
- **Fix:** Explicit spread pattern with conditional inclusion for optional fields
- **Files modified:** be/src/modules/memory/services/memory.service.ts
- **Committed in:** 674a393

**2. [Rule 1 - Bug] Fixed deleteByQuery sort parameter in FIFO enforcement**
- **Found during:** Task 1
- **Issue:** OpenSearch deleteByQuery API does not support `sort` parameter, causing compile error
- **Fix:** Two-step approach: search for oldest N message IDs, then deleteByQuery by IDs
- **Files modified:** be/src/modules/memory/services/memory-message.service.ts
- **Committed in:** 674a393

**3. [Rule 1 - Bug] Fixed OpenSearch index mapping type incompatibility**
- **Found during:** Task 1
- **Issue:** knn_vector property type not assignable to OpenSearch client Property type
- **Fix:** Cast mapping body to `any` when calling indices.create()
- **Files modified:** be/src/modules/memory/services/memory-message.service.ts
- **Committed in:** 674a393

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered

None beyond the type compatibility issues addressed above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Memory backend services fully operational, ready for extraction service (02-03) to wire embedding generation
- REST API ready for frontend integration (02-05)
- Chat integration plan (02-04) can import memoryService/memoryMessageService from barrel

---
*Phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge*
*Completed: 2026-03-23*
