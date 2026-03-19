# Phase 2: Access Control - Research

**Researched:** 2026-03-18
**Domain:** Authorization (RBAC + ABAC), Multi-Tenant Isolation, Audit Logging
**Confidence:** HIGH

## Summary

Phase 2 transforms B-Knowledge from a single-tenant system (where all users share one SYSTEM_TENANT_ID) into a multi-org platform with hierarchical RBAC (super-admin > admin > leader > user), attribute-based access control via CASL, and comprehensive audit logging. The existing codebase already has: a `tenant` table with seeded SYSTEM_TENANT_ID, `tenant_id` columns on knowledgebase/document/task tables, an RBAC config (`rbac.ts`) with admin/leader/user roles, auth middleware with `requireRole`/`requirePermission`, a full audit module (BE + FE), and project permission tables (project_permissions, project_entity_permissions).

The primary technical challenges are: (1) consolidating 5+ files that read SYSTEM_TENANT_ID from process.env directly instead of through config, (2) building CASL ability definitions that can be serialized to JSONB for PostgreSQL storage and translated to OpenSearch query filters, and (3) ensuring ABAC filters are injected at the service layer (not just middleware) so that search/retrieval paths are also protected.

**Primary recommendation:** Use CASL 6.8.0 with `createMongoAbility` for rule definition and MongoDB-style conditions that naturally translate to OpenSearch bool/filter queries. Cache computed abilities in Valkey keyed by session ID with the same TTL as the session.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **4 roles** (hierarchical): super-admin > admin > leader > user
- **super-admin**: Platform-level role -- manages orgs, views all data, configures system-wide settings
- **admin**: Org-level role -- manages users, roles, and org settings within their org
- **leader**: CRUD datasets/documents + configure chat assistants and search apps in Data Studio
- **user**: Chat and search access only (lowest role, no Data Studio access)
- Existing `leader` role keeps its name -- no rename needed
- Existing `user` role keeps its name -- no rename needed
- No "editor" or "viewer" roles -- collapsed into leader and user respectively
- **Roles are org-scoped** -- a user can have different roles in different orgs
- Root bootstrap user (created at startup) becomes super-admin
- **Full entity attributes** -- users, documents, datasets, AND projects all have attributes for access policies
- **Per-dataset policy attachment** -- policies defined directly on datasets, not in a separate policy management page
- **Document-level permission inheritance** -- documents inherit from parent dataset; overrides can only RESTRICT (not expand)
- **Completely invisible restricted content** -- zero information leakage
- **Org-scoped + platform policies** -- org admins define org policies; super-admin creates platform-wide policies
- **CASL abilities cached on login** -- compute at login, cache in Valkey with session TTL, invalidate on policy/attribute changes
- **Extend existing audit module** -- add new event types, don't build new infrastructure
- **Audit events**: document views/downloads, search queries, chat answers, dataset CRUD, user role changes, policy changes, login/logout, access denials
- **Indefinite retention** -- never auto-delete audit logs
- **Audit access**: org admins see their org's logs, super-admin sees all; leaders and users cannot access audit logs

### Claude's Discretion
- Org/tenant table schema evolution (how to migrate from single SYSTEM_TENANT_ID to multi-org)
- CASL ability builder implementation details
- OpenSearch query filter construction for ABAC enforcement
- Exact ABAC policy schema (JSONB structure in PostgreSQL)
- Migration strategy for existing single-tenant data

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCS-01 | Org-level tenant isolation -- each organization's data fully isolated with zero data leakage | Tenant table evolution, mandatory tenant_id filter on all queries, OpenSearch index naming with tenant scope |
| ACCS-02 | RBAC with admin, editor, viewer roles (mapped to super-admin/admin/leader/user) | CASL ability builder with role hierarchy, evolve existing rbac.ts, org-scoped role assignment via user_org junction table |
| ACCS-03 | ABAC -- attribute-based access rules | CASL conditions with MongoDB-style operators stored as JSONB in PostgreSQL, translated to OpenSearch bool filters at service layer |
| ACCS-04 | Document-level permission inheritance from dataset with override capability | Dataset policy_rules JSONB column, document policy_overrides JSONB column, merge logic in ability builder |
| ACCS-05 | Audit logging -- who accessed what, when, and what answer was generated | Extend existing AuditAction/AuditResourceType enums, add new event types, add tenant_id column to audit_logs |
| ACCS-06 | Project-scoped access -- project-level isolation within orgs | Existing project_permissions and project_entity_permissions tables already support this pattern; add ABAC integration |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @casl/ability | 6.8.0 | Authorization rule engine (RBAC + ABAC) | Pre-decided; isomorphic, MongoDB-style conditions map to OpenSearch queries |
| @casl/react | 5.0.1 | React integration (Can component, useAbility hook) | Official CASL React bindings; context-based ability distribution |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| knex | 3.1.0 | DB migrations for schema changes | Already in stack; all schema changes via Knex migrations |
| @opensearch-project/opensearch | (existing) | OpenSearch client | Already in stack; add tenant_id + ABAC filters to queries |
| zod | (existing) | Validation for policy CRUD endpoints | Already in stack; validate ABAC policy schemas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CASL | casbin | Casbin is more complex, requires separate policy language (Rego/PERM); CASL is JS-native, lighter weight |
| CASL | accesscontrol | accesscontrol lacks attribute-based conditions; only supports RBAC |
| JSONB policy storage | Separate policy table (normalized) | JSONB keeps policies co-located with datasets; normalized tables add joins but better for complex querying. JSONB is sufficient for per-dataset attachment pattern |

**Installation:**
```bash
cd be && npm install @casl/ability@6.8.0
cd fe && npm install @casl/ability@6.8.0 @casl/react@5.0.1
```

## Architecture Patterns

### Recommended Project Structure
```
be/src/
├── shared/
│   ├── config/
│   │   └── rbac.ts              # Evolve: add super-admin, remove old Permission type, CASL integration
│   ├── middleware/
│   │   ├── auth.middleware.ts    # Evolve: add requireAbility(), tenant scoping
│   │   └── tenant.middleware.ts  # NEW: extract + validate tenant_id from session, attach to req
│   ├── services/
│   │   ├── ability.service.ts   # NEW: CASL ability builder, cache management
│   │   └── opensearch.service.ts # NEW: shared OpenSearch client with mandatory tenant_id
│   └── db/migrations/
│       └── YYYYMMDD_access_control.ts  # Schema changes for multi-org
├── modules/
│   ├── audit/                   # EXTEND: new event types, tenant_id scoping
│   ├── auth/                    # EXTEND: compute abilities on login, cache in Valkey
│   ├── rag/services/
│   │   └── rag-search.service.ts # MODIFY: accept tenant_id param, inject ABAC filters
│   └── access-control/          # NEW module for policy CRUD (if needed, or inline on datasets)
fe/src/
├── lib/
│   └── ability.ts               # NEW: AbilityContext, useAbility hook setup
├── features/
│   ├── datasets/                # EXTEND: policy attachment UI on dataset create/edit
│   └── audit/                   # EXTEND: new action/resource type badges, tenant filter
```

### Pattern 1: CASL Ability Builder
**What:** Build CASL abilities from user role + org membership + ABAC policies
**When to use:** On login and when policies/roles change
**Example:**
```typescript
// Source: CASL v6 API + project conventions
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability'

type Actions = 'manage' | 'create' | 'read' | 'update' | 'delete'
type Subjects = 'Dataset' | 'Document' | 'ChatAssistant' | 'SearchApp' | 'User' | 'AuditLog' | 'all'

type AppAbility = MongoAbility<[Actions, Subjects]>

function buildAbilityFor(user: UserWithOrg, policies: AbacPolicy[]): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  // Super-admin can do everything
  if (user.role === 'super-admin') {
    can('manage', 'all')
    return build()
  }

  // All authenticated users can read datasets/documents in their org
  can('read', 'Dataset', { tenant_id: user.current_org_id })
  can('read', 'Document', { tenant_id: user.current_org_id })

  // Admin: manage users, roles, org settings within their org
  if (user.role === 'admin') {
    can('manage', 'User', { tenant_id: user.current_org_id })
    can('manage', 'Dataset', { tenant_id: user.current_org_id })
    can('manage', 'Document', { tenant_id: user.current_org_id })
    can('read', 'AuditLog', { tenant_id: user.current_org_id })
  }

  // Leader: CRUD datasets/documents
  if (user.role === 'leader') {
    can('create', 'Dataset', { tenant_id: user.current_org_id })
    can('update', 'Dataset', { tenant_id: user.current_org_id })
    can('delete', 'Dataset', { tenant_id: user.current_org_id })
    can('manage', 'Document', { tenant_id: user.current_org_id })
  }

  // Apply ABAC policies (restrict access based on attributes)
  for (const policy of policies) {
    if (policy.effect === 'deny') {
      cannot(policy.action, policy.subject, policy.conditions)
    } else {
      can(policy.action, policy.subject, policy.conditions)
    }
  }

  return build()
}
```

### Pattern 2: OpenSearch ABAC Filter Injection
**What:** Translate CASL conditions to OpenSearch bool filter clauses
**When to use:** Every search/retrieval call
**Example:**
```typescript
// Service layer injects tenant_id + ABAC filters before every OpenSearch query
function buildAccessFilters(tenantId: string, userAbacFilters: Record<string, unknown>[]): Record<string, unknown>[] {
  return [
    // Mandatory tenant isolation -- never optional
    { term: { tenant_id: tenantId } },
    // ABAC attribute filters (e.g., department, project membership)
    ...userAbacFilters,
  ]
}
```

### Pattern 3: Ability Caching in Valkey
**What:** Serialize CASL rules to JSON, store in Valkey with session TTL
**When to use:** On login, on role/policy change
**Example:**
```typescript
// Key format: ability:{sessionId}
// Value: JSON array of CASL raw rules
// TTL: same as session TTL (7 days default)
const ABILITY_CACHE_PREFIX = 'ability:'

async function cacheAbility(sessionId: string, ability: AppAbility): Promise<void> {
  const key = `${ABILITY_CACHE_PREFIX}${sessionId}`
  await redis.set(key, JSON.stringify(ability.rules), 'EX', config.session.ttlSeconds)
}

async function loadAbility(sessionId: string): Promise<AppAbility | null> {
  const key = `${ABILITY_CACHE_PREFIX}${sessionId}`
  const raw = await redis.get(key)
  if (!raw) return null
  return createMongoAbility(JSON.parse(raw))
}
```

### Pattern 4: ABAC Policy JSONB Schema
**What:** Structure for ABAC policies stored in PostgreSQL JSONB columns
**When to use:** Per-dataset policy attachment, platform-wide policies
**Example:**
```typescript
// Policy rule structure stored as JSONB in dataset.policy_rules or a policies table
interface AbacPolicyRule {
  id: string                    // Unique rule ID
  effect: 'allow' | 'deny'     // Allow or deny access
  action: string                // 'read' | 'update' | 'delete' | 'manage'
  subject: string               // 'Document' | 'Dataset'
  conditions: {                 // MongoDB-style conditions (CASL-compatible)
    department?: string | { $in: string[] }
    project_id?: string
    tags?: { $in: string[] }
    [key: string]: unknown
  }
  description?: string          // Human-readable description
}

// Example: "Only clinical department can read these documents"
const clinicalOnly: AbacPolicyRule = {
  id: 'policy-001',
  effect: 'allow',
  action: 'read',
  subject: 'Document',
  conditions: { department: 'clinical' },
  description: 'Clinical department access only'
}
```

### Anti-Patterns to Avoid
- **Middleware-only ABAC:** Never rely solely on Express middleware for access control. OpenSearch queries and service-layer calls MUST also enforce tenant_id + ABAC filters. Middleware cannot intercept internal service calls or retrieval paths.
- **Hardcoded tenant IDs:** Never read SYSTEM_TENANT_ID from process.env directly. Always use `config.opensearch.systemTenantId` or the new tenant resolution from session.
- **Ability computation on every request:** Compute once on login, cache in Valkey. Recompute only when roles or policies change.
- **Expanding document overrides:** Document-level overrides can only RESTRICT access (deny rules), never expand beyond parent dataset policy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Permission rule engine | Custom if/else permission checks | CASL `createMongoAbility` | CASL handles rule merging, condition matching, subject detection, and serialization. Custom code will miss edge cases |
| MongoDB-style condition matching | Custom object comparator | CASL's built-in `sift.js` conditions | Supports $eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $exists, $regex operators out of the box |
| React permission checks | Custom context + hook | `@casl/react` Can component + `useAbility` hook | Handles re-rendering on ability changes, provides declarative `<Can>` component |
| Session-scoped caching | Custom Map or global variable | Valkey with session-keyed entries | Survives server restarts, shared across horizontally scaled instances, automatic TTL expiry |
| Audit log infrastructure | New audit tables/services | Extend existing `be/src/modules/audit/` | Full audit infrastructure already exists with filter panel, action badges, CSV export |

**Key insight:** CASL's MongoDB-style conditions are the lynchpin -- they serve triple duty: (1) in-memory permission checks via `ability.can()`, (2) serializable to Valkey cache as JSON, and (3) translatable to OpenSearch bool/filter queries. Building a custom system would require implementing all three separately.

## Common Pitfalls

### Pitfall 1: SYSTEM_TENANT_ID Process.env Reads
**What goes wrong:** 5 files read SYSTEM_TENANT_ID from process.env directly instead of through config, creating inconsistency when migrating to multi-org
**Why it happens:** Legacy code from single-tenant era
**How to avoid:** Plan 02-01 consolidates all reads through `config.opensearch.systemTenantId`. Files to fix: `be/src/shared/db/seeds/02_model_providers.ts`, `be/src/shared/db/migrations/20260312000000_initial_schema.ts`, `fe/e2e/helpers/opensearch.helper.ts`, `advance-rag/system_tenant.py`, `advance-rag/config.py`
**Warning signs:** Grep for `process.env.*SYSTEM_TENANT_ID` or `os.getenv.*SYSTEM_TENANT_ID` outside of config files

### Pitfall 2: OpenSearch Index Naming
**What goes wrong:** Current index name is `knowledge_{SYSTEM_TENANT_ID}` -- a single index for all data. Multi-org requires tenant isolation at the OpenSearch level
**Why it happens:** Pool model (shared index) was chosen over silo model (per-tenant index) per STATE.md
**How to avoid:** Keep pool model but make tenant_id a mandatory filter on EVERY OpenSearch query. The `getIndexName()` function in rag-search.service.ts currently hardcodes the single index -- it must accept tenant_id parameter. Add a mandatory `tenant_id` term filter that cannot be bypassed
**Warning signs:** Any OpenSearch query that doesn't include a `{ term: { tenant_id: ... } }` filter clause

### Pitfall 3: Ability Cache Invalidation
**What goes wrong:** User's CASL abilities become stale when admin changes their role or updates a dataset policy
**Why it happens:** Abilities are cached in Valkey and not automatically refreshed
**How to avoid:** On role change or policy update, delete the affected user's ability cache key. The next request will trigger a recompute. For policy changes that affect many users (e.g., platform-wide policy), use a generation counter pattern: increment a global `ability_gen` key, compare on each request
**Warning signs:** User sees data they shouldn't after a role change until they re-login

### Pitfall 4: Document Override Escalation
**What goes wrong:** A document-level override accidentally grants MORE access than the parent dataset policy
**Why it happens:** Override logic doesn't enforce the "restrict only" constraint
**How to avoid:** Document overrides should only contain `deny` rules. The ability builder should merge dataset policies first (as `can` rules), then apply document overrides (as `cannot` rules). Never allow document-level `can` rules that aren't already permitted by the dataset
**Warning signs:** A user can access a document but not other documents in the same dataset

### Pitfall 5: Audit Log Performance
**What goes wrong:** Audit logging on every search query creates write amplification
**Why it happens:** High-frequency events (search queries, chat messages) generate many audit rows
**How to avoid:** Use async best-effort logging (already implemented in auditService.log). Consider batching for high-frequency events. The existing audit service already uses try/catch to prevent audit failures from disrupting main flow
**Warning signs:** PostgreSQL write IOPS spike during heavy search usage

### Pitfall 6: Session Data Size
**What goes wrong:** Storing full CASL rules in the session object bloats session storage
**Why it happens:** CASL rules can be large for users with many ABAC policies
**How to avoid:** Store only the cache key reference in the session, not the full rules. Abilities are cached separately in Valkey. Session only contains user identity, role, and current org_id
**Warning signs:** Session cookie exceeds 4KB limit or Valkey memory spikes

## Code Examples

### Existing RBAC Config Evolution
```typescript
// Current: be/src/shared/config/rbac.ts
export type Role = 'admin' | 'leader' | 'user'

// Evolve to:
export type Role = 'super-admin' | 'admin' | 'leader' | 'user'

// Role hierarchy (for CASL's detectSubjectType)
export const ROLE_HIERARCHY: Record<Role, number> = {
  'super-admin': 100,
  'admin': 75,
  'leader': 50,
  'user': 25,
}
```

### Tenant Middleware
```typescript
// NEW: be/src/shared/middleware/tenant.middleware.ts
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  const user = req.session?.user
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  // Extract current org from session (set during login or org switch)
  const tenantId = (req.session as any).currentOrgId
  if (!tenantId) {
    res.status(403).json({ error: 'No organization selected' })
    return
  }

  // Attach to request for downstream use
  ;(req as any).tenantId = tenantId
  next()
}
```

### OpenSearch Service Layer with Mandatory Tenant Filter
```typescript
// Evolve: be/src/modules/rag/services/rag-search.service.ts
// Before: getIndexName() uses hardcoded SYSTEM_TENANT_ID
// After: accept tenantId as required parameter

async fullTextSearch(
  tenantId: string,  // NEW: mandatory parameter
  datasetId: string,
  query: string,
  topK: number,
  abacFilters: Record<string, unknown>[] = [],  // NEW: ABAC filters
): Promise<{ chunks: ChunkResult[]; total: number }> {
  const client = getClient()
  const res = await client.search({
    index: getIndexName(tenantId),  // tenant-scoped index name
    body: {
      query: {
        bool: {
          must: [
            { term: { kb_id: datasetId.replace(/-/g, '') } },
            { match: { content_with_weight: { query, minimum_should_match: '30%' } } },
          ],
          filter: [
            { term: { available_int: 1 } },
            { term: { tenant_id: tenantId } },  // MANDATORY tenant isolation
            ...abacFilters,                       // ABAC attribute filters
          ],
        },
      },
      size: topK,
    },
  })
  // ...
}
```

### Extending Audit Module
```typescript
// Extend: be/src/modules/audit/services/audit.service.ts
export const AuditAction = {
  // ... existing actions ...

  // Phase 2: Access control events
  VIEW_DOCUMENT: 'view_document',
  DOWNLOAD_DOCUMENT: 'download_document',
  SEARCH_QUERY: 'search_query',
  CHAT_ANSWER: 'chat_answer',
  UPDATE_ROLE: 'update_role',        // already exists
  UPDATE_POLICY: 'update_policy',
  CREATE_POLICY: 'create_policy',
  DELETE_POLICY: 'delete_policy',
  LOGIN: 'login',
  LOGOUT: 'logout',
  ACCESS_DENIED: 'access_denied',
} as const

export const AuditResourceType = {
  // ... existing types ...
  POLICY: 'policy',
  SEARCH: 'search',
  CHAT: 'chat',
  ORG: 'org',
} as const
```

### ABAC Policy on Dataset (UI Integration Point)
```typescript
// Dataset create/edit form includes policy_rules field
// Stored as JSONB on knowledgebase table
interface DatasetWithPolicy {
  id: string
  name: string
  tenant_id: string
  // ... existing fields ...
  policy_rules: AbacPolicyRule[]  // NEW: ABAC policies attached to dataset
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat role check (`hasPermission()`) | CASL ability with conditions | Phase 2 | Enables ABAC, not just RBAC |
| Single SYSTEM_TENANT_ID | Per-org tenant_id from session | Phase 2 | Multi-org isolation |
| No ABAC on OpenSearch queries | Mandatory tenant_id + ABAC filters | Phase 2 | Zero data leakage in search results |
| Audit logs without tenant scope | Audit logs with tenant_id column | Phase 2 | Org-scoped audit visibility |

**Deprecated/outdated:**
- `ROLE_PERMISSIONS` map in rbac.ts: Will be replaced by CASL ability definitions
- `hasPermission()` function: Replaced by `ability.can()` checks
- `requirePermission()` middleware: Evolve to use CASL abilities
- Direct `process.env.SYSTEM_TENANT_ID` reads: Replace with config accessor

## Schema Evolution Plan

### New/Modified Tables (Migration)

```sql
-- 1. Add org table (evolution of single-tenant 'tenant' table)
-- The existing 'tenant' table becomes the org table
-- Add columns for org management
ALTER TABLE tenant ADD COLUMN display_name TEXT;
ALTER TABLE tenant ADD COLUMN description TEXT;
ALTER TABLE tenant ADD COLUMN created_by TEXT;
ALTER TABLE tenant ADD COLUMN updated_by TEXT;

-- 2. User-Org membership (evolve user_tenant or create new)
-- user_tenant already exists but needs role column
ALTER TABLE user_tenant ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- 3. ABAC policies on datasets
ALTER TABLE knowledgebase ADD COLUMN policy_rules JSONB DEFAULT '[]';

-- 4. Document-level permission overrides
ALTER TABLE document ADD COLUMN policy_overrides JSONB DEFAULT '[]';

-- 5. Platform-wide policies table
CREATE TABLE platform_policies (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  description TEXT,
  rules JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Add tenant_id to audit_logs for org-scoped filtering
ALTER TABLE audit_logs ADD COLUMN tenant_id TEXT;
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);

-- 7. Add is_super_admin or evolve users.role
-- users.role stays per-org (via user_tenant.role)
-- users.is_superuser already exists (boolean column)
```

### Migration Strategy for Existing Data
- All existing data gets assigned to SYSTEM_TENANT_ID org (becomes the "default" org)
- All existing users get added to user_tenant with their current role
- Root bootstrap user gets `is_superuser = true` (super-admin)
- Existing knowledgebase.tenant_id values remain unchanged (already SYSTEM_TENANT_ID)

## Open Questions

1. **OpenSearch Chunk Tenant ID**
   - What we know: Chunks in OpenSearch have `kb_id` but may not have `tenant_id` as a field
   - What's unclear: Need to verify if chunks already store tenant_id or if it needs to be added to the index mapping
   - Recommendation: Check OpenSearch index mapping; if tenant_id is missing, add it and backfill existing chunks. Or resolve tenant from kb_id at query time (less efficient but simpler migration)

2. **Cross-Org Super-Admin Queries**
   - What we know: Super-admin should see all data across all orgs
   - What's unclear: Should super-admin searches return results from all orgs, or should they select an org context first?
   - Recommendation: Super-admin selects an org context (or "all orgs") -- this keeps the query pattern consistent and avoids accidentally mixing org data in results

3. **Python Worker Tenant Awareness**
   - What we know: advance-rag currently uses a fixed SYSTEM_TENANT_ID for all operations
   - What's unclear: How task execution should resolve tenant_id -- from the task record? From the document? From the knowledgebase?
   - Recommendation: Task records already reference a knowledgebase which has tenant_id. Worker should read tenant_id from the knowledgebase record. No schema change needed in advance-rag -- just pass tenant_id through the pipeline

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.x (BE), Vitest 3.x (FE), Playwright (E2E) |
| Config file | `be/vitest.config.ts`, `fe/vitest.config.ts` |
| Quick run command | `npm run test -w be -- --run` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCS-01 | Org isolation -- user in Org A cannot access Org B data | unit + E2E | `npm run test -w be -- --run tests/shared/services/ability.service.test.ts` | Wave 0 |
| ACCS-02 | RBAC role enforcement -- viewer cannot mutate datasets | unit | `npm run test -w be -- --run tests/shared/middleware/auth.middleware.test.ts` | Wave 0 |
| ACCS-03 | ABAC conditions restrict document visibility | unit | `npm run test -w be -- --run tests/shared/services/ability.service.test.ts` | Wave 0 |
| ACCS-04 | Document inherits dataset policy, overrides only restrict | unit | `npm run test -w be -- --run tests/shared/services/ability.service.test.ts` | Wave 0 |
| ACCS-05 | Audit log written for document access and answer generation | unit | `npm run test -w be -- --run tests/audit/audit.service.test.ts` | Exists (extend) |
| ACCS-06 | Project-scoped access enforcement | unit | `npm run test -w be -- --run tests/shared/services/ability.service.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `be/tests/shared/services/ability.service.test.ts` -- covers ACCS-01, ACCS-02, ACCS-03, ACCS-04, ACCS-06 (ability builder logic)
- [ ] `be/tests/shared/middleware/tenant.middleware.test.ts` -- covers tenant extraction and validation
- [ ] `be/tests/shared/middleware/auth.middleware.test.ts` -- extend existing tests for CASL integration
- [ ] Install CASL: `cd be && npm install @casl/ability@6.8.0` and `cd fe && npm install @casl/ability@6.8.0 @casl/react@5.0.1`

## Sources

### Primary (HIGH confidence)
- Existing codebase: `be/src/shared/config/rbac.ts`, `be/src/shared/middleware/auth.middleware.ts`, `be/src/modules/audit/`, `be/src/modules/rag/services/rag-search.service.ts`
- Existing schema: `be/src/shared/db/migrations/20260312000000_initial_schema.ts` (tenant, knowledgebase, document, project_permissions tables)
- CASL GitHub README: `https://github.com/stalniy/casl` -- v6.8.0 API, AbilityBuilder, conditions, MongoDB operators
- @casl/react README: `https://github.com/stalniy/casl/tree/master/packages/casl-react` -- Can component, useAbility hook, context integration
- npm registry: @casl/ability 6.8.0, @casl/react 5.0.1 (verified current)

### Secondary (MEDIUM confidence)
- CASL conditions documentation: `https://casl.js.org/v6/en/guide/conditions-in-depth/` (client-rendered, content verified via README)
- OpenSearch query DSL: bool/filter/term queries (well-known, stable API)

### Tertiary (LOW confidence)
- None -- all critical patterns verified against codebase and official library documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- CASL pre-decided, versions verified against npm registry
- Architecture: HIGH -- patterns derived from existing codebase analysis (rbac.ts, auth middleware, audit module, OpenSearch service, schema)
- Pitfalls: HIGH -- identified from direct codebase inspection (5 process.env reads, hardcoded index name, existing audit pattern)
- Schema evolution: MEDIUM -- migration strategy is sound but exact column details may shift during implementation

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (30 days -- stable domain, libraries are mature)
