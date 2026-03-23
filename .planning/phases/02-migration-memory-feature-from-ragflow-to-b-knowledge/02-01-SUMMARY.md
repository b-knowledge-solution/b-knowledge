---
phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge
plan: 01
subsystem: database, api
tags: [knex, zod, postgresql, memory, bitmask, extraction-prompts]

requires:
  - phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
    provides: BaseModel pattern, ModelFactory singleton, agent model reference
provides:
  - memories table migration with 20+ columns
  - MemoryModel in ModelFactory for CRUD operations
  - Zod validation schemas for create/update/query
  - Extraction prompt templates for 4 memory types + ranking
  - FE Memory/MemoryMessage type contracts
affects: [02-02, 02-03, 02-04, 02-05, memory-service, memory-routes, memory-ui]

tech-stack:
  added: []
  patterns: [bitmask memory type selection, multi-scope ownership (user/agent/team)]

key-files:
  created:
    - be/src/shared/db/migrations/20260323100000_create_memories.ts
    - be/src/modules/memory/models/memory.model.ts
    - be/src/modules/memory/schemas/memory.schemas.ts
    - be/src/modules/memory/prompts/extraction.prompts.ts
    - be/src/modules/memory/index.ts
    - fe/src/features/memory/types/memory.types.ts
    - fe/src/features/memory/index.ts
  modified:
    - be/src/shared/models/factory.ts

key-decisions:
  - "Bitmask system for memory types (RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8) enables flexible per-pool type selection"
  - "CHECK constraints on storage_type, extraction_mode, permission, scope_type for data integrity"
  - "PromptTemplate interface with system+user pair and {{conversation}} placeholder for all extraction prompts"

patterns-established:
  - "Memory bitmask pattern: hasMemoryType(bitmask, type) for checking enabled types"
  - "Multi-scope ownership: scope_type + scope_id pattern for user/agent/team memory pools"

requirements-completed: [MEM-SCHEMA, MEM-FE-TYPES]

duration: 3min
completed: 2026-03-23
---

# Phase 02 Plan 01: Memory Foundation Schema and Types Summary

**Memory pool database schema with bitmask type system, Knex model in ModelFactory, Zod validation, RAGFlow extraction prompts, and FE type contracts**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T03:54:11Z
- **Completed:** 2026-03-23T03:57:35Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created memories table migration with all columns per D-01 through D-14 research spec
- Registered MemoryModel in ModelFactory singleton with tenant, scope, and creator queries
- Ported RAGFlow extraction prompts for all 4 memory types plus ranking prompt
- Established FE type contracts with bitmask constants and hasMemoryType helper

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration + Knex model + Zod schemas + prompts** - `9cf6758` (feat)
2. **Task 2: Frontend TypeScript types and barrel export** - `a3b052d` (feat)

## Files Created/Modified
- `be/src/shared/db/migrations/20260323100000_create_memories.ts` - Memories table with 20+ columns, CHECK constraints, and indexes
- `be/src/modules/memory/models/memory.model.ts` - Memory interface + MemoryModel with findByTenant/findByScope/findByCreator
- `be/src/modules/memory/schemas/memory.schemas.ts` - Zod schemas for create, update, query with inferred DTO types
- `be/src/modules/memory/prompts/extraction.prompts.ts` - 5 prompt templates (semantic, episodic, procedural, raw, ranking)
- `be/src/modules/memory/index.ts` - Barrel export for memory module
- `be/src/shared/models/factory.ts` - Added MemoryModel import and lazy getter
- `fe/src/features/memory/types/memory.types.ts` - Memory, MemoryMessage interfaces, bitmask constants, DTOs, helper
- `fe/src/features/memory/index.ts` - Barrel export for memory feature

## Decisions Made
- Bitmask system (1/2/4/8) for memory types enables flexible per-pool type selection via bitwise OR
- CHECK constraints on enum-like string columns for database-level data integrity
- PromptTemplate interface standardizes system+user prompt pair with placeholder tokens
- FE dates as ISO strings (not Date objects) following existing agent types pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Memory foundation types ready for service layer (Plan 02-02)
- MemoryModel accessible via ModelFactory.memory for all downstream consumers
- FE types ready for API layer and UI components

---
*Phase: 02-migration-memory-feature-from-ragflow-to-b-knowledge*
*Completed: 2026-03-23*
