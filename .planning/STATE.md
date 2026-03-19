---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 03-07-PLAN.md
last_updated: "2026-03-19T04:12:13.715Z"
last_activity: 2026-03-19 — Plan 03-05 complete (metadata management UI, tag filter chips, cron scheduler settings)
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 19
  completed_plans: 18
  percent: 88
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Users can ask questions in natural language and get accurate, cited answers from their organization's knowledge base — with strict access control ensuring each team only sees what they're authorized to access.
**Current focus:** Phase 3 — Document Management

## Current Position

Phase: 3 of 6 (Document Management)
Plan: 7 of 8 in current phase
Status: In Progress
Last activity: 2026-03-19 — Plan 03-07 complete (dataset-aware FIFO parsing scheduler)

Progress: [██████████] 95%

## Performance Metrics

**Velocity:**
- Total plans completed: 10
- Average duration: 6 min
- Total execution time: 0.45 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4 | 20 min | 5 min |

**Recent Trend:**
- Last 5 plans: 02-01 (4 min), 02-02 (9 min), 02-04 (10 min), 02-03 (16 min), 02-06 (13 min)
- Trend: stable

*Updated after each plan completion*
| Phase 01 P01 | 5min | 2 tasks | 8 files |
| Phase 01 P02 | 3min | 2 tasks | 2 files |
| Phase 01 P03 | 2min | 1 tasks | 2 files |
| Phase 01 P04 | 10min | 2 tasks | 23 files |
| Phase 02 P00 | 3min | 2 tasks | 3 files |
| Phase 02 P01 | 4min | 2 tasks | 9 files |
| Phase 02 P02 | 9min | 2 tasks | 11 files |
| Phase 02 P04 | 10min | 2 tasks | 10 files |
| Phase 02 P03 | 16min | 2 tasks | 18 files |
| Phase 02 P06 | 13min | 3 tasks | 10 files |
| Phase 03 P00 | 3min | 1 tasks | 6 files |
| Phase 03 P01 | 9min | 2 tasks | 7 files |
| Phase 03 P02 | 12min | 2 tasks | 13 files |
| Phase 03 P00 | 2min | 1 tasks | 2 files |
| Phase 03 P04 | 12min | 2 tasks | 8 files |
| Phase 03 P03 | 13min | 2 tasks | 12 files |
| Phase 03 P05 | 14min | 2 tasks | 16 files |
| Phase 03 P07 | 2min | 1 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-phase]: CASL (@casl/ability 6.8.0 + @casl/react 4.x) chosen for ABAC — in-process, no external service, PostgreSQL JSONB rule storage, Valkey cache per session
- [Pre-phase]: ABAC enforcement must be at service layer (OpenSearch query filter), not only Express middleware — middleware cannot protect retrieval paths
- [Pre-phase]: Pool model for OpenSearch multi-tenancy (single shared index with mandatory tenant_id filter) — recommended over per-tenant index; silo model reserved for HIPAA-strict tenants
- [Pre-phase]: GraphRAG and Deep Research are migration tasks — full Python implementations already exist in advance-rag/; no new Python packages needed
- [Pre-phase]: SYSTEM_TENANT_ID consolidation must happen in Phase 2 before any ABAC work — 5 files currently reading directly from process.env
- [Phase 1, Plan 01]: Local account login for E2E auth fixture -- simpler than Azure AD, works with default dev credentials
- [Phase 1, Plan 01]: Sequential single-worker Playwright execution to avoid DB race conditions
- [Phase 1, Plan 02]: Parse tests use API trigger + polling helper for reliability; parser completeness validated statically against FACTORY keys
- [Phase 1, Plan 04]: Dual-write chat feedback to answer_feedback table with non-blocking try/catch for backward compatibility
- [Phase 1, Plan 04]: Search feedback uses dedicated POST /apps/:id/feedback endpoint for cleaner REST semantics
- [Phase 1, Plan 03]: Direct OpenSearch fetch (not client library) for E2E helper -- simpler, no extra dependency; UUID normalization centralized in helper
- [Phase 2, Plan 00]: CASL auth middleware tests in separate file (auth.middleware.casl.test.ts) to preserve existing RBAC middleware tests
- [Phase 2, Plan 01]: Migration uses process.env directly (not config import) since migrations are standalone scripts
- [Phase 2, Plan 01]: Backfill uses LEFT JOIN to only insert user_tenant rows for users missing system tenant mapping
- [Phase 2, Plan 02]: Raw Knex queries for user_tenant operations instead of dedicated model (simple junction table)
- [Phase 2, Plan 02]: Ability wired in AuthController (not AuthService) since session context is only available in the request
- [Phase 2, Plan 02]: ABAC policy conditions use 'as any' cast for CASL type compatibility with exactOptionalPropertyTypes
- [Phase 2, Plan 04]: AbilityProvider placed inside AuthProvider to access user state; sidebar uses CASL ability.can() checks per nav group labelKey
- [Phase 2, Plan 03]: tenantId is first parameter on all RagSearchService methods to prevent accidental omission
- [Phase 2, Plan 03]: Embed token controllers pass empty tenantId with TODO for future multi-tenant token resolution
- [Phase 2, Plan 03]: Policy rules stored as JSONB on datasets table (co-located, no separate policy table)
- [Phase 2, Plan 06]: Super-admin sees all orgs' audit logs (optional tenantId filter); admin forced to own org only
- [Phase 2, Plan 06]: invalidateAllAbilities on role change (simpler than per-session invalidation)
- [Phase 2, Plan 06]: Existing /:id/role route upgraded with requireTenant + requireAbility instead of requirePermission
- [Phase 3, Plan 01]: Version-as-dataset model: each version inherits all parent settings at creation time (no live reference)
- [Phase 3, Plan 01]: Pagerank = version_number (1+) for OpenSearch rank_feature recency boost; parent keeps 0
- [Phase 3, Plan 01]: Default change_summary auto-generated as "Version N uploaded by user" when not provided
- [Phase 3, Plan 00]: Followed existing rag.service.test.ts mock patterns (vi.hoisted, Proxy-based knex mock) for Wave 0 scaffolds
- [Phase 3, Plan 02]: Kebab dropdown menu pattern for extensible per-row actions in DocumentTable
- [Phase 3, Plan 02]: VersionBadge null-safe pattern: returns null for non-version datasets (no conditional wrapper needed)
- [Phase 03]: Bulk metadata uses jsonb_set with COALESCE for merge mode to preserve existing tags
- [Phase 03]: Parsing scheduler uses lazy dynamic imports to avoid circular dependency with rag modules
- [Phase 03]: System config API for parsing scheduler placed under /rag/system/config namespace
- [Phase 3, Plan 03]: rank_feature in should clause (not must/filter) for proportional version boost without excluding non-versioned docs
- [Phase 3, Plan 03]: Reused DocumentPreviewer in three viewer patterns (full page, Sheet drawer, Dialog)
- [Phase 3, Plan 05]: Toggle+count pattern for auto_keywords/auto_questions replaces slider (cleaner on/off semantics)
- [Phase 3, Plan 05]: TagFilterChips use tag_kwd field in metadata_filter conditions matching rag-search.service.ts buildMetadataFilters()
- [Phase 03]: PER_DATASET_LIMIT = 10 as class constant for per-dataset batch cap in parsing scheduler

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**Phase 2 prerequisite (Pitfall 1):** SYSTEM_TENANT_ID hardcoded in 5 files~~ -- RESOLVED in Plan 02-01: consolidated to config.opensearch.systemTenantId
- **Phase 5 risk (Pitfall 5):** Deep Research token cost spiral — existing maxDepth:3 guard is insufficient; hard caps on LLM calls (10-15) and token budget (50K default) are mandatory before shipping.
- **Phase 4 research flag:** GraphRAG indexing cost — LazyGraphRAG vs full GraphRAG tradeoff needs validation during Phase 4 planning before committing to default mode.
- **Phase 5 research flag:** Token budget sizing and semantic similarity caching strategy for Deep Research needs validation during Phase 5 planning.

## Session Continuity

Last session: 2026-03-19T04:12:13.707Z
Stopped at: Completed 03-07-PLAN.md
Resume file: None
