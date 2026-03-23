---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 02-01-PLAN.md
last_updated: "2026-03-23T03:58:30.323Z"
last_activity: 2026-03-23
progress:
  total_phases: 2
  completed_phases: 1
  total_plans: 16
  completed_plans: 11
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** Users can ask questions in natural language and get accurate, cited answers from their organization's knowledge base — with strict access control ensuring each team only sees what they're authorized to access.
**Current focus:** Phase 7 — Milestone Gap Closure

## Current Position

Phase: 1 of 1 (Migrate Agent Features from RAGFlow to B-Knowledge)
Plan: 10 of 10 in current phase
Status: Phase 01 Complete
Last activity: 2026-03-23

Progress: [██████████] 100%

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
| Phase 03 P06 | 6min | 2 tasks | 15 files |
| Phase 04 P01 | 10min | 2 tasks | 11 files |
| Phase 04 P02 | 9min | 2 tasks | 10 files |
| Phase 05 P01 | 9min | 2 tasks | 10 files |
| Phase 05 P02 | 8min | 2 tasks | 5 files |
| Phase 05 P03 | 7min | 3 tasks | 3 files |
| Phase 05 P04 | 14 | 2 tasks | 10 files |
| Phase 06 P01 | 3min | 2 tasks | 10 files |
| Phase 06 P02 | 4min | 2 tasks | 4 files |
| Phase 06 P03 | 5min | 2 tasks | 6 files |
| Phase 06 P04 | 10min | 2 tasks | 10 files |
| Phase 06 P05 | 11min | 2 tasks | 15 files |
| Phase 07 P02 | 1min | 1 tasks | 1 files |
| Phase 07 P01 | 7 | 2 tasks | 6 files |
| Phase 01 P02 | 3min | 2 tasks | 6 files |
| Phase 01 P03 | 5min | 2 tasks | 6 files |
| Phase 01 P04 | 8min | 2 tasks | 13 files |
| Phase 01 P05 | 5min | 2 tasks | 9 files |
| Phase 01 P06 | 8min | 3 tasks | 9 files |
| Phase 01 P07 | 6min | 2 tasks | 9 files |
| Phase 01 P08 | 6min | 2 tasks | 9 files |
| Phase 01 P09 | 6min | 2 tasks | 14 files |
| Phase 01 P10 | 9min | 2 tasks | 16 files |
| Phase 02 P01 | 3min | 2 tasks | 8 files |

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
- [Phase 3, Plan 06]: version_label is nullable text (max 128), separate from integer version_number kept for pagerank boost
- [Phase 4, Plan 01]: Mock rag_tokenizer in tests via sys.modules patching to avoid heavy NLP dependency chain
- [Phase 4, Plan 01]: decorated_definition wrapping class_definition treated as class scope, recursive container traversal for nested methods
- [Phase 4, Plan 03]: Clinical classification runs as post-parse step in task_executor (not inside chunk()) following auto_keywords async pattern
- [Phase 04]: Added openapi-spec-validator as explicit prance validation backend dependency
- [Phase 04]: ADR options pattern checked before consequences for correct MADR 'Pros and Cons of the Options' classification
- [Phase 04]: ADR sub-headings (H3+) merged into parent H2 section to preserve section integrity
- [Phase 05, Plan 01]: Vietnamese detection uses diacritical mark regex for short text, franc trigrams for long text
- [Phase 05, Plan 01]: Graph data cleared before rebuild to prevent mixed Light/Full entity format corruption
- [Phase 05, Plan 01]: GraphRAG config shape matches task_executor.py exactly: use_graphrag, resolution, community, entity_types, method
- [Phase 05, Plan 02]: BudgetTracker records tokens via approxTokens (chars/4) after each LLM call -- simple heuristic avoids tokenizer dependency
- [Phase 05, Plan 02]: Cross-dataset search uses OpenSearch terms filter with multiple kb_ids in single query (pool model shared index)
- [Phase 05, Plan 02]: KB expansion capped at 20 to prevent OpenSearch query size limit issues (Pitfall 6)
- [Phase 05, Plan 03]: Language instruction prepended to system prompt before kgContext merge for consistent response language
- [Phase 05, Plan 03]: RBAC dataset expansion uses per-user abilityService.buildAbilityFor (not tenant-wide findAll) for ABAC security
- [Phase 05, Plan 03]: Deep research budget caps 50K tokens / 15 calls hardcoded in chat pipeline (Pitfall 5)
- [Phase 05]: MetricCard as local component in KnowledgeGraphTab, not shared (KG-specific metrics display)
- [Phase 05]: Deep Research events use ref+state sync pattern matching existing useChatStream approach
- [Phase 05]: Existing reasoning state preserved in ChatAssistantConfig; only UI label changed to Deep Research
- [Phase 06, Plan 01]: Backfill tenant_id from user_tenant with COALESCE 'default' fallback for orphaned projects
- [Phase 06, Plan 01]: QueryLogService uses void promise + catch pattern for guaranteed non-blocking logging
- [Phase 06, Plan 01]: getAccessibleProjects tenantId changed from optional to required for multi-tenant safety
- [Phase 06, Plan 03]: Query logging wired into search.service.ts executeSearch (not raw rag-search.service.ts) because userId/tenantId context is only available at the service layer
- [Phase 06, Plan 03]: Spread pattern for optional confidence_score to satisfy exactOptionalPropertyTypes TypeScript config
- [Phase 06, Plan 02]: Cross-project-datasets route placed before /:id to avoid Express param collision
- [Phase 06, Plan 02]: bindDatasets uses single INSERT ON CONFLICT DO NOTHING for N+1 avoidance
- [Phase 06, Plan 02]: removeMember rejects removing project creator to prevent orphaned projects
- [Phase 06, Plan 02]: addMember validates user exists in same tenant via user_tenant JOIN
- [Phase 06, Plan 04]: useProjectBoundDatasets named distinctly from existing useProjectDatasets to avoid hook name conflict
- [Phase 06, Plan 04]: Load-more pagination for activity feed (not infinite scroll) per CONTEXT.md decision
- [Phase 06, Plan 04]: Delete project dialog requires typing exact project name to confirm (destructive action UX)
- [Phase 06, Plan 05]: Shared date range state across all 3 dashboard tabs with per-tab query invalidation
- [Phase 06, Plan 05]: FailedQueriesTable filters client-side from topQueries (avg_confidence < 0.5 threshold)
- [Phase 06, Plan 05]: FeedbackSummaryCards 4th card shows worst dataset name with smaller text to avoid overflow
- [Phase 07]: Policy gathering placed outside authorizedKbIds.length check but inside RBAC block to cover both expanded and original datasets
- [Phase 07]: Omit selectedChunk prop from SearchResultDocDialog due to SearchResult vs Chunk type mismatch
- [Phase 07]: Nested chat.deepResearch i18n namespace for new keys (existing flat deepResearch* keys preserved)
- [Phase 01]: Zustand selector-only pattern enforced via JSDoc warning on useCanvasStore export
- [Phase 01]: NODE_CATEGORY_MAP uses as const for full type narrowing in downstream consumers
- [Phase 01, Plan 03]: JSONB DSL stored as object (not stringified) since Knex handles JSONB natively and Agent type expects Record<string, unknown>
- [Phase 01, Plan 03]: Published agents have immutable DSL (409 on update attempt) to protect production workflows
- [Phase 01]: Spread pattern for optional description to satisfy exactOptionalPropertyTypes
- [Phase 01]: Agent-first links as separate component files, not inline in management pages
- [Phase 01]: AgentCanvasPage placeholder points to AgentListPage until canvas is built
- [Phase 01, Plan 05]: Auto-save reads store state directly via getState() to avoid stale closure in setInterval
- [Phase 01, Plan 05]: NodePalette uses Dialog+Input+ScrollArea instead of shadcn Command (not installed)
- [Phase 01, Plan 05]: Generic JSON editor for NodeConfigPanel; operator-specific forms deferred to later plans
- [Phase 01, Plan 06]: Inline vs dispatch node classification: begin/answer/switch/condition/merge/template/keyword_extract in Node.js; LLM/retrieval/code/tools to Python
- [Phase 01, Plan 06]: Per-node Redis pub/sub channels for result delivery; 5-min per-node timeout
- [Phase 01, Plan 08]: Webhook accepts input/message/query field names for payload flexibility
- [Phase 01, Plan 08]: Templates route registered in app/routes.ts before agent module to avoid /:id catch-all
- [Phase 01, Plan 08]: Seed templates at be/src/shared/db/seeds/ following existing seed convention
- [Phase 01, Plan 06]: Loop-back edges (sourceHandle='loop_back') excluded from DAG cycle detection
- [Phase 01, Plan 07]: Debug mode executes all nodes inline (Python dispatch simulated) for interactive debugging
- [Phase 01, Plan 07]: Debug state is ephemeral in-memory Map (not persisted) since debug runs are short-lived
- [Phase 01, Plan 07]: continueRun executes first step unconditionally, then stops at breakpoints
- [Phase 01, Plan 09]: MCP connection pool at service level keyed by server URL for client reuse
- [Phase 01, Plan 09]: Docker sandbox uses tmpfs /tmp mount with read-only rootfs
- [Phase 01, Plan 09]: Tool credential lookup uses agent-specific first, tenant-level fallback
- [Phase 01, Plan 09]: Tavily credentials injected via config.credentials by Node.js orchestrator
- [Phase 01, Plan 10]: Embed routes use token-in-URL pattern (matching chat/search embed) rather than external-auth Bearer middleware
- [Phase 01, Plan 10]: ABAC requireAbility middleware on all agent CRUD, action, and execution routes
- [Phase 01, Plan 10]: FORM_MAP uses Partial<Record<OperatorType, Component>> so unmapped operators fall through to JSON editor
- [Phase 01, Plan 10]: Type-specific forms propagate updates on every field change (no explicit Apply button)
- [Phase 02]: Bitmask system for memory types (RAW=1, SEMANTIC=2, EPISODIC=4, PROCEDURAL=8) enables flexible per-pool type selection
- [Phase 02]: CHECK constraints on storage_type, extraction_mode, permission, scope_type for database-level data integrity

### Roadmap Evolution

- Phase 1 added: Migrate agent features from RAGFlow to B-Knowledge
- [Phase 1, Plan 01]: Agent models follow existing BaseModel + ModelFactory singleton pattern; version-as-row with parent_id matches dataset approach
- [Phase 1, Plan 01]: COALESCE-based unique index on agent_tool_credentials handles NULL agent_id for tenant-level defaults
- Phase 2 added: Migration memory feature from RAGFlow to B-Knowledge

### Pending Todos

None yet.

### Blockers/Concerns

- ~~**Phase 2 prerequisite (Pitfall 1):** SYSTEM_TENANT_ID hardcoded in 5 files~~ -- RESOLVED in Plan 02-01: consolidated to config.opensearch.systemTenantId
- **Phase 5 risk (Pitfall 5):** Deep Research token cost spiral — existing maxDepth:3 guard is insufficient; hard caps on LLM calls (10-15) and token budget (50K default) are mandatory before shipping.
- **Phase 4 research flag:** GraphRAG indexing cost — LazyGraphRAG vs full GraphRAG tradeoff needs validation during Phase 4 planning before committing to default mode.
- **Phase 5 research flag:** Token budget sizing and semantic similarity caching strategy for Deep Research needs validation during Phase 5 planning.

## Session Continuity

Last session: 2026-03-23T03:58:30.315Z
Stopped at: Completed 02-01-PLAN.md
Resume file: None
