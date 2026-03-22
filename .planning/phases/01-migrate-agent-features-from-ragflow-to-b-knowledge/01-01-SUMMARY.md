---
phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge
plan: 01
subsystem: database
tags: [knex, postgresql, migrations, models, agents, jsonb, versioning, abac]

# Dependency graph
requires: []
provides:
  - agents table with JSONB DSL, versioning, ABAC policy_rules
  - agent_runs and agent_run_steps tables for execution logging
  - agent_tool_credentials table with encrypted credential storage
  - agent_templates table for pre-built workflow templates
  - 5 Knex models registered in ModelFactory singleton
  - Test stub directories for be, fe, and advance-rag
affects: [01-02, 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10]

# Tech tracking
tech-stack:
  added: []
  patterns: [agent-model-pattern, version-as-row-with-parent-id, jsonb-dsl-workflow-graph]

key-files:
  created:
    - be/src/shared/db/migrations/20260323000000_create_agents.ts
    - be/src/shared/db/migrations/20260323000001_create_agent_runs.ts
    - be/src/shared/db/migrations/20260323000002_create_agent_tool_credentials.ts
    - be/src/shared/db/migrations/20260323000003_create_agent_templates.ts
    - be/src/modules/agents/models/agent.model.ts
    - be/src/modules/agents/models/agent-run.model.ts
    - be/src/modules/agents/models/agent-run-step.model.ts
    - be/src/modules/agents/models/agent-template.model.ts
    - be/src/modules/agents/models/agent-tool-credential.model.ts
    - be/tests/agent/agent.model.test.ts
    - fe/tests/features/agent/agent.stub.test.ts
    - advance-rag/tests/test_agent_executor.py
  modified:
    - be/src/shared/models/factory.ts

key-decisions:
  - "Agent models follow existing BaseModel + ModelFactory singleton pattern for consistency"
  - "Version-as-row pattern (parent_id + version_number) matches existing dataset versioning approach"
  - "COALESCE-based unique index on tool credentials handles NULL agent_id for tenant defaults"

patterns-established:
  - "Agent module directory structure: be/src/modules/agents/models/ with 5 model files"
  - "Agent test stub directories: be/tests/agent/, fe/tests/features/agent/, advance-rag/tests/test_agent_executor.py"

requirements-completed: [AGENT-DATA-MODEL]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 01 Plan 01: Agent Data Model Summary

**5 PostgreSQL tables (agents, agent_runs, agent_run_steps, agent_tool_credentials, agent_templates) with Knex models, factory registration, and test stubs across all 3 workspaces**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22T16:58:29Z
- **Completed:** 2026-03-22T17:02:11Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Created 4 Knex migration files defining 5 database tables with proper indexes and foreign keys
- Created 5 model files extending BaseModel with typed interfaces and tenant-scoped query methods
- Registered all 5 agent models in ModelFactory as lazy-loaded singletons
- Established test stub directories for be, fe, and advance-rag per Wave 0 requirements

## Task Commits

Each task was committed atomically:

1. **Task 0: Create test stub directories and placeholder test files** - `4ce0369` (test)
2. **Task 1: Create database migrations for all agent tables** - `cdfdb09` (feat)
3. **Task 2: Create Knex models and register in ModelFactory** - `f3df459` (feat)

## Files Created/Modified
- `be/src/shared/db/migrations/20260323000000_create_agents.ts` - Agents table with JSONB DSL, versioning, ABAC
- `be/src/shared/db/migrations/20260323000001_create_agent_runs.ts` - Agent runs + steps tables for execution logging
- `be/src/shared/db/migrations/20260323000002_create_agent_tool_credentials.ts` - Encrypted tool credentials with unique constraint
- `be/src/shared/db/migrations/20260323000003_create_agent_templates.ts` - Pre-built workflow templates
- `be/src/modules/agents/models/agent.model.ts` - AgentModel with findByTenant, findVersions, findByProject
- `be/src/modules/agents/models/agent-run.model.ts` - AgentRunModel with findByAgent
- `be/src/modules/agents/models/agent-run-step.model.ts` - AgentRunStepModel with findByRun
- `be/src/modules/agents/models/agent-template.model.ts` - AgentTemplateModel with findByTenant, findSystemTemplates
- `be/src/modules/agents/models/agent-tool-credential.model.ts` - AgentToolCredentialModel with findByTenant, findByAgent, findTenantDefault
- `be/src/shared/models/factory.ts` - Added 5 agent model imports and lazy getters
- `be/tests/agent/agent.model.test.ts` - Test stubs for agent models
- `fe/tests/features/agent/agent.stub.test.ts` - Test stubs for agent UI feature
- `advance-rag/tests/test_agent_executor.py` - Test stubs for agent executor

## Decisions Made
- Agent models follow existing BaseModel + ModelFactory singleton pattern for consistency with the codebase
- Version-as-row pattern (parent_id + version_number) matches the existing dataset versioning approach
- COALESCE-based unique index on agent_tool_credentials handles NULL agent_id for tenant-level defaults

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Database schema foundation complete for all agent-related tables
- Models accessible via ModelFactory for service layer development in subsequent plans
- Test stub directories ready for population with real tests as features are implemented

## Self-Check: PASSED

All 12 created files verified. All 3 task commits verified (4ce0369, cdfdb09, f3df459).

---
*Phase: 01-migrate-agent-features-from-ragflow-to-b-knowledge*
*Completed: 2026-03-22*
