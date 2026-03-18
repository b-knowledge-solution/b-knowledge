# Phase 2: Access Control - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement org-level tenant isolation, RBAC with 4 roles, ABAC with per-dataset policies, document-level permission inheritance, and audit logging across all API and retrieval paths. Every user operates within a strictly isolated org scope — access to documents, datasets, and retrieval results is enforced by role and attribute at both the API layer and the OpenSearch query layer.

</domain>

<decisions>
## Implementation Decisions

### Role Model
- **4 roles** (hierarchical): super-admin > admin > leader > user
- **super-admin**: Platform-level role — manages orgs, views all data, configures system-wide settings
- **admin**: Org-level role — manages users, roles, and org settings within their org
- **leader**: CRUD datasets/documents + configure chat assistants and search apps in Data Studio
- **user**: Chat and search access only (lowest role, no Data Studio access)
- Existing `leader` role keeps its name — no rename needed
- Existing `user` role keeps its name — no rename needed
- No "editor" or "viewer" roles — collapsed into leader and user respectively
- **Roles are org-scoped** — a user can have different roles in different orgs (e.g., admin in Org A, user in Org B)
- Root bootstrap user (created at startup) becomes super-admin

### ABAC Policy Design
- **Full entity attributes** — users, documents, datasets, AND projects all have attributes that can be used in access policies
- **Per-dataset policy attachment** — policies are defined directly on datasets when creating/editing them, not in a separate policy management page
- **Document-level permission inheritance** — documents inherit access from parent dataset by default; overrides can only RESTRICT (not expand) access
- **Completely invisible restricted content** — users never see documents, chunks, or search results they can't access. Zero information leakage in chat citations, search results, and document lists
- **Org-scoped + platform policies** — org admins define policies for their org; super-admin can create platform-wide policies that apply across all orgs
- **CASL abilities cached on login** — compute abilities at login, cache in Valkey with session TTL, invalidate on policy or attribute changes

### Audit Logging
- **Extend existing audit module** — `be/src/modules/audit/` and `fe/src/features/audit/` already exist with filter panel, action badges, and audit log page. Add new event types, don't build new infrastructure
- **Events logged**: document views/downloads, search queries, chat answers, dataset CRUD, user role changes, policy changes, login/logout, access denials
- **Indefinite retention** — never auto-delete audit logs
- **Access**: org admins see their org's logs, super-admin sees all. Leaders and users cannot access audit logs

### Claude's Discretion
- Org/tenant table schema evolution (how to migrate from single SYSTEM_TENANT_ID to multi-org)
- CASL ability builder implementation details
- OpenSearch query filter construction for ABAC enforcement
- Exact ABAC policy schema (JSONB structure in PostgreSQL)
- Migration strategy for existing single-tenant data

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing RBAC and Auth
- `be/src/shared/config/rbac.ts` — Current role/permission definitions (admin/leader/user). Must be evolved to add super-admin and org-scoped roles
- `be/src/shared/middleware/auth.middleware.ts` — Current auth middleware (requireAuth, requireRole, requirePermission, requireOwnership). Must be extended for ABAC
- `be/src/modules/auth/` — Auth module (login, session management)

### Tenant and Data Model
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — Initial schema with tenant table, tenant_id columns on all major tables, SYSTEM_TENANT_ID seeding
- `be/src/shared/config/index.ts` §systemTenantId — Config reads SYSTEM_TENANT_ID from env
- `be/src/shared/models/types.ts` — Type definitions including tenant_id fields

### SYSTEM_TENANT_ID Consolidation (Blocker)
- `be/src/shared/config/index.ts` — Has systemTenantId config
- `be/src/shared/db/seeds/02_model_providers.ts` — Reads SYSTEM_TENANT_ID from process.env directly
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — Reads SYSTEM_TENANT_ID from process.env directly
- `fe/e2e/helpers/opensearch.helper.ts` — Reads SYSTEM_TENANT_ID from process.env directly
- `advance-rag/system_tenant.py` — Python worker's tenant ID source
- `advance-rag/config.py` — Python worker config

### OpenSearch Multi-Tenancy
- `be/src/modules/rag/services/rag-search.service.ts` — Hybrid search service that must enforce tenant_id filtering
- `advance-rag/rag/utils/es_conn.py` — Python worker OpenSearch connection (must respect tenant scope)

### Existing Audit System
- `be/src/modules/audit/` — Backend audit module (controllers, models, routes, services)
- `fe/src/features/audit/` — Frontend audit feature (AuditLogPage, AuditFilterPanel, AuditActionBadge, useAuditLogs hook, auditApi)
- `fe/src/features/audit/types/audit.types.ts` — Audit type definitions

### Projects Module
- `be/src/modules/projects/` — Existing projects module with models and services

### Prior Decisions (STATE.md)
- `.planning/STATE.md` §Decisions — CASL chosen, pool model for OpenSearch, service-layer ABAC enforcement, SYSTEM_TENANT_ID consolidation as Plan 02-01

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **rbac.ts**: Role/permission config — extend with super-admin role and org-scoped role resolution
- **auth.middleware.ts**: requireAuth, requireRole, requirePermission, requireOwnership — extend with ABAC-aware middleware
- **audit module (BE + FE)**: Full audit infrastructure already exists — extend with new access control event types
- **tenant table**: Already exists with SYSTEM_TENANT_ID seeded — evolve for multi-org
- **tenant_id columns**: Already present on knowledgebase, document, task, answer_feedback tables

### Established Patterns
- **Singleton services**: All shared services use singleton pattern in `be/src/shared/services/`
- **ModelFactory**: All models accessed via ModelFactory singleton
- **Zod validation**: All mutations validated via `validate()` middleware
- **NX module boundaries**: No cross-module imports — shared code in `shared/`
- **TanStack Query**: FE data layer uses useQuery/useMutation with centralized queryKeys

### Integration Points
- **OpenSearch queries**: All search/retrieval paths must add tenant_id + ABAC filters
- **Python worker**: advance-rag uses system_tenant.py for tenant ID — must respect org scope
- **Session store**: Valkey/Redis — CASL abilities cached here per session
- **Socket.IO events**: Real-time updates may need org-scoping

</code_context>

<specifics>
## Specific Ideas

- Use existing audit module infrastructure — don't create new audit features, extend what's there
- Existing `leader` and `user` role names are kept as-is — no renaming migration needed
- Per-dataset policy attachment (not a separate policy management page) keeps UX simple
- Platform policies from super-admin enable cross-org governance (e.g., healthcare compliance rules)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-access-control*
*Context gathered: 2026-03-18*
