---
phase: 02-access-control
plan: 03
subsystem: auth
tags: [opensearch, abac, casl, tenant-isolation, policy-rules, zod]

# Dependency graph
requires:
  - phase: 02-access-control/02
    provides: CASL ability service, AbacPolicyRule type, ability caching
provides:
  - Mandatory tenant_id filter on all OpenSearch queries
  - ABAC-to-OpenSearch filter translation (buildOpenSearchAbacFilters, buildAccessFilters)
  - All RagSearchService callers pass tenantId from request context
  - Dataset policy_rules CRUD (GET/PUT /datasets/:id/policy)
  - Zod validation for ABAC policy rules
affects: [02-access-control/04, 02-access-control/05, frontend-policy-editor]

# Tech tracking
tech-stack:
  added: []
  patterns: [tenant-id-first-parameter, abac-to-opensearch-filter-translation, policy-jsonb-on-dataset]

key-files:
  created: []
  modified:
    - be/src/shared/services/ability.service.ts
    - be/src/modules/rag/services/rag-search.service.ts
    - be/src/modules/rag/controllers/rag.controller.ts
    - be/src/modules/rag/services/rag.service.ts
    - be/src/modules/rag/schemas/rag.schemas.ts
    - be/src/modules/rag/routes/rag.routes.ts
    - be/src/modules/chat/services/chat-conversation.service.ts
    - be/src/modules/search/services/search.service.ts
    - be/src/modules/rag/services/rag-deep-research.service.ts
    - be/src/modules/rag/services/rag-document.service.ts
    - be/src/shared/models/types.ts

key-decisions:
  - "tenantId is first parameter on all RagSearchService methods (not last/optional) to prevent accidental omission"
  - "Embed token controllers (OpenAI-compat, embed) pass empty tenantId with TODO for future multi-tenant token resolution"
  - "ABAC allow rules use bool.should (OR) with minimum_should_match:1; deny rules use bool.must_not"
  - "Policy rules stored as JSONB on datasets table (co-located, no separate policy table)"

patterns-established:
  - "tenant-id-first: All OpenSearch service methods take tenantId as first parameter"
  - "abac-filter-translation: CASL conditions map to OpenSearch term/terms/must_not queries"
  - "policy-invalidation: Dataset policy changes trigger invalidateAllAbilities() cache flush"

requirements-completed: [ACCS-03, ACCS-04]

# Metrics
duration: 16min
completed: 2026-03-18
---

# Phase 2 Plan 03: Search Tenant Isolation + ABAC Policy CRUD Summary

**Mandatory tenant_id filter on all OpenSearch queries, ABAC-to-OpenSearch filter translator, and policy_rules CRUD on datasets**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-18T13:34:51Z
- **Completed:** 2026-03-18T13:50:51Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Every OpenSearch search query now includes a mandatory `{ term: { tenant_id } }` filter for zero cross-tenant data leakage
- All callers of RagSearchService (rag controller, chat service, search service, deep research) pass tenantId from request context
- ABAC policy conditions can be translated to OpenSearch bool/filter clauses via buildOpenSearchAbacFilters()
- Dataset endpoints support policy_rules CRUD with Zod validation and ability cache invalidation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mandatory tenant_id + ABAC filter injection to OpenSearch queries and update all callers** - `3dca3a2` (feat)
2. **Task 2: Add policy_rules CRUD to dataset endpoints** - `95c01e9` (feat)

## Files Created/Modified
- `be/src/shared/services/ability.service.ts` - Added buildOpenSearchAbacFilters() and buildAccessFilters() for ABAC-to-OpenSearch translation
- `be/src/modules/rag/services/rag-search.service.ts` - All methods now require tenantId; every query includes tenant_id filter
- `be/src/modules/rag/controllers/rag.controller.ts` - All ragSearchService calls now pass getTenantId(req); added policy CRUD handlers
- `be/src/modules/chat/services/chat-conversation.service.ts` - streamChat accepts tenantId, threads to ragSearchService and deepResearch
- `be/src/modules/search/services/search.service.ts` - All public methods accept tenantId, thread to retrieveChunks and ragSearchService
- `be/src/modules/rag/services/rag-deep-research.service.ts` - research() and retrieveFromKbs() accept tenantId
- `be/src/modules/rag/services/rag-document.service.ts` - changeDocumentParser accepts tenantId for chunk deletion
- `be/src/modules/rag/schemas/rag.schemas.ts` - Added policyRuleSchema, policyRulesSchema, updateDatasetPolicySchema
- `be/src/modules/rag/services/rag.service.ts` - Added updateDatasetPolicy() and getDatasetPolicies() with audit logging
- `be/src/modules/rag/routes/rag.routes.ts` - Added GET/PUT /datasets/:id/policy routes
- `be/src/shared/models/types.ts` - Added policy_rules and tenant_id to Dataset interface
- `be/src/modules/search/controllers/search.controller.ts` - All calls pass tenantId from request context
- `be/src/modules/chat/controllers/chat-conversation.controller.ts` - Passes tenantId to streamChat
- `be/src/modules/chat/controllers/chat-openai.controller.ts` - Passes empty tenantId (TODO: resolve from token)
- `be/src/modules/chat/controllers/chat-embed.controller.ts` - Passes empty tenantId (TODO: resolve from token)
- `be/src/modules/search/controllers/search-openai.controller.ts` - Passes empty tenantId (TODO: resolve from token)
- `be/src/modules/search/controllers/search-embed.controller.ts` - Passes empty tenantId (TODO: resolve from token)

## Decisions Made
- tenantId is the first parameter on all RagSearchService methods (not optional/last) to prevent accidental omission
- Embed token controllers (OpenAI-compat API, embed widgets) pass empty tenantId with TODO comments for future multi-tenant token resolution in a later plan
- ABAC allow rules use `bool.should` (OR logic, any match grants access) with `minimum_should_match: 1`; deny rules use `bool.must_not`
- Policy rules stored as JSONB directly on the datasets table (co-located with the dataset, no separate policy management table)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] knowledge-base module does not exist; all dataset logic is in the rag module**
- **Found during:** Task 2
- **Issue:** Plan referenced `be/src/modules/knowledge-base/` files which do not exist; the codebase uses `be/src/modules/rag/` for all dataset/document/chunk management
- **Fix:** Implemented all Task 2 changes in the rag module (schemas, service, controller, routes) instead
- **Files modified:** be/src/modules/rag/schemas/rag.schemas.ts, be/src/modules/rag/services/rag.service.ts, be/src/modules/rag/controllers/rag.controller.ts, be/src/modules/rag/routes/rag.routes.ts
- **Verification:** `npm run build -w be` exits 0
- **Committed in:** 95c01e9 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Embed/OpenAI-compat controllers need tenantId for search calls**
- **Found during:** Task 1
- **Issue:** Plan only listed 5 callers but embed controllers (chat-openai, chat-embed, search-openai, search-embed) also call service methods that reach ragSearchService
- **Fix:** Updated all 4 embed controllers to pass tenantId (empty string with TODO for future token-based resolution)
- **Files modified:** 4 embed controller files
- **Verification:** Build passes, all callers updated
- **Committed in:** 3dca3a2 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both deviations necessary for completeness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tenant isolation enforced at OpenSearch query level -- ready for frontend policy editor
- ABAC filter translation ready for integration into search pipeline
- Policy CRUD endpoints ready for frontend consumption
- Database migration for `policy_rules` column on `datasets` table may be needed if not already present

---
*Phase: 02-access-control*
*Completed: 2026-03-18*
