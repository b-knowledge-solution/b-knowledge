---
phase: 02-access-control
plan: 01
subsystem: database
tags: [multi-tenant, abac, opensearch, knex, migration, config]

requires:
  - phase: 01-migration-stabilization
    provides: Initial schema with tenant, user_tenant, knowledgebase, document, audit_logs tables
provides:
  - Centralized SYSTEM_TENANT_ID config access (config.opensearch.systemTenantId)
  - getIndexName(tenantId?) for per-org OpenSearch index resolution
  - Multi-org tenant table with display_name, description, settings
  - ABAC policy_rules JSONB on knowledgebase table
  - Document-level policy_overrides JSONB on document table
  - platform_policies table for super-admin managed policies
  - Tenant-scoped audit_logs with tenant_id column
  - Unique constraint on user_tenant (user_id, tenant_id)
affects: [02-access-control, 03-data-studio]

tech-stack:
  added: []
  patterns: [config-centralized-tenant-id, optional-tenantId-parameter]

key-files:
  created:
    - be/src/shared/db/migrations/20260318131728_access_control_schema.ts
  modified:
    - be/src/shared/db/seeds/02_model_providers.ts
    - be/src/modules/rag/services/rag-search.service.ts
    - be/src/modules/rag/services/rag-sql.service.ts
    - be/src/modules/rag/services/rag-graphrag.service.ts
    - be/src/modules/rag/models/rag-file.model.ts
    - be/src/modules/rag/models/rag-document.model.ts
    - be/src/modules/rag/models/knowledgebase.model.ts
    - fe/e2e/helpers/opensearch.helper.ts

key-decisions:
  - "Migration uses process.env directly (not config import) since migrations are standalone scripts that must work without full app context"
  - "user_tenant unique constraint via raw SQL for compatibility with existing text-type columns"
  - "Backfill inserts user_tenant rows only for users without existing mapping to avoid duplicates"

patterns-established:
  - "Config-centralized tenant ID: All backend code uses config.opensearch.systemTenantId instead of process.env"
  - "Optional tenantId parameter: getIndexName(tenantId?) enables future per-org index resolution"

requirements-completed: [ACCS-01]

duration: 4min
completed: 2026-03-18
---

# Phase 2 Plan 01: Config Consolidation + Access Control Schema Summary

**Centralized SYSTEM_TENANT_ID into config across 6 backend files and created multi-org ABAC schema migration with policy storage on knowledgebases, documents, and platform-level policies table**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T13:15:13Z
- **Completed:** 2026-03-18T13:19:21Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Eliminated all process.env SYSTEM_TENANT_ID reads from backend source (excluding config itself and immutable migrations)
- Refactored getIndexName() to accept optional tenantId parameter for future multi-org OpenSearch index resolution
- Created comprehensive database migration adding tenant evolution columns, ABAC policy storage, platform_policies table, and tenant-scoped audit logs
- Backfill logic ensures existing users and audit_logs are associated with the system tenant

## Task Commits

Each task was committed atomically:

1. **Task 1: Consolidate SYSTEM_TENANT_ID process.env reads** - `0a97ed7` (refactor)
2. **Task 2: Create access control schema migration** - `87c8d40` (feat)

## Files Created/Modified
- `be/src/shared/db/migrations/20260318131728_access_control_schema.ts` - Multi-org ABAC schema migration
- `be/src/shared/db/seeds/02_model_providers.ts` - Uses config.opensearch.systemTenantId
- `be/src/modules/rag/services/rag-search.service.ts` - getIndexName(tenantId?) with optional param
- `be/src/modules/rag/services/rag-sql.service.ts` - Uses config for tenant ID and OpenSearch connection
- `be/src/modules/rag/services/rag-graphrag.service.ts` - Uses config for tenant ID and OpenSearch connection
- `be/src/modules/rag/models/rag-file.model.ts` - Uses config.opensearch.systemTenantId
- `be/src/modules/rag/models/rag-document.model.ts` - Uses config.opensearch.systemTenantId
- `be/src/modules/rag/models/knowledgebase.model.ts` - Uses config.opensearch.systemTenantId
- `fe/e2e/helpers/opensearch.helper.ts` - Added env-direct comment, kept process.env (test helper)

## Decisions Made
- Migration file uses process.env directly rather than importing config, since migrations are standalone scripts that run outside the full application context
- Used raw SQL for user_tenant unique constraint because Knex schema builder does not support adding unique constraints to existing text columns cleanly
- Backfill query uses LEFT JOIN to only insert user_tenant rows for users missing a system tenant mapping

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Database schema is ready for RBAC/ABAC feature implementation
- Config consolidation enables clean multi-org tenant resolution
- Next plans can build CASL ability definitions, middleware, and OpenSearch ABAC query filters

---
*Phase: 02-access-control*
*Completed: 2026-03-18*
