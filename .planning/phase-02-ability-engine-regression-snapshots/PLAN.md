---
phase: 02-ability-engine-regression-snapshots
type: execute
granularity: standard
requirements: [TS5, TS8, TS15]
risks_addressed: [R-1, R-2, R-6, R-12]
depends_on_phase: [01-schema-registry-boot-sync]
feature_flag: config.permissions.useV2Engine (default false)
locked_decisions:
  - D1: Seed-side fix for V1 unconditional read Dataset/Document rules (migration adds rows; no carve-outs in V2 builder)
  - D2: Both test types — behavioral parity matrix (PRIMARY) + literal V1 snapshot (SECONDARY tripwire)
  - R-G: Deny rules emitted LAST so CASL "later rule wins" makes deny win
  - R-E: V2 is async; the 3 call sites at auth.controller.ts:65,474,566 must be updated
  - Subjects drift: BE only this phase; FE untouched
  - 3 new models: UserPermissionOverrideModel, ResourceGrantModel, extended RolePermissionModel
  - expires_at filter: SQL not JS (WHERE expires_at IS NULL OR expires_at > NOW())
  - Feature flag: TypeScript export in be/src/shared/config/index.ts
  - KB→Category cascade: Option A — single lazy CASL rule with $in: [...accessible KB ids]
phase_exit_checklist:
  - V1 builder rule emission unchanged in ability.service.ts:101-156 (only the dispatch shim is added)
  - config.permissions.useV2Engine defaults to false
  - V2 produces functionally identical results to V1 across the entire behavioral matrix for all 4 fixtures
  - 3 new models created and registered in ModelFactory
  - auth.controller.ts:65,474,566 call sites updated for async signature
  - Versioned cache prefix bumped (ability:v1: → ability:v2:); old cached rules naturally expire on next read
  - npm run build -w be clean
  - npm run test:permissions -w be clean (Phase 1 + Phase 2 specs all pass)
  - No FE changes — fe/src/lib/ability.tsx untouched
  - No middleware/route changes
  - The legacy rbac.ts shim is still active (this phase only adds V2 behind the flag)
---

# Phase 2: Ability Engine + Regression Snapshots

> **Goal**: Ship a new DB-backed `buildAbilityForV2()` behind a feature flag (`config.permissions.useV2Engine`, default `false`), and prove via a behavioral parity matrix + literal V1 snapshot tripwire that V2 produces identical CASL decisions to V1 for all four fixture roles. This is the safety net for the Phase 3 cutover.
>
> **Critical constraint**: Zero user-visible behavior change. The flag stays `false` until Phase 3.

---

## Plan Index

| Plan | Title | Wave | Depends On |
|---|---|---|---|
| P2.0 | Test infrastructure prep (snapshot dir + fixtures + helpers) | 0 | — |
| P2.6 | Seed-side fix migration: add `dataset.view` + `documents.view` to `user`/`leader` | 1 | P2.0 |
| P2.1 | Capture V1 ability snapshots (4 fixtures × deterministic JSON) | 2 | P2.6 |
| P2.2.0 | Create 3 new models (`UserPermissionOverrideModel`, `ResourceGrantModel`, extend `RolePermissionModel`) + register in `ModelFactory` | 2 | P2.0 |
| P2.2 | Implement `buildAbilityForV2()` (incl. KB→Category cascade synthesis from former P2.3) behind feature flag | 3 | P2.2.0, P2.1 |
| P2.4 | Parity test suite — behavioral matrix (PRIMARY) + literal snapshot tripwire (SECONDARY) | 4 | P2.2 |
| P2.5 | Versioned cache prefix bump (`ability:v1:` → `ability:v2:`) + 3 call-site async updates | 4 | P2.2 |

**Plan count: 7. Wave count: 5 (Wave 0 → 4).**

---

## Wave Plan (Parallelization)

```
Wave 0:                P2.0 (test infra prep)
                          |
Wave 1:                P2.6 (seed-side fix migration — MUST precede V1 snapshot capture
                              so V1 + day-one seed agree)
                          |
                +---------+---------+
Wave 2:        P2.1                P2.2.0
            (V1 snapshot           (3 new models)
             capture)
                +---------+---------+
                          |
Wave 3:                P2.2 (V2 builder w/ KB cascade synthesis)
                          |
                +---------+---------+
Wave 4:        P2.4                P2.5
           (parity tests)     (cache prefix +
                                 call-site async)
```

**Why P2.6 is in its own wave before P2.1**: If we capture V1 snapshots BEFORE the seed-side fix lands, V1 and the day-one seed disagree, and V2 (which is purely data-driven) cannot match V1 without a carve-out. Per locked decision D1, the seed-side fix is the chosen route — therefore the seed must land first.

**Why P2.2.0 (models) is parallel with P2.1 (snapshots)**: Models touch `be/src/shared/models/`; snapshot capture touches only `be/tests/permissions/__snapshots__/`. Zero file overlap.

---

## Plan P2.0 — Test Infrastructure Prep

**Goal**: Stand up the directory layout, fixture file, and Vitest helpers needed by P2.1 + P2.4 so neither plan has to invent infra.

**Inputs (read first)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/` — existing Vitest layout
- `/mnt/d/Project/b-solution/b-knowledge/be/vitest.config.ts` (or equivalent)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts` — `AbilityUserContext` shape
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/permissions/registry.ts` — for `getAllPermissions()` accessor

**Outputs (absolute paths)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/fixtures/users.ts` — 4 frozen `AbilityUserContext` fixtures
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/fixtures/resources.ts` — representative resource ids per subject
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/helpers/serializeRules.ts` — deterministic rule serializer
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/helpers/iterateMatrix.ts` — `(action, subject, fixture, resource) →` tuple iterator
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/__snapshots__/.gitkeep`
- `/mnt/d/Project/b-solution/b-knowledge/be/package.json` — add `"test:permissions": "vitest run tests/permissions"` script

**Tasks**:

1. **Create the fixture file** at `be/tests/permissions/fixtures/users.ts`. Export an array of exactly 4 `AbilityUserContext` objects with FROZEN ids/orgs/department so snapshots are deterministic:
   - `superAdminFixture` — `{ id: 'fixture-superadmin', role: UserRole.SUPER_ADMIN, current_org_id: 'org-fixture-1', is_superuser: true }`
   - `adminFixture` — `{ id: 'fixture-admin', role: UserRole.ADMIN, current_org_id: 'org-fixture-1', is_superuser: false }`
   - `leaderFixture` — `{ id: 'fixture-leader', role: UserRole.LEADER, current_org_id: 'org-fixture-1', is_superuser: false }`
   - `userFixture` — `{ id: 'fixture-user', role: UserRole.USER, current_org_id: 'org-fixture-1', is_superuser: false }`
   - Use constants from `@/shared/constants/index.js`. NO bare strings.
   - JSDoc + inline comments per project rules.
   - Acceptance: `npm run build -w be` clean; file imports without circular deps.

2. **Create resource fixture file** at `be/tests/permissions/fixtures/resources.ts`. Export a frozen map of representative resource ids per Subject — e.g. `{ KnowledgeBase: ['kb-fixture-1', 'kb-fixture-2'], DocumentCategory: ['cat-fixture-1'], Dataset: ['ds-fixture-1'], ... }`. These ids will be passed to `ability.can(action, subject, { id: resourceId })` in the parity matrix to verify rule conditions are evaluated identically.
   - Acceptance: file exports a `Readonly<Record<string, readonly string[]>>`; matches Subjects union.

3. **Create deterministic rule serializer** at `be/tests/permissions/helpers/serializeRules.ts`. Function signature:
   ```ts
   export function serializeRules(ability: AppAbility): string
   ```
   Implementation rules (CRITICAL for snapshot stability):
   - Read `ability.rules`
   - Sort rules by composite key `${rule.action}|${rule.subject}|${JSON.stringify(rule.conditions ?? {})}|${rule.inverted ? 'deny' : 'allow'}`
   - Within each rule, sort `conditions` keys alphabetically (recursive)
   - For `$in` arrays, sort the array
   - Return `JSON.stringify(sortedRules, null, 2)`
   - Inline comment explaining why determinism matters: snapshot diffs would otherwise flap on Map insertion order.
   - Acceptance: unit-tested in same file with two rule sets in different orders producing identical output.

4. **Create matrix iterator helper** at `be/tests/permissions/helpers/iterateMatrix.ts`. Signature:
   ```ts
   export function* iterateMatrix(opts: {
     fixtures: AbilityUserContext[]
     actions: readonly Actions[]
     subjects: readonly Subjects[]
     resourcesBySubject: Readonly<Record<string, readonly string[]>>
   }): Generator<{ fixture: AbilityUserContext; action: Actions; subject: Subjects; resourceId: string | undefined }>
   ```
   Yields every (fixture × action × subject × resourceId) tuple, plus one tuple per (fixture × action × subject) with `resourceId === undefined` (subject-class check). This is the load-bearing iterator behind the parity matrix.
   - Acceptance: unit test asserts cardinality = `fixtures.length × actions.length × subjects.length × (resourcesPerSubject + 1)`.

5. **Add vitest script** to `be/package.json`:
   ```json
   "test:permissions": "vitest run tests/permissions"
   ```
   Acceptance: `npm run test:permissions -w be` runs (zero tests is fine at this point — it just must not error).

**Tests (Vitest specs created in this plan)**:
- `be/tests/permissions/helpers/serializeRules.test.ts` — determinism test
- `be/tests/permissions/helpers/iterateMatrix.test.ts` — cardinality test

**Verification**:
```bash
cd be && npm run build && npm run test:permissions
```
Both must exit 0.

**Atomic commit message**:
```
test(phase-02): scaffold permission test infra — fixtures, helpers, snapshot dir
```

**Depends on**: nothing.

---

## Plan P2.6 — Seed-Side Fix Migration (Locked Decision D1)

**Goal**: Add a tiny Knex migration that inserts rows into `role_permissions` for the `user` and `leader` roles so they explicitly carry `dataset.view` and `documents.view`. This makes V1's hardcoded base rules at `ability.service.ts:113-114` explicit in the seed, so V2 can stay purely data-driven with no carve-outs.

**Why this MUST come before P2.1**: V1 snapshot capture happens after this migration runs. V1 already emitted these rules unconditionally — but the day-one seed from Phase 1's P1.5 does NOT (it followed `ROLE_PERMISSIONS` from `rbac.ts:113`, which doesn't carry `dataset.view`/`documents.view` for `user`). After this migration, V1 and the seed agree, and a data-driven V2 can match V1 with no exceptions.

**Inputs (read first)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts` — lines 113-114 (the unconditional rules)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/config/rbac.ts` — line 113 `ROLE_PERMISSIONS`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/permissions/registry.ts` — confirm exact keys (`dataset.view`, `documents.view` — verify spelling against the registry, adjust to whatever the actual registered keys are)
- Phase 1 P1.5 day-one seed migration — to mirror its insert pattern
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/db/migrations/` — locate the latest migration timestamp

**Outputs (absolute paths)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/db/migrations/<TIMESTAMP>_phase02_seed_user_leader_dataset_document_view.ts`

**Tasks**:

1. **Verify the exact registry keys** for "view dataset" and "view document". Likely candidates: `dataset.view`, `documents.view`, `knowledge_base.view`. Read `be/src/modules/knowledge-base/knowledge-base.permissions.ts` and `be/src/modules/rag/rag.permissions.ts` to find them. **DO NOT GUESS** — read the registry files. Document the chosen keys in a top-of-file comment in the migration.
   - Acceptance: comment in migration cites the registry file + line number.
   - **Hard halt:** if the keys cannot be found in the registry (e.g., the inventory predicted them but they don't exist), the executor MUST stop and escalate to the user. Inventing or substituting keys here would silently break V1/V2 parity for the `user` role. This is a P0 correctness gate.

2. **Generate the migration** with `npm run db:migrate:make phase02_seed_user_leader_dataset_document_view`.

3. **Write the `up()`** to:
   - Look up the `permissions.id` for each chosen key (use `knex('permissions').whereIn('key', [...]).select('id', 'key')`)
   - For each combination of `(role ∈ ['user', 'leader'])` × `(permission ∈ chosen keys)`, INSERT into `role_permissions` with `ON CONFLICT DO NOTHING` (idempotent — Phase 1 P1.5 may already have inserted some)
   - Use constants for role names from `@/shared/constants/roles.ts` — NO bare `'user'`/`'leader'` strings (read at migration time, hardcoded only inside the migration body itself since migrations cannot import TS app code easily — if migrations run via Knex CLI in JS context, use a `const ROLE_USER = 'user'` and `const ROLE_LEADER = 'leader'` at the top of the migration with a comment "must match @/shared/constants/roles.ts UserRole.USER / UserRole.LEADER")
   - Inline comments above each block explaining what V1 line in `ability.service.ts` it mirrors

4. **Write the `down()`** to DELETE the same rows using `whereIn` on `(role, permission_id)` tuples. Idempotent — must not error if rows are already gone.

5. **Add JSDoc** at the top of the migration explaining:
   - Why this exists (D1 locked decision)
   - That it backstops the upcoming V2 builder
   - That removing it would re-introduce a V1↔V2 parity gap

**Tests**: None — migration is verified by running it and by P2.1/P2.4 passing.

**Verification**:
```bash
cd be && npm run db:migrate
# Expect: Batch N run: 1 migration
node -e "require('./dist/...')" # spot check via psql:
psql -c "SELECT role, p.key FROM role_permissions rp JOIN permissions p ON rp.permission_id=p.id WHERE p.key IN ('<key1>','<key2>') AND role IN ('user','leader') ORDER BY role,p.key;"
# Expect: 4 rows (2 roles × 2 keys)
npm run db:migrate:rollback
# Expect: Batch N rolled back: 1 migration
psql -c "<same query>" # Expect: 0 rows
npm run db:migrate # Re-apply for downstream plans
```

**Atomic commit message**:
```
chore(phase-02): seed dataset.view + documents.view for user and leader roles (D1)
```

**Depends on**: P2.0 (technically only depends on Phase 1, but kept after P2.0 in the wave order so the test infra exists when P2.1 fires).

---

## Plan P2.1 — Capture V1 Ability Snapshots

**Goal**: Capture deterministic JSON snapshots of `buildAbilityFor()` (V1) output for the 4 fixture roles. These committed JSON files become the **secondary tripwire** in P2.4 — used to detect future drift in V1 itself.

**Critical**: This plan does NOT touch `ability.service.ts`. Snapshots are captured by calling the existing exported function. The seed-side fix from P2.6 has already run, so V1 output is now consistent with the day-one seed.

**Inputs (read first)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts` — V1 builder
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/fixtures/users.ts` — from P2.0
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/helpers/serializeRules.ts` — from P2.0

**Outputs (absolute paths)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/__snapshots__/v1-superadmin.json`
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/__snapshots__/v1-admin.json`
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/__snapshots__/v1-leader.json`
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/__snapshots__/v1-user.json`
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/v1-snapshot-capture.test.ts`

**Tasks**:

1. **Write the snapshot capture spec** at `be/tests/permissions/v1-snapshot-capture.test.ts`. For each of the 4 fixtures:
   - Call `buildAbilityFor(fixture)` (V1 — synchronous)
   - Run output through `serializeRules`
   - On first run, write the JSON file to `__snapshots__/v1-<role>.json`
   - On subsequent runs, **assert equality** with the committed file (this becomes the V1 drift tripwire)
   - Use Vitest's `toMatchFileSnapshot` if available, otherwise hand-roll: `expect(serialized).toBe(fs.readFileSync(snapshotPath, 'utf8'))`
   - Inline comment above the assertion: "SECONDARY tripwire — fails if anyone edits V1 rule emission in ability.service.ts. Behavioral parity is enforced separately in P2.4."

2. **Run the spec once to generate snapshots**, then commit the JSON files as fixtures.

3. **Verify determinism**: run the spec a second time — must pass with no diff.

**Tests**:
- `be/tests/permissions/v1-snapshot-capture.test.ts` — 4 assertions, one per fixture

**Verification**:
```bash
cd be && npm run test:permissions -- v1-snapshot-capture
# Expect: 4 passing
git status be/tests/permissions/__snapshots__/
# Expect: 4 new JSON files (or unchanged after second run)
```

**Atomic commit message**:
```
test(phase-02): capture V1 ability snapshots for 4 role fixtures (drift tripwire)
```

**Depends on**: P2.6 (seed must agree with V1), P2.0 (fixtures + serializer).

---

## Plan P2.2.0 — Create 3 New Models

**Goal**: Create the data-access layer the V2 builder needs: `UserPermissionOverrideModel`, `ResourceGrantModel`, and a new method on `RolePermissionModel` that JOINs to `permissions` so the V2 builder can fetch `{key, action, subject}[]` in one round-trip.

**Critical layering**: ALL DB queries live in the model. The V2 builder (a service-layer concern under `shared/services/`) calls these model methods — never raw `db()`.

**Inputs (read first)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/role-permission.model.ts` — existing (extend it)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/index.ts` — `ModelFactory` registration pattern
- A representative existing model in `be/src/shared/models/` to mirror the BaseModel pattern (e.g. `user.model.ts`)
- Phase 1 P1.1 migration to confirm column names: `permissions(id, key, action, subject, ...)`, `role_permissions(role, permission_id, ...)`, `user_permission_overrides(user_id, permission_id, effect, expires_at, ...)`, `resource_grants(resource_type, resource_id, grantee_type, grantee_id, actions, tenant_id, expires_at, ...)`
- `/mnt/d/Project/b-solution/b-knowledge/be/CLAUDE.md` — "Models" + "Layering Rules" sections

**Outputs (absolute paths)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/user-permission-override.model.ts` — NEW
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/resource-grant.model.ts` — NEW
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/role-permission.model.ts` — EXTENDED with `findByRoleWithSubjects`
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/models/index.ts` — register all 3 in `ModelFactory`

**Tasks**:

1. **Extend `RolePermissionModel`** with one new method:
   ```ts
   /**
    * @description Loads all permissions for a role JOINed with the permissions catalog so the
    * caller receives ready-to-use {key, action, subject} tuples without a second round-trip.
    * Used by the V2 ability builder to translate role assignments into CASL rules.
    *
    * @param {string} role - Role identifier (e.g. UserRole.ADMIN)
    * @param {string} tenantId - Tenant scope; passed through for query observability and to keep
    *                            the call site honest about scoping (the role_permissions table is
    *                            global today, but signature is forward-compatible with per-tenant overrides)
    * @returns {Promise<Array<{ key: string; action: string; subject: string }>>}
    */
   async findByRoleWithSubjects(role: string, tenantId: string): Promise<Array<{ key: string; action: string; subject: string }>>
   ```
   - Implementation: `this.knex('role_permissions as rp').join('permissions as p', 'rp.permission_id', 'p.id').where('rp.role', role).select('p.key', 'p.action', 'p.subject')`
   - Inline comment: "Single query — V2 builder cannot afford an N+1 here; this runs on every uncached request"
   - Use indexed columns (`role_permissions.role` should be indexed per Phase 1 P1.1)

2. **Create `UserPermissionOverrideModel`** at `be/src/shared/models/user-permission-override.model.ts`. Extends `BaseModel`. Methods:
   ```ts
   /**
    * @description Fetches all currently-active overrides for a user, JOINed with permissions catalog.
    * Filters expired overrides at the SQL level (not in JS) per locked decision.
    * @param {string} userId
    * @returns {Promise<Array<{ key: string; action: string; subject: string; effect: 'allow' | 'deny' }>>}
    */
   async findActiveByUserWithSubjects(userId: string): Promise<Array<{ key: string; action: string; subject: string; effect: string }>>
   ```
   - SQL: `select p.key, p.action, p.subject, upo.effect from user_permission_overrides upo join permissions p on upo.permission_id=p.id where upo.user_id = ? and (upo.expires_at is null or upo.expires_at > NOW())`
   - Inline comment: "expires_at filter is in SQL not JS — per locked decision, Phase 7 expires_at UI is a no-op test addition"

3. **Create `ResourceGrantModel`** at `be/src/shared/models/resource-grant.model.ts`. Extends `BaseModel`. Methods:
   ```ts
   /**
    * @description Fetches all active grants where the user (or one of their teams, or their role) is the grantee,
    * scoped to the given tenant. Filters expired grants at the SQL level.
    *
    * @param {object} params
    * @param {string} params.userId
    * @param {string[]} params.teamIds  - Team memberships (may be empty)
    * @param {string} params.role       - User's role (e.g. UserRole.ADMIN) — grants can target a role as principal
    * @param {string} params.tenantId   - Tenant scope (mandatory)
    * @returns {Promise<Array<{ resource_type: string; resource_id: string; actions: string[]; tenant_id: string }>>}
    */
   async findActiveForUser(params: { userId: string; teamIds: string[]; role: string; tenantId: string }): Promise<Array<{ resource_type: string; resource_id: string; actions: string[]; tenant_id: string }>>
   ```
   - SQL: select where `tenant_id = :tenantId` AND `(expires_at IS NULL OR expires_at > NOW())` AND `((grantee_type='user' AND grantee_id = :userId) OR (grantee_type='team' AND grantee_id = ANY(:teamIds)) OR (grantee_type='role' AND grantee_id = :role))`
   - Use parameterized query (no string concatenation)
   - Inline comment block explaining the three-way grantee union and why tenant_id is the FIRST predicate (index hit)

4. **Register all 3 in `ModelFactory`** at `be/src/shared/models/index.ts` using the existing lazy-getter pattern. Names: `userPermissionOverride`, `resourceGrant`, `rolePermission` (already exists — just extended).

5. **Document each model file** with the standard JSDoc header per `be/CLAUDE.md`.

**Tests** (created in this plan — model-level unit tests, NOT the parity tests):
- `be/tests/permissions/models/role-permission.model.test.ts` — `findByRoleWithSubjects` returns correct join shape against an in-memory or test DB. Covers: empty role, role with N permissions, indexed query path.
- `be/tests/permissions/models/user-permission-override.model.test.ts` — `findActiveByUserWithSubjects` filters expired rows (SQL test: insert one row with `expires_at = NOW() - INTERVAL '1 hour'`, one with NULL, one with `NOW() + INTERVAL '1 hour'`; assert only the latter two return).
- `be/tests/permissions/models/resource-grant.model.test.ts` — `findActiveForUser` covers all three grantee types + tenant isolation (insert grant in T2, query as T1 user, expect zero rows).

**Verification**:
```bash
cd be && npm run build && npm run test:permissions -- models
# Expect: all model specs pass
```

**Atomic commit message**:
```
feat(phase-02): add ResourceGrantModel + UserPermissionOverrideModel + extend RolePermissionModel
```

**Depends on**: P2.0 (test infra). Independent of P2.6 (different files).

---

## Plan P2.2 — Implement `buildAbilityForV2()` (with KB→Category Cascade)

**Goal**: Implement the new DB-backed builder behind the `config.permissions.useV2Engine` feature flag. Includes the KB→Category cascade synthesis (formerly P2.3 in the roadmap, merged here per the user-supplied wave plan since cascade synthesis is just one more step inside the V2 builder and splitting it would mean the parity tests in P2.4 can't run yet against a complete V2).

**Critical constraints**:
- V1 builder at `ability.service.ts:101-156` is **untouched**. Only the dispatch shim is added.
- The shim becomes async (locked decision R-E). The 3 call sites are updated in P2.5, NOT here.
- Deny rules emitted **LAST** (locked decision R-G) so CASL "later wins" makes deny win.
- Step ordering (locked): super-admin shortcut → role-defaults → resource_grants → allow overrides → ABAC overlay → **deny overrides last**.
- KB→Category cascade: ONE generic rule with `$in: [...]` (locked Option A). Cascade is `read`-only.
- Subject union expansion: V2 may emit rules on `DocumentCategory` (already in the V1 union? — verify; if not, add it to the `Subjects` type alias at the top of `ability.service.ts`. This is a BE-only change per locked "Subjects drift" decision; FE is untouched.)

**Inputs (read first)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts` — V1 (the file we edit)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/config/index.ts` — to add the flag
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/config/rbac.ts` — line 113 for the legacy mapping reference
- The 3 new models from P2.2.0
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/permissions/registry.ts` — to confirm `(action, subject)` pairs exist for each registered key
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/constants/permissions.ts` — extend if any new constants are needed (e.g. `KB_RESOURCE_TYPE = 'knowledge_base'`, `CATEGORY_RESOURCE_TYPE = 'document_category'`, `EFFECT_DENY = 'deny'`, `EFFECT_ALLOW = 'allow'`, `GRANTEE_TYPE_USER`, `GRANTEE_TYPE_TEAM`, `GRANTEE_TYPE_ROLE`)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/team.service.ts` (or wherever team membership is loaded) — for the `teamIds` lookup the V2 builder needs

**Outputs (absolute paths)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/config/index.ts` — add `permissions: { useV2Engine: boolean }` reading from env (default `false`)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts` — EDIT (add async dispatch shim + new `buildAbilityForV2`; V1 untouched below the shim)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/constants/permissions.ts` — extend with any new constants

**Tasks**:

1. **Add the feature flag** to `be/src/shared/config/index.ts`:
   ```ts
   permissions: {
     // When true, buildAbilityFor dispatches to the V2 DB-backed builder.
     // Defaults false until Phase 3 cutover. Read once at module load.
     useV2Engine: parseBool(process.env.PERMISSIONS_USE_V2_ENGINE, false),
   }
   ```
   Add JSDoc; add a corresponding entry to `.env.example` if the project tracks it.

2. **Extend `Subjects` union** in `ability.service.ts` if `DocumentCategory` is not already present. Inline comment: "BE-only superset per locked Subjects-drift decision. FE reconciliation is Phase 4."

3. **Add `buildAbilityForV2` (async)** in `ability.service.ts`. Steps in this exact order:

   a. **Super-admin shortcut** (mirror V1 lines 105-108): if `is_superuser || role === SUPER_ADMIN` → `can('manage', 'all')` → return.

   b. **Load role defaults** via `ModelFactory.rolePermission.findByRoleWithSubjects(user.role, user.current_org_id)`. For each row, emit `can(row.action, row.subject, tenantCondition)`.

   c. **Load resource grants** via `ModelFactory.resourceGrant.findActiveForUser({ userId, teamIds, role, tenantId })`. For each grant, expand `actions[]` into one `can(action, mappedSubject, { id: resource_id, tenant_id })` rule. Map `resource_type` → `Subject` via a constant table (`{ knowledge_base: 'KnowledgeBase', document_category: 'DocumentCategory', dataset: 'Dataset', ... }`) defined in `be/src/shared/constants/permissions.ts`.

   d. **KB → Category cascade synthesis** (locked Option A). After resource_grants are processed:
      - Compute the set of KB ids the user can `read` (from role_defaults that grant `read KnowledgeBase` plus grants where `resource_type === KB_RESOURCE_TYPE` and `actions` includes `read`).
      - If the set is non-empty, emit ONE rule:
        ```ts
        can('read', 'DocumentCategory', { tenant_id: user.current_org_id, knowledge_base_id: { $in: [...accessibleKbIds] } })
        ```
      - Inline comment block: "TS8 cascade. Read-only — write actions remain independent. Single rule per builder run; the $in list is materialized once."

   e. **Allow overrides** via `ModelFactory.userPermissionOverride.findActiveByUserWithSubjects(user.id)`. For rows where `effect === EFFECT_ALLOW`, emit `can(action, subject, tenantCondition)`.

   f. **ABAC overlay** (preserve V1 behavior — iterate the `policies` arg, but ONLY the `effect === 'allow'` ones here; deny ABAC rules go in the deny pass at step (g)).

   g. **Deny overrides emitted LAST** (locked R-G). Iterate `userPermissionOverride` rows where `effect === EFFECT_DENY` AND iterate `policies` where `effect === 'deny'`. For each, emit `cannot(action, subject, conditions)`.

   h. `return build()`.

   - Wrap each step (b-g) with an inline comment block explaining what it does and why it's at that position in the ordering.
   - JSDoc on the function describing the locked step ordering.

4. **Add the dispatch shim**. Convert the existing exported `buildAbilityFor` to:
   ```ts
   export async function buildAbilityFor(user, policies = []): Promise<AppAbility> {
     if (config.permissions.useV2Engine) {
       return buildAbilityForV2(user, policies)
     }
     return buildAbilityForV1Sync(user, policies)
   }
   ```
   - Rename the existing synchronous V1 implementation to `buildAbilityForV1Sync` (un-exported) — its body is byte-identical to today's `buildAbilityFor`. **No edits inside V1.**
   - Update the `abilityService` singleton export to reference the new async `buildAbilityFor`.
   - Inline comment above the shim: "Dispatch shim. V1 stays untouched; V2 sits behind config.permissions.useV2Engine. Phase 3 flips the flag."

5. **Constants pass**: ensure NO bare strings — every `'allow'`, `'deny'`, `'knowledge_base'`, `'team'`, `'user'`, `'role'`, `'$in'`-key sentinel comes from `be/src/shared/constants/permissions.ts`. Extend that file as needed.

6. **JSDoc + inline comments** per project rules. Every new exported symbol gets `@description`, `@param`, `@returns`. Every conditional / loop gets an inline comment.

**Tests**:
- This plan does NOT add tests (those are P2.4). It MUST, however, leave the existing test suite green:
  ```bash
  cd be && npm run build && npm run test
  ```
  Expect: same pass count as before this plan + zero new failures.

**Verification**:
```bash
cd be && npm run build
# Expect: clean
npm run test
# Expect: existing suite passes (V1 path is the default since flag = false)
PERMISSIONS_USE_V2_ENGINE=true npm run test -- --grep "ability"
# Expect: V2 path runs without throwing — no parity assertions yet (those are P2.4),
# but the V2 builder must at least construct an ability for each fixture without error
```

**Atomic commit message**:
```
feat(phase-02): add buildAbilityForV2 + KB→Category cascade behind feature flag
```

**Depends on**: P2.2.0 (models exist), P2.1 (snapshots exist — not strictly required to write V2, but P2.4 lands in the same wave window so the order keeps the dependency chain explicit).

---

## Plan P2.4 — Parity Test Suite (PRIMARY behavioral matrix + SECONDARY snapshot tripwire)

**Goal**: This is the **load-bearing test of the entire milestone**. Two distinct test files with two distinct jobs:

1. **PRIMARY — Behavioral parity matrix** (`v1-v2-parity.test.ts`): For every `(action × subject × fixture × resourceId)` tuple in the matrix, assert `v1.can(...) === v2.can(...)`. This is the safety net for Phase 3 cutover.
2. **SECONDARY — Literal snapshot tripwire** (`v2-vs-v1-snapshot.test.ts`): Asserts `serializeRules(v2) === serializeRules(v1)` for each fixture. Detects rule-shape drift, not just decision drift. (The V1 snapshot capture from P2.1 is the OTHER tripwire — it watches V1 itself.)

The plan must label which file does which job in a top-of-file comment so a future reader doesn't conflate them.

**Inputs (read first)**:
- All P2.0 helpers and fixtures
- The P2.1 V1 snapshots
- `be/src/shared/services/ability.service.ts` (post-P2.2)
- `be/src/shared/permissions/registry.ts` — for `getAllPermissions()` to drive matrix enumeration
- `be/src/shared/config/index.ts` — for the feature flag

**Outputs (absolute paths)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/v1-v2-parity.test.ts` — PRIMARY
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/v2-vs-v1-snapshot.test.ts` — SECONDARY tripwire
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/cascade.test.ts` — TS8 cascade behavior
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/override-precedence.test.ts` — R-G deny-wins
- `/mnt/d/Project/b-solution/b-knowledge/be/tests/permissions/tenant-isolation.test.ts` — tenant cross-leak rejection

**Tasks**:

1. **Write the PRIMARY parity matrix** at `be/tests/permissions/v1-v2-parity.test.ts`. Top-of-file comment:
   ```
   // PRIMARY parity test for Phase 2.
   // This file enumerates the FULL behavioral matrix:
   //   (every fixture) × (every action) × (every subject) × (every representative resource id + the no-id case)
   // and asserts v1.can(...) === v2.can(...) for every tuple.
   //
   // This is the load-bearing safety net for the Phase 3 cutover. If this file passes,
   // flipping config.permissions.useV2Engine to true MUST be a no-op for end users.
   //
   // The literal-snapshot tripwire lives in a sibling file (v2-vs-v1-snapshot.test.ts);
   // do not merge the two — they catch different bugs.
   ```
   Implementation:
   - Build V1 ability via `buildAbilityForV1Sync(fixture)` and V2 via `buildAbilityForV2(fixture)`. **Both functions MUST be exposed via a single `__forTesting` named export from `ability.service.ts`** — no config-mutation in tests, no temporary flag flips. The export is documented inline as test-only and is NOT re-exported through any barrel.
   - Build V2 ability via `buildAbilityForV2(fixture)` (await it).
   - Iterate the matrix using the P2.0 `iterateMatrix` helper.
   - For each tuple, use `expect.soft` so a single failure doesn't mask the rest:
     ```ts
     const v1Result = resourceId ? v1.can(action, subject as any, { id: resourceId }) : v1.can(action, subject)
     const v2Result = resourceId ? v2.can(action, subject as any, { id: resourceId }) : v2.can(action, subject)
     expect.soft(v2Result, `${fixture.role} ${action} ${subject} ${resourceId ?? '(class)'}`).toBe(v1Result)
     ```
   - Emit a final `expect.soft` summary count.
   - Acceptance: ALL tuples must agree for ALL 4 fixtures.

2. **Write the SECONDARY tripwire** at `be/tests/permissions/v2-vs-v1-snapshot.test.ts`. Top-of-file comment:
   ```
   // SECONDARY tripwire for Phase 2.
   // Asserts the SERIALIZED RULE LIST of V2 equals the serialized rule list of V1
   // (after deterministic sort) for each fixture.
   //
   // This catches rule-shape drift that wouldn't show up in the behavioral matrix —
   // e.g. V2 emitting two equivalent rules where V1 emits one. Such drift is benign
   // for users today but can break future code that introspects ability.rules.
   ```
   For each fixture, serialize V1 + V2 rules and `expect(serializedV2).toBe(serializedV1)`. On mismatch, the diff IS the failure message — this is exactly what makes it a tripwire.

3. **Write `cascade.test.ts`** for TS8:
   - **Test A — read cascade fires**: Insert a `resource_grants` row granting `read` on a KB to the `userFixture`. Build V2 ability. Assert `v2.can('read', 'DocumentCategory', { knowledge_base_id: '<that-kb-id>' }) === true`. Assert ALSO that `v2.can('read', 'DocumentCategory', { knowledge_base_id: '<other-kb-id>' }) === false`.
   - **Test B — write does NOT cascade**: Grant `update` on a KB. Assert `v2.can('update', 'DocumentCategory', { knowledge_base_id: '<that-kb-id>' }) === false`. (Cascade is read-only per locked decision.)
   - **Test C — single rule materialization**: Inspect `v2.rules` and assert exactly ONE `DocumentCategory` cascade rule exists, with conditions `{ $in: [...] }` containing both KB ids when the user has access to two KBs. (Locked Option A: ONE generic rule, not N specific rules.)

4. **Write `override-precedence.test.ts`** for R-G:
   - Insert `user_permission_overrides` row with `effect = deny` for `kb.delete` against an admin fixture. Build V2 ability. Assert `v2.can('delete', 'KnowledgeBase') === false`. Assert `v2.can('read', 'KnowledgeBase') === true` (deny is targeted, not blanket).
   - Insert an allow override for `user` fixture on a permission `user` doesn't normally have. Assert `v2.can(...) === true`.
   - **Critical ordering test**: Insert BOTH an allow AND a deny override on the same `(action, subject)` tuple. Assert deny wins. Inline comment: "This is the load-bearing R-G test. Deny is emitted LAST in V2 — CASL 'later rule wins'."

5. **Write `tenant-isolation.test.ts`**:
   - Insert a `resource_grants` row in tenant T2 for the `adminFixture` (whose `current_org_id = 'org-fixture-1' = T1`). Build V2 ability. Assert `v2.can('read', 'KnowledgeBase', { id: '<the-T2-resource-id>' }) === false`. The rule simply must not be loaded.
   - Tenant filtering correctness is validated by the model-layer test in P2.2.0 (which directly asserts the WHERE clause shape). Do NOT rely on SQL log inspection — it's flaky and not in scope here.
   - **Override + grant test exhaustiveness gate (covers the Q15 matrix asymmetry):** since V1 has no override/grant logic, the parity matrix CANNOT prove V2's correctness on those code paths. This file plus `override-precedence.test.ts` are the ONLY safety net for them. Before declaring P2.4 done, the executor MUST cross-check that every edge case enumerated in `2-RESEARCH.md` §10 is covered by at least one test in this file or `override-precedence.test.ts`. Specifically: (a) override on a registry-missing key (skip+log), (b) deny-only for a permission the role doesn't grant (no-op), (c) idempotent allow on already-granted permission, (d) expired grant filtered, (e) grant for unknown resource_type (skip+log), (f) cross-tenant override attempt rejected at query layer, (g) user with empty role_permissions in current tenant (empty ability). Any uncovered case → STOP and report.

**Database setup for these tests**: Use Vitest `beforeEach` to seed rows directly via `ModelFactory` (NOT raw `db()` — layering rule applies even in tests). Use a transaction-per-test pattern with rollback in `afterEach` to keep tests isolated. If the project doesn't already have this, mirror the pattern from any Phase 1 test.

**Verification**:
```bash
cd be && npm run test:permissions
# Expect ALL of:
#   v1-snapshot-capture.test.ts                 4 passing
#   v1-v2-parity.test.ts                        N tuples × 4 fixtures all passing (likely 1000+)
#   v2-vs-v1-snapshot.test.ts                   4 passing
#   cascade.test.ts                             3 passing
#   override-precedence.test.ts                 3 passing
#   tenant-isolation.test.ts                    1 passing
#   models/*.test.ts                            from P2.2.0
#   helpers/*.test.ts                           from P2.0
```

**If parity matrix fails**: DO NOT loosen the assertions. Either fix V2, fix the seed (P2.6), or escalate. Loosening these tests defeats the entire phase.

**Atomic commit message**:
```
test(phase-02): V1↔V2 parity matrix + cascade + override + tenant isolation suite
```

**Depends on**: P2.2 (V2 builder exists).

---

## Plan P2.5 — Versioned Cache Prefix + Async Call-Site Updates

**Goal**: Bump the Redis cache key prefix from `ability:` to `ability:v2:` so old cached rules from any prior deploy naturally expire on next read (locked R-2 mitigation), AND update the 3 `auth.controller.ts` call sites to await the now-async `buildAbilityFor`.

**Inputs (read first)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts` — `ABILITY_CACHE_PREFIX` constant at line ~75
- `/mnt/d/Project/b-solution/b-knowledge/be/src/modules/auth/auth.controller.ts` — lines 65, 474, 566 (the 3 call sites)
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/constants/permissions.ts` — to host the new prefix constant

**Outputs (absolute paths)**:
- `/mnt/d/Project/b-solution/b-knowledge/be/src/shared/services/ability.service.ts` — bump prefix
- `/mnt/d/Project/b-solution/b-knowledge/be/src/modules/auth/auth.controller.ts` — 3 call site edits

**Tasks**:

1. **Move the prefix constant** to `be/src/shared/constants/permissions.ts`:
   ```ts
   /**
    * @description Redis key prefix for cached CASL ability rules.
    * Bumped from 'ability:' → 'ability:v2:' in Phase 2 (R-2 mitigation):
    * old cached rules naturally expire on next read post-deploy, so we never
    * serve a stale V1 ability after the V2 cutover in Phase 3.
    */
   export const ABILITY_CACHE_PREFIX = 'ability:v2:'
   ```
   Update `ability.service.ts` to import from there. Delete the local const.
   Inline comment in `ability.service.ts` at the import: "Versioned prefix — see constants/permissions.ts for rationale."

2. **Update the 3 call sites** in `auth.controller.ts`. Each one currently calls `buildAbilityFor(...)` synchronously; convert to `await buildAbilityFor(...)`. The enclosing functions are already async (per the locked R-E note in the prompt) so no signature changes ripple further. Read each line carefully and add an inline comment above the await: `// buildAbilityFor became async in Phase 2 (V2 reads from DB).`

3. **Verification — old keys expire correctly**: Add a tiny test at `be/tests/permissions/cache-prefix.test.ts` that:
   - Asserts `ABILITY_CACHE_PREFIX === 'ability:v2:'`
   - Asserts that `cacheAbility(sessionId, ability)` writes to a key starting with `ability:v2:`
   - Asserts that `loadCachedAbility(sessionId)` returns null when only an old `ability:<sessionId>` key (no `v2:`) exists in Redis (verifies natural expiry behavior).

4. **No middleware/route changes** beyond the 3 controller call sites. Confirm via:
   ```bash
   grep -rn "buildAbilityFor" be/src/ | grep -v "ability.service.ts"
   ```
   Output must show ONLY the 3 lines in `auth.controller.ts` (modulo any test files). If anything else surfaces, await it too — but the prompt asserts 3 sites; an extra hit means the prompt was stale and you should flag it in the structured return.

**Verification**:
```bash
cd be && npm run build
# Expect: clean (no missed awaits, no type errors from async drift)
npm run test:permissions
# Expect: cache-prefix.test.ts passes; full suite green
```

**Atomic commit message**:
```
refactor(phase-02): bump ability cache prefix to v2 + await new async buildAbilityFor at auth call sites
```

**Depends on**: P2.2 (V2 + dispatch shim must exist before call sites can be made async).

---

## Verification Matrix — Requirements → Plans

| Requirement | Acceptance Criterion | Plan(s) | Verifying Test |
|---|---|---|---|
| **TS5** Unified ability engine | `buildAbilityFor()` reads from `role_permissions` + `user_permission_overrides` (allow + deny) + `resource_grants` filtered by `tenant_id`; super-admin shortcut preserved; existing Redis cache works | P2.2 (builder), P2.2.0 (models), P2.5 (cache + call sites) | `v1-v2-parity.test.ts`, `cache-prefix.test.ts` |
| **TS5** Snapshot regression | Compares V2 rule output against V1 builder for fixed user fixtures (admin/leader/user/super-admin) and asserts identical behavior | P2.1 (V1 capture), P2.4 (V2-vs-V1) | `v1-snapshot-capture.test.ts`, `v2-vs-v1-snapshot.test.ts`, `v1-v2-parity.test.ts` |
| **TS8** KB→Category cascade for view | `read` on KB cascades to `read DocumentCategory` for that KB; `update` on KB does NOT cascade | P2.2 (cascade synthesis step) | `cascade.test.ts` (Tests A, B, C) |
| **TS15** Regression snapshot subset | Snapshot tests pass; cascade test passes; override allow/deny precedence test passes; tenant cross-leak test passes | P2.1, P2.4 | All tests under `be/tests/permissions/` |
| **R-1** safety net for shim cutover | Parity proven BEFORE Phase 3 ships shim | P2.1 + P2.4 | `v1-v2-parity.test.ts` |
| **R-2** Redis cache stale post-deploy | Versioned prefix bumped; old keys naturally expire | P2.5 | `cache-prefix.test.ts` |
| **R-6** test coverage gap on `ability.service` | Comprehensive suite under `be/tests/permissions/` exists | P2.0, P2.1, P2.2.0, P2.4 | Entire suite |
| **R-12** cache key tenant scoping | Org-switch path verification deferred to Phase 3, but this phase keeps `<orgId>` out of the key only because the session itself rotates on org switch — documented inline | P2.5 (comment in cache prefix block) | n/a (Phase 3) |

**Acceptance test scenarios from REQUIREMENTS.md covered by this phase**:

| Scenario | Plan | Test |
|---|---|---|
| Day-one user with role `admin` does every action they could before | P2.4 | `v1-v2-parity.test.ts` (admin fixture, all tuples) |
| Day-one user with role `user` does `view_chat` | P2.4 | `v1-v2-parity.test.ts` (user fixture, `read ChatAssistant`) |
| Granting `view` on KB X to user Y → Y can read every category in KB X without explicit category grants | P2.4 | `cascade.test.ts` Test A |
| Granting `update` on KB X to user Y → Y cannot update categories in KB X | P2.4 | `cascade.test.ts` Test B |
| Per-user `deny` override on `kb.delete` → admin cannot delete KBs but can still view/create/edit | P2.4 | `override-precedence.test.ts` |
| User Y in tenant T1 attempts to grant access on a KB in tenant T2 | P2.4 | `tenant-isolation.test.ts` |

---

## Phase Exit Checklist

Before declaring Phase 2 done, ALL of the following MUST be true. Verify with the listed command and paste the output into the phase UAT report.

- [ ] **V1 unchanged** — `git diff phase-01-completion..HEAD -- be/src/shared/services/ability.service.ts` shows ONLY the dispatch shim addition + Subjects union extension + V1 fn rename to `buildAbilityForV1Sync`. No edits inside the V1 rule emission block (lines 101-156 of original).
- [ ] **Feature flag defaults false** — `grep -n "useV2Engine" be/src/shared/config/index.ts` shows the parser defaulting to `false`. Confirmed by booting BE with no env var set: V1 path runs.
- [ ] **V2 produces functionally identical results to V1** — `npm run test:permissions -w be -- v1-v2-parity` passes for all 4 fixtures with zero soft-failures.
- [ ] **3 new models created and registered in `ModelFactory`** — `grep -n "userPermissionOverride\|resourceGrant\|rolePermission" be/src/shared/models/index.ts` shows all three lazy-getters.
- [ ] **`auth.controller.ts:65,474,566` call sites updated for async signature** — `grep -n "await buildAbilityFor\|buildAbilityFor(" be/src/modules/auth/auth.controller.ts` shows three `await` calls and zero non-awaited calls.
- [ ] **Versioned cache prefix bumped** — `grep -n "ABILITY_CACHE_PREFIX" be/src/shared/constants/permissions.ts` shows `'ability:v2:'`. `cache-prefix.test.ts` passes.
- [ ] **`npm run build -w be` clean** — exit 0, zero TS errors.
- [ ] **`npm run test:permissions -w be` clean** — full suite (Phase 1 + Phase 2 specs) all passing.
- [ ] **No FE changes** — `git diff phase-01-completion..HEAD -- fe/` returns empty. `fe/src/lib/ability.tsx` untouched.
- [ ] **No middleware/route changes** — `git diff phase-01-completion..HEAD -- be/src/shared/middleware/ be/src/modules/*/routes/` returns empty (excluding any new files in `be/tests/`).
- [ ] **Legacy `rbac.ts` shim still active** — `grep -n "ROLE_PERMISSIONS" be/src/shared/config/rbac.ts` shows the legacy map untouched. Phase 3 converts this to a shim, not Phase 2.
- [ ] **Locked R-G ordering** — `override-precedence.test.ts` "deny wins over allow on same key" test passes.
- [ ] **Locked Option A cascade** — `cascade.test.ts` Test C passes (exactly ONE `DocumentCategory` rule with `$in`).
- [ ] **Locked SQL `expires_at`** — `grep -rn "expires_at" be/src/shared/models/user-permission-override.model.ts be/src/shared/models/resource-grant.model.ts` shows `IS NULL OR expires_at > NOW()` SQL, NOT JS `Date.now()` filtering.
- [ ] **No stray `buildAbilityFor` callers** — `grep -rn "buildAbilityFor" be/src --include='*.ts' | grep -v 'ability.service.ts' | wc -l` returns exactly **3** (the three updated `auth.controller.ts` call sites). If any new caller appeared between Phase 1 and now, it must also be updated for the async signature.
- [ ] **Q15 override/grant test exhaustiveness** — Every edge case in `2-RESEARCH.md` §10 (cases a–g) has at least one test in `override-precedence.test.ts` OR `tenant-isolation.test.ts`. Cross-checked manually before merging the phase.

**Human review gate**: Before merging the phase, the user MUST review the parity matrix output (P2.4) row count. Expected ballpark: `4 fixtures × ~5 actions × ~12 subjects × (~3 representative ids + 1 class check) ≈ 960 assertions`. If the row count is dramatically lower, the matrix iterator is under-enumerating and the safety net has a hole.

---

## Out of Scope (Phase 2)

These appear in the roadmap or REQUIREMENTS.md but are explicitly NOT in this phase. Do not let them creep in:

- **Wiring V2 into the request path beyond the 3 auth.controller call sites** — Phase 3 flips the flag and migrates middleware. P2.5 only updates the existing call sites for the new async signature.
- **Any FE work** — Subjects reconciliation, `<Can>` codemod, catalog hook all live in Phase 4.
- **Any middleware refactor** — `requirePermission` / `requireAbility` are Phase 3.
- **`whoCanDo` helper** — Phase 3 (TS14).
- **`expires_at` admin UI** — Phase 7 stretch (SH3) — but the SQL filter from this phase makes that a no-op test addition when SH3 ships.
- **OpenSearch grant translation** — Phase 6 (TS9).
- **Removing legacy `rbac.ts`** — Phase 3 converts to shim; Phase 6 finishes legacy cleanup.

---

*Generated for Phase 2 — Ability Engine + Regression Snapshots. Input to `/gsd:execute-phase 02-ability-engine-regression-snapshots`.*
