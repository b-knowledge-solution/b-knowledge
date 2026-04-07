# Phase 2: Ability Engine + Regression Snapshots — Research

**Researched:** 2026-04-07
**Domain:** CASL ability builder, DB-backed RBAC, regression-snapshot testing
**Confidence:** HIGH (every claim cites file:line; Phase 1 artifacts already shipped)

## Summary

Phase 2 builds `buildAbilityForV2()` next to the existing `buildAbilityFor()` in `be/src/shared/services/ability.service.ts`, behind a `config.permissions.useAbilityEngineV2` env-driven flag (default `false`). It reads from `role_permissions`, `user_permission_overrides`, and `resource_grants` (all created/seeded in Phase 1) and emits CASL rules whose **sorted JSON form is byte-identical** to the V1 builder for the four canonical fixture roles. A regression-snapshot suite locks V1 output first, then asserts parity, then exercises override precedence, KB→Category cascade, tenant scoping, and edge cases. V2 is **not** wired into any request path in this phase — Phase 3 flips the switch.

**Primary recommendation:** Capture the V1 snapshot in P2.1 *before writing a single line of V2 code*. The snapshot is the contract; everything else is implementation.

## User Constraints (from ROADMAP + REQUIREMENTS)

### Locked Decisions (apply to Phase 2)
- Single CASL engine fed from DB-backed catalog
- RBAC + per-user **allow + deny** overrides; allow + deny may coexist on the same `(user, key)` tuple (Phase 1 unique constraint includes `effect`)
- KB → Category **cascade for `read` only**, independent for write actions (TS8)
- Super-admin keeps cross-tenant `manage all` (preserve `ability.service.ts:105` shortcut)
- Tenant scoping via denormalized `tenant_id` on `resource_grants`
- Phase 2 ships V2 **behind a flag** — V1 stays the active path until Phase 3

### Claude's Discretion (Phase 2 scope)
- Feature-flag mechanism (recommendation: `config.permissions.useAbilityEngineV2` env var, see §8)
- Cascade synthesis algorithm (Option A vs B — recommendation: Option A, see §6)
- Snapshot serialization format and sort key (see §9)
- Where to put the new models (`be/src/shared/models/`, mirror `RolePermissionModel`)
- Whether `buildAbilityForV2` lives in `ability.service.ts` or a sibling file (recommendation: same file, top-of-file dispatch from `buildAbilityFor`)

### Deferred (out of scope for Phase 2)
- Wiring V2 into the request path (Phase 3)
- `rbac.ts` shim conversion (Phase 3 / P3.1)
- Middleware refactor / route migration sweep (Phase 3)
- `permissions` REST API (Phase 3 / P3.4)
- OpenSearch grant filter extension (Phase 6 / P6.3) — but V2 must NOT break the existing `buildOpenSearchAbacFilters` / `buildAccessFilters` shape
- FE Subjects type alignment (Phase 4)
- Legacy alias removal (Phase 6)
- `expires_at` enforcement (Phase 7) — but V2 SHOULD already filter expired grants at query time so Phase 7 is a no-op test addition

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TS5 | Unified ability engine reading from `role_permissions` + `user_permission_overrides` + `resource_grants`; preserves super-admin shortcut, tenant scoping, Redis cache; regression snapshot proves day-one parity | §1 contract enumeration, §4 mapping function, §5 precedence ordering, §11 endpoint-shape preservation |
| TS15 (snapshot subset) | Vitest regression snapshots for admin/leader/user/super-admin fixtures; cascade test; override allow/deny precedence; tenant cross-leak rejection | §2 V1 rule enumeration, §9 snapshot methodology, §10 edge cases |
| TS8 (cascade — built into V2) | KB read grant synthesizes `read` rule on `DocumentCategory`; KB write grants do NOT cascade | §6 cascade algorithm |

## V1 ability.service.ts — Exhaustive Contract

> Every behavior the V2 builder must preserve. File: `be/src/shared/services/ability.service.ts`.

### 1.1 Type contract
- `Actions` union: `'manage' \| 'create' \| 'read' \| 'update' \| 'delete'` (line 24). V2 keeps this **identical** — the registry's `action` field is constrained to these verbs (verified in `be/src/shared/permissions/registry.ts:46` JSDoc).
- `Subjects` union (line 27): `'Dataset' | 'Document' | 'ChatAssistant' | 'SearchApp' | 'User' | 'AuditLog' | 'Policy' | 'Org' | 'KnowledgeBase' | 'Agent' | 'Memory' | 'all'`. **Drift exists** — see §3 for the canonical V2 union.
- `AppAbility = MongoAbility<[Actions, Subjects]>` (line 30). Exported. V2 keeps this exported symbol identical so callers don't break.
- `AbilityUserContext` (lines 36–49): `id`, `role`, `is_superuser?`, `current_org_id`, `department?`, `attributes?`. V2 takes the same input shape — **no signature change**.
- `AbacPolicyRule` (lines 55–68): policy overlay shape. V2 preserves the parameter and runs the loop after the DB-backed rules (see §5 step 6).

### 1.2 Cache contract
- `ABILITY_CACHE_PREFIX = 'ability:'` (line 75). **Phase 2 P2.5 bumps this to `'ability:v2:'`**. The change is one line; all cache helpers read the constant so no other edits needed.
- `ABILITY_CACHE_TTL_SECONDS = config.session.ttlSeconds || 604800` (line 78). Unchanged.
- `cacheAbility(sessionId, ability)` (line 169): JSON-serializes `ability.rules` and SETs with TTL. **V2 must produce serializable rules** — no closures, no class instances inside conditions. (CASL rules are already plain objects so this is trivially satisfied.)
- `loadCachedAbility(sessionId)` (line 197): GETs, JSON-parses, calls `createMongoAbility<[Actions, Subjects]>(rules)`. Critical: the `rules` payload deserialized here MUST match V2's serialized rule shape — see §11.
- `invalidateAbility(sessionId)` (line 227): single-key DEL.
- `invalidateAllAbilities()` (line 249): SCAN with `MATCH: ABILITY_CACHE_PREFIX*`. **Bumping the prefix means `invalidateAllAbilities` after deploy will only see V2 keys** — safe because V1 keys naturally expire under their own prefix (`ability:`).

### 1.3 Builder contract (`buildAbilityFor`, lines 101–156)
- **Step A — Super-admin shortcut** (lines 104–108): `if (user.is_superuser === true || user.role === UserRole.SUPER_ADMIN) { can('manage','all'); return build(); }`. **V2 must preserve this exact branch as Step 1** (see §5).
- **Step B — Tenant condition object** (line 110): `const tenantCondition = { tenant_id: user.current_org_id }`. V2 reuses this same object literal for every non-super-admin rule.
- **Step C — Universal base rules** (lines 113–114): every authenticated non-super-admin gets `can('read','Dataset',tenantCondition)` AND `can('read','Document',tenantCondition)`. **Critical day-one parity gotcha:** the V1 builder grants these to *all* roles including `'user'`. The Phase 1 seed (per init context: 209 day-one rows; `user` role gets only 3 permissions) maps this through `view_chat`/`view_search`/`view_history` → registry keys, NOT through `Dataset`/`Document` subjects. **V2 will diverge here unless we explicitly emit `Dataset`+`Document` read base rules for every authenticated user, OR the seed adds the equivalent `documents.view` / `knowledge_base.view` / etc. row to the `user` role.** This is the #1 snapshot-divergence risk in Phase 2 — see §12 R-A.
- **Step D — Admin role rules** (lines 117–127): 9 `can('manage', X, tenantCondition)` rules + 1 `can('read','AuditLog',tenantCondition)`:
  - `manage User`, `manage Dataset`, `manage Document`, `manage KnowledgeBase`, `read AuditLog`, `manage ChatAssistant`, `manage SearchApp`, `manage Agent`, `manage Memory`
- **Step E — Leader role rules** (lines 130–140): 9 rules:
  - `create Dataset`, `update Dataset`, `delete Dataset`, `manage Document`, `manage KnowledgeBase`, `manage ChatAssistant`, `manage SearchApp`, `manage Agent`, `manage Memory`
- **Step F — User role rules**: NONE beyond Step C (verified by reading lines 142 comment).
- **Step G — ABAC policy overlay** (lines 145–153): for each policy, `can` if `effect==='allow'` else `cannot`. V2 preserves this loop **at the end** of rule emission (see §5 step 6).
- `build()` returns the `AppAbility` (line 155).

### 1.4 OpenSearch translation contract
- `buildOpenSearchAbacFilters(policies, _userAttributes)` (line 294): only translates `policy.subject === 'Document'` AND action in `('read','manage')` (line 303). Allow → `bool.should + minimum_should_match: 1`. Deny → `bool.must_not`. **Phase 6 will extend this to walk `resource_grants` directly, but Phase 2 must not change its signature.**
- `translateConditions(conditions)` (line 351): handles equality (`term`), `$in` (`terms`), `$nin` (`bool.must_not.terms`). V2 conditions must use these same operators if it wants the OS path to consume them — currently V1 only emits flat equality (`tenant_id: user.current_org_id`), so V2 should stick to flat equality + `$in` for the cascade list.
- `buildAccessFilters(tenantId, abacFilters)` (line 386): always prepends `{ term: { tenant_id: tenantId } }` as the first filter. **Sacrosanct.** V2 doesn't touch this.

### 1.5 Singleton export
- `abilityService` object (lines 405–413) re-exports all 7 functions. V2 adds `buildAbilityForV2` to this object so Phase 3 has a clean dispatch point.

## V1 Rule Enumeration (the snapshot we're locking)

Computed by reading lines 101–156 against the four fixtures. Tenant placeholder = `T1`.

### Fixture: super-admin
| # | action | subject | conditions |
|---|--------|---------|------------|
| 1 | manage | all | — |

### Fixture: admin (tenant T1)
| # | action | subject | conditions | Source line |
|---|--------|---------|------------|-------------|
| 1 | read | Dataset | `{tenant_id: T1}` | 113 |
| 2 | read | Document | `{tenant_id: T1}` | 114 |
| 3 | manage | User | `{tenant_id: T1}` | 118 |
| 4 | manage | Dataset | `{tenant_id: T1}` | 119 |
| 5 | manage | Document | `{tenant_id: T1}` | 120 |
| 6 | manage | KnowledgeBase | `{tenant_id: T1}` | 121 |
| 7 | read | AuditLog | `{tenant_id: T1}` | 122 |
| 8 | manage | ChatAssistant | `{tenant_id: T1}` | 123 |
| 9 | manage | SearchApp | `{tenant_id: T1}` | 124 |
| 10 | manage | Agent | `{tenant_id: T1}` | 125 |
| 11 | manage | Memory | `{tenant_id: T1}` | 126 |

> Note: rules 1–2 are duplicated by rules 4–5 in CASL semantics (manage implies read). CASL keeps both in `ability.rules`. The snapshot must capture both — do **not** dedupe pre-serialization.

### Fixture: leader (tenant T1)
| # | action | subject | conditions | Source line |
|---|--------|---------|------------|-------------|
| 1 | read | Dataset | `{tenant_id: T1}` | 113 |
| 2 | read | Document | `{tenant_id: T1}` | 114 |
| 3 | create | Dataset | `{tenant_id: T1}` | 131 |
| 4 | update | Dataset | `{tenant_id: T1}` | 132 |
| 5 | delete | Dataset | `{tenant_id: T1}` | 133 |
| 6 | manage | Document | `{tenant_id: T1}` | 134 |
| 7 | manage | KnowledgeBase | `{tenant_id: T1}` | 135 |
| 8 | manage | ChatAssistant | `{tenant_id: T1}` | 136 |
| 9 | manage | SearchApp | `{tenant_id: T1}` | 137 |
| 10 | manage | Agent | `{tenant_id: T1}` | 138 |
| 11 | manage | Memory | `{tenant_id: T1}` | 139 |

### Fixture: user (tenant T1)
| # | action | subject | conditions | Source line |
|---|--------|---------|------------|-------------|
| 1 | read | Dataset | `{tenant_id: T1}` | 113 |
| 2 | read | Document | `{tenant_id: T1}` | 114 |

**Total rule count to lock:** 1 (super-admin) + 11 (admin) + 11 (leader) + 2 (user) = **25 rules** across all fixtures.

## Subjects Type Reconciliation

| Source | Subjects union | File:line |
|--------|----------------|-----------|
| BE V1 | `Dataset, Document, ChatAssistant, SearchApp, User, AuditLog, Policy, Org, KnowledgeBase, Agent, Memory, all` (12 + `all`) | `ability.service.ts:27` |
| FE | `Dataset, Document, ChatAssistant, SearchApp, User, AuditLog, Policy, Org, Project, all` (9 + `all`; **has legacy `Project`, missing `KnowledgeBase`/`Agent`/`Memory`**) | `fe/src/lib/ability.tsx:29` |
| `PermissionSubjects` constant (Phase 1) | 25 subjects (see `be/src/shared/constants/permissions.ts:69`) | `be/src/shared/constants/permissions.ts:69-95` |

The 25 `PermissionSubjects` keys are: `KnowledgeBase, DocumentCategory, Document, Dataset, Chunk, ChatAssistant, SearchApp, User, Team, Agent, Memory, AuditLog, System, SystemTool, SystemHistory, LlmProvider, Glossary, Broadcast, Dashboard, CodeGraph, ApiKey, Feedback, Preview, UserHistory, SyncConnector`.

### Canonical V2 Subjects union

V2 must accept every string the registry can emit AND every string V1 currently emits, so the union is the **superset**:

```ts
type Subjects =
  // From PermissionSubjects (25)
  | 'KnowledgeBase' | 'DocumentCategory' | 'Document' | 'Dataset' | 'Chunk'
  | 'ChatAssistant' | 'SearchApp' | 'User' | 'Team' | 'Agent' | 'Memory'
  | 'AuditLog' | 'System' | 'SystemTool' | 'SystemHistory' | 'LlmProvider'
  | 'Glossary' | 'Broadcast' | 'Dashboard' | 'CodeGraph' | 'ApiKey'
  | 'Feedback' | 'Preview' | 'UserHistory' | 'SyncConnector'
  // V1-only legacy (kept for snapshot parity; remove in Phase 4 once FE catches up)
  | 'Policy' | 'Org'
  | 'all'
```

**`Dataset` is intentionally included** even though current registry usage points modules at `Document`/`KnowledgeBase` — V1 emits `Dataset` rules at lines 113/119/131–133 and the snapshot will fail without it.

**Phase 2 does NOT touch `fe/src/lib/ability.tsx`.** The FE still has `Project` and lacks `KnowledgeBase`. As long as the BE response (`{ rules: [...] }` from `auth.controller.ts:484`) uses subjects the FE's `createMongoAbility` accepts as **strings** (which it does — TS types are erased at runtime; CASL stores subjects as strings in MongoAbility), nothing breaks. The FE simply won't *check* against `KnowledgeBase` until Phase 4 — but V2 emitting those rules is harmless because the FE's `useAppAbility().can(...)` calls today don't reference them.

## Day-One Role-Mapping Function (registry → CASL)

For every row in `role_permissions`, the V2 builder fetches the corresponding `permissions` row (or — better — does the join in SQL) to get `(action, subject)`, then emits:

```ts
can(perm.action, perm.subject, tenantCondition)
```

Where `tenantCondition = { tenant_id: user.current_org_id }` for every non-super-admin rule.

**SQL shape (single round-trip per builder call):**
```sql
SELECT p.action, p.subject
FROM role_permissions rp
JOIN permissions p ON p.key = rp.permission_key
WHERE rp.role = $1
  AND (rp.tenant_id IS NULL OR rp.tenant_id = $2)
```

This fits the existing `RolePermissionModel.findByRole(role, tenantId?)` pattern (`role-permission.model.ts:69`) — but that method only returns keys, so Phase 2 either:
- (a) adds a new method `findByRoleWithSubjects(role, tenantId)` returning `{action, subject, key}[]`, OR
- (b) keeps `findByRole` and adds a new `PermissionModel.findByKeys(keys[])` lookup the service composes.

**Recommendation:** option (a) — single round-trip is materially better than N+1, and per BE layering rules cross-table joins belong in a model method.

### Cardinality check (Phase 1 Init Context)
- super-admin: 80 rows → 80 CASL rules + 1 short-circuit
- admin: 80 rows → 80 CASL rules
- leader: 46 rows → 46 CASL rules
- user: 3 rows → 3 CASL rules

**Day-one snapshot will not be byte-identical to V1 by row count alone** — V1 emits 11 rules for admin, V2 will emit 80. The snapshot test must therefore assert **functional equivalence** (every V1 rule has a matching V2 rule that grants the same `(action, subject)` for the same tenant) rather than literal byte-equality. See §9 for the methodology.

## Precedence Ordering (V2 Builder)

> The V2 builder MUST emit rules in this exact order so behavior is deterministic and the snapshot is stable.

| Step | Source | Rule type | Notes |
|------|--------|-----------|-------|
| 1 | super-admin shortcut | `can('manage','all')` then **return early** | Mirrors V1 lines 104–108. Skips all subsequent steps. |
| 2 | `role_permissions` (joined to `permissions`) | `can(action, subject, tenantCondition)` for each row | The day-one mapping function (§4). Tenant scope: `WHERE tenant_id IS NULL OR tenant_id = current_org_id`. |
| 3 | `user_permission_overrides` WHERE `effect='allow'` AND `(expires_at IS NULL OR expires_at > now())` | `can(action, subject, tenantCondition)` | Joined to `permissions` for `(action, subject)`. Idempotent: if role already grants the same key, CASL handles dedupe at `can()` time. |
| 4 | `user_permission_overrides` WHERE `effect='deny'` AND `(expires_at IS NULL OR expires_at > now())` | `cannot(action, subject, tenantCondition)` | Emitted AFTER allows so they take precedence (CASL evaluates rules in order; later rules win). |
| 5 | `resource_grants` WHERE `tenant_id = current_org_id` AND principal matches user/team/role AND `(expires_at IS NULL OR expires_at > now())` | For each grant, for each action in `actions[]`: `can(action, perm.subject, { id: resource_id, tenant_id: current_org_id })` | `perm.subject` derived from `resource_type`. See §6 for cascade overlay. |
| 6 | KB → Category cascade (synthesized from grants/role permissions emitted in steps 2–5) | `can('read', 'DocumentCategory', { knowledge_base_id: { $in: [...] }, tenant_id: ... })` | See §6 algorithm. ONE rule synthesized after all KB-read sources are walked. |
| 7 | ABAC policy overlay (the existing `policies` parameter) | `can/cannot` per policy.effect | Mirrors V1 lines 145–153 verbatim. |

**Why deny comes BEFORE grants:** CASL's "later rule wins" semantics mean that if step 5 grants `read DocumentCategory` via cascade, an earlier deny in step 4 would be overridden. This is the desired behavior (resource-grant explicit access trumps blanket per-key deny) — but it must be **documented as a policy decision** because it surprises users coming from "deny always wins" systems. See §10 edge case 4.

> Alternative: emit step 4 deny rules LAST so they always win. This is more conservative and matches typical user mental models. **Open question for the planner — flag for human decision in P2.2.**

## KB → Category Cascade Algorithm

### Option A: lazy / single rule (RECOMMENDED)
After steps 2–5 emit rules, scan the just-emitted rules for any `read` rule on `KnowledgeBase`. Build the set of accessible KB IDs:

- From step 2: any `can('read','KnowledgeBase', tenantCondition)` from a role grant ⇒ user can read **all** KBs in tenant — emit `can('read','DocumentCategory', tenantCondition)` (no `$in` needed; tenant scope is enough).
- From step 5: each `resource_grant` where `resource_type === 'KnowledgeBase'` and `'read' \in actions[]` ⇒ collect `resource_id` into `kbIds: string[]`.
- If `kbIds.length > 0`, emit ONE rule: `can('read', 'DocumentCategory', { knowledge_base_id: { $in: kbIds }, tenant_id: current_org_id })`.

**Pro:** small rule set, easy to serialize, the `$in` operator is already supported by `translateConditions` (line 360) so Phase 6 OS integration gets it for free.
**Con:** the V2 builder now has a "post-pass" over its own emitted rules — needs careful test coverage.

### Option B: eager / per-KB
Emit one cascade rule per accessible KB.
**Pro:** no post-pass; rule shape is identical to KB rules.
**Con:** N×2 rule count for grant-heavy tenants; serialized payload bloats; cache hit ratio drops.

### Recommendation
**Option A.** It matches the existing condition operators (`$in` already in V1's translator), keeps the rule count low, and the post-pass is trivially testable in isolation.

### Cascade applies ONLY to `read`
Per TS8 + ROADMAP P2.3, write actions (`update`, `delete`, `create`) on `KnowledgeBase` do NOT cascade to `DocumentCategory`. The algorithm above intentionally only inspects `read` source rules. The TS8 acceptance test ("Granting `update` on KB X to user Y → Y cannot update categories in KB X") locks this in.

## OpenSearch Filter Integration Sketch (Phase 6 forward-compat)

Phase 6 will extend `buildOpenSearchAbacFilters` to walk a user's resource grants. For Phase 2 to be Phase-6-compatible, V2 emits cascade rules using:
- Subject `'DocumentCategory'` (currently the OS translator only handles `Document` — but Phase 6 will broaden it).
- Conditions object using flat equality OR `$in` (both handled by `translateConditions` lines 354–372).
- Tenant condition always present (so the mandatory tenant filter from `buildAccessFilters` line 391 still combines cleanly).

**Contract V2 must preserve:** the rule shape `{action, subject, conditions}` is what the OS translator iterates. As long as V2 produces plain rules with these three fields (CASL does this automatically), Phase 6 can extend the translator without rewriting V2.

## Feature Flag Design

### Options
| Option | Pros | Cons |
|--------|------|------|
| A. Env var → `config.permissions.useAbilityEngineV2` | Matches existing project pattern (`config` object, `enableLocalLogin` example at `be/src/shared/config/index.ts:171`); zero DB dependency; flippable per-environment without migration | Restart required to flip |
| B. DB row in `system_settings` | Hot-flippable | Adds a DB read on every `buildAbilityFor` call (or requires its own cache); no `system_settings` table currently — would need new infra; over-engineered for a one-shot cutover |
| C. TypeScript constant export | Trivial | Requires code change + redeploy to flip; defeats the purpose of a flag |

### Recommendation
**Option A.** Add to `be/src/shared/config/index.ts`:

```ts
permissions: {
  /** Phase 2 cutover flag — when true, buildAbilityFor() dispatches to buildAbilityForV2 (DB-backed). Defaults false until Phase 3 cutover. */
  useAbilityEngineV2: process.env['USE_ABILITY_ENGINE_V2'] === 'true',
}
```

And add to `be/.env.example`: `USE_ABILITY_ENGINE_V2=false`.

### Dispatch shape
Inside `buildAbilityFor`:
```ts
export function buildAbilityFor(user, policies = []) {
  if (config.permissions.useAbilityEngineV2) {
    return buildAbilityForV2(user, policies)
  }
  // ... existing V1 body unchanged
}
```

**Critical:** V2 is `async` (DB reads) but V1 is sync. Either:
- (a) make `buildAbilityFor` async and update **all 5 callers** (`auth.controller.ts:65,474` and any test imports), OR
- (b) keep `buildAbilityFor` sync and have V2 callers go through a new `buildAbilityForAsync` — but this fragments the API.

**Recommendation:** option (a). Make `buildAbilityFor` async. The 5 call sites already `await abilityService.cacheAbility(...)` immediately afterwards, so they're already in async context. Audit shows: `auth.controller.ts:65` (await-able), `auth.controller.ts:474` (already async), `auth.controller.ts:566` (already async). **Plan must include updating all callers in P2.2.**

## Snapshot Test Methodology

### Fixtures (4 inputs)
```ts
const FIXTURES: AbilityUserContext[] = [
  { id: 'fixture-superadmin', role: 'super-admin', is_superuser: true,  current_org_id: 'tenant-T1', department: null },
  { id: 'fixture-admin',      role: 'admin',       is_superuser: false, current_org_id: 'tenant-T1', department: null },
  { id: 'fixture-leader',     role: 'leader',      is_superuser: false, current_org_id: 'tenant-T1', department: null },
  { id: 'fixture-user',       role: 'user',        is_superuser: false, current_org_id: 'tenant-T1', department: null },
]
```

### Capture (P2.1)
```ts
for (const fixture of FIXTURES) {
  const ability = buildAbilityFor(fixture)  // V1
  const sorted = sortRules(ability.rules)
  await fs.writeFile(
    `be/tests/permissions/__snapshots__/v1-${fixture.role}.json`,
    JSON.stringify(sorted, null, 2),
  )
}
```

### Deterministic sort key (CRITICAL)
```ts
function sortRules(rules: RawRuleOf<AppAbility>[]): RawRuleOf<AppAbility>[] {
  return [...rules].sort((a, b) => {
    const ka = `${a.action}|${a.subject}|${JSON.stringify(a.conditions ?? {})}|${a.inverted ? 'D' : 'A'}`
    const kb = `${b.action}|${b.subject}|${JSON.stringify(b.conditions ?? {})}|${b.inverted ? 'D' : 'A'}`
    return ka.localeCompare(kb)
  })
}
```

**Without this sort, the snapshot will flap** — CASL's `AbilityBuilder` insertion order depends on JS engine object key iteration, which is stable per-run but fragile across refactors.

`action` and `subject` may be arrays in CASL — handle by joining with `,` after sorting. Verify in P2.1 against actual emitted rules; today V1 uses scalar strings only.

### Parity assertion (P2.4)
```ts
for (const fixture of FIXTURES) {
  const v1 = sortRules(buildAbilityFor(fixture).rules)
  const v2 = sortRules((await buildAbilityForV2(fixture)).rules)
  expect(v2).toEqual(v1)  // structural deep equality, byte-stable due to sort
}
```

### Snapshot location
`be/tests/permissions/__snapshots__/v1-{role}.json` — committed to git, reviewed by humans during P2.1 merge.

### Functional-equivalence assertion (cardinality mismatch)
Per §4, V2 emits ~80 rules for admin while V1 emits 11. Strict deep-equal will fail. The parity test must do TWO things:

1. **Functional equivalence** (the real safety net): for every (action, subject, tenant) tuple V1 grants, assert V2 also grants it. Implementation: build a CASL ability from each, then for every (action, subject) the V1 ability allows on a sample resource, assert V2 allows it too. This is the snapshot the planner cares about.
2. **Literal snapshot** (regression detection): the byte-stable JSON of V1 rules, locked at P2.1, used as a tripwire — if V1 changes unexpectedly during Phase 2 development, the snapshot test fails and forces a human to acknowledge the change.

**Both tests are needed.** Plan §15 in `1-PLAN.md` should call out the two-snapshot strategy explicitly.

## Edge Cases to Cover in P2.4

| # | Scenario | Expected | How to test |
|---|----------|----------|-------------|
| 1 | User with NO `role_permissions` rows (brand-new role) | Empty CASL rules array (user sees nothing in tenant) | Insert a `role='ghost'` user, expect `ability.rules.length === 0` |
| 2 | Override key absent from registry | Skip + log.warn (silent skip) | Insert override row with bogus `permission_key`; assert no throw, no rule emitted, log captured |
| 3 | Override `deny` on a permission the role doesn't grant | No-op, no error | Assert `ability.cannot()` returns true and rule count unchanged from baseline |
| 4 | Override `allow` on a permission already granted by role | Idempotent, no duplicate rule (or duplicate but same effect) | Snapshot count stable; CASL `can(...)` still true |
| 5 | Resource grant with `expires_at` in the past | Filtered at SQL `WHERE` — never emitted | Insert grant with `expires_at = now() - 1 day`; assert no `id`-conditioned rule |
| 6 | Resource grant for a `resource_type` with no matching registry permission | Skip + log.warn | Insert `resource_type='UnknownThing'`; assert no rule, log captured |
| 7 | Cross-tenant override attempt | Rejected at SQL `WHERE tenant_id = current_org_id` (NOT in builder) | Insert override row with `tenant_id != current_org_id`; assert no rule |
| 8 | User in `current_org_id` with no `role_permissions` rows | Empty rules | Distinct from #1; tests tenant-scoping path |
| 9 | KB read grant + cascade synthesis | One synthesized `read DocumentCategory` rule | Insert KB grant with `actions=['view']`; assert cascade rule present with correct `$in` set |
| 10 | KB update grant — NO cascade | No `update DocumentCategory` rule emitted | Insert KB grant with `actions=['edit']`; assert no DocumentCategory write rule (TS8) |
| 11 | Allow + Deny on same `(user, key)` (Phase 1 unique constraint allows this) | Per ordering (§5), deny wins (rule-order semantics) — VERIFY with planner | Insert both rows; assert `ability.can()` returns false |
| 12 | Cache round-trip (P2.5) | V2 ability serializes, caches under `ability:v2:`, deserializes to equivalent ability | Build → cache → load → assert `rules` deep-equal |

## `/api/auth/abilities` Endpoint Compatibility

**Endpoint:** `GET /api/auth/abilities` (`auth.routes.ts:90`, controller at `auth.controller.ts:461`).

**Response shape:** `{ rules: ability.rules }` (line 484). The `rules` field is the raw CASL `RawRuleOf<AppAbility>[]` array — plain JSON objects with shape `{action, subject, conditions?, inverted?, fields?, reason?}`.

**FE consumption:** `fe/src/lib/ability.tsx:117` calls `createMongoAbility<[Actions, Subjects]>(data.rules)`.

### Contract V2 must preserve
1. Response key MUST stay `rules` (not renamed to `data` or `payload`).
2. Each rule MUST be a plain object — no class instances, no functions inside conditions.
3. Conditions MUST use only operators CASL's `createMongoAbility` understands at runtime: equality, `$in`, `$nin`, `$eq`, `$gt`, `$lt`, etc. V2 stays within equality + `$in` (cascade) for safety.
4. Subject MUST be a string. Even though FE's `Subjects` type doesn't include `KnowledgeBase`/`DocumentCategory`/etc., CASL stores subjects as strings at runtime — TS types are erased — so the FE will accept and ignore unknown subjects until Phase 4 aligns the type.
5. The endpoint MUST keep returning a 200 with rules even when V2 emits zero rules (e.g., orphaned-tenant edge case #8). FE handles this as "no permissions" gracefully.

**No wire-format change is required for Phase 2.** The FE Phase 4 work is purely a TypeScript type alignment, not a runtime change.

## Phase-Specific Risks

### R-A — Day-one snapshot divergence on base read rules (HIGH)
**Problem:** V1 grants `read Dataset` and `read Document` to *every* authenticated user (lines 113–114), unconditionally. The Phase 1 seed for the `user` role only seeds 3 rows (`view_chat`, `view_search`, `view_history` — none of which have subject `Dataset` or `Document`). V2 will emit 0 rules where V1 emits 2 — the parity test will fail.

**Mitigations (planner must pick one in P2.2):**
- (i) V2 hardcodes the same two `can('read','Dataset',tenantCondition)` + `can('read','Document',tenantCondition)` baseline for every authenticated non-super-admin user. **Ugly — re-introduces the static branch we're trying to delete.**
- (ii) Add two extra rows to the day-one seed: `('user', 'documents.view', NULL)` and `('user', 'knowledge_base.view', NULL)` — but the registry's `documents.view` has subject `Document` not `Dataset`, so this still drops the `Dataset` rule.
- (iii) Add a `documents.view` and a hypothetical `datasets.view` to the registry and seed, then accept that V2 emits more rules than V1 on day one (functional superset, not literal equal). **Recommended** — this is consistent with TS4's "every user that previously could do an action can still do it" wording (superset, not equal).
- (iv) Add a Phase 2 patch migration that retro-seeds these missing rows.

**Decision needed in P2.2 — flag for human review.**

### R-B — Snapshot is the safety net for Phase 3; gaps = silent breakage
The 12 edge cases in §10 and the 4 fixtures in §9 are the *complete* safety net. Any case not covered will silently regress in Phase 3's middleware cutover and only surface as a 403 in production. **Hard requirement: P2.4 test count ≥ 16** (4 parity + 12 edge cases).

### R-C — `manage` action deceptively short-circuits subjects
CASL semantics: `can('manage', X, conditions)` implies all CRUD verbs on X, but **only when checked with the same conditions**. V2 emitting `can('manage','KnowledgeBase',{tenant_id})` won't satisfy `ability.can('manage','KnowledgeBase',{tenant_id, id: kbId})` *unless* the conditions match by subset rules. CASL handles this correctly via MongoDB-style condition matching, but the snapshot test must include at least one assertion that exercises the resource-instance path (e.g., `ability.can('read','KnowledgeBase', {tenant_id: T1, id: 'kb-1'})`) to lock the behavior.

### R-D — `expires_at` filtering done in SQL, not in JS
If V2 fetches all grants and filters in JS, the snapshot will pass on day one but Phase 7 will need a code change to "move" the filter to SQL. **Better:** put `WHERE expires_at IS NULL OR expires_at > now()` in the SQL of the new model methods from day one. Phase 7 then becomes a no-op test addition.

### R-E — Async dispatch breakage at call sites
Making `buildAbilityFor` async ripples to 3 call sites in `auth.controller.ts` (lines 65, 474, 566) plus any test imports. All 3 are already in async functions, so the ripple is mechanical, but P2.2 must explicitly include the call-site update task — easy to forget.

### R-F — Snapshot literal-equal vs functional-equal confusion
Per §9, the parity test needs BOTH a literal V1 snapshot (regression tripwire) AND a functional-equivalence test (real safety net). If P2.4 only does one, the safety net leaks. Plan must call both out as separate tasks.

### R-G — Allow+Deny precedence ambiguity (§5 step 3 vs 4 ordering)
The Phase 1 unique constraint allows both `(user, key, allow)` and `(user, key, deny)` to coexist. CASL's "later rule wins" means whichever is emitted last takes effect. The planner must commit to an ordering and document it in 2-PLAN.md. **Recommendation:** emit denies LAST so deny always wins (more conservative, matches user expectations). This is a deviation from §5 which had grants in step 5 — **revise to: step 5 (grants) → step 6 (cascade) → step 7 (ABAC overlay) → step 8 (re-emit overrides denies)**. Open question for human review.

## Code Examples

### V2 builder skeleton (illustrative only — planner refines)
```ts
export async function buildAbilityForV2(
  user: AbilityUserContext,
  policies: AbacPolicyRule[] = [],
): Promise<AppAbility> {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  // Step 1 — Super-admin shortcut (mirror V1 line 105)
  if (user.is_superuser === true || user.role === UserRole.SUPER_ADMIN) {
    can('manage', 'all')
    return build()
  }

  const tenantCondition = { tenant_id: user.current_org_id }

  // Step 2 — Role permissions (joined with permissions catalog for action+subject)
  const roleRules = await ModelFactory.rolePermission.findByRoleWithSubjects(
    user.role, user.current_org_id,
  )
  for (const r of roleRules) {
    can(r.action as Actions, r.subject as Subjects, tenantCondition)
  }

  // Step 3 — Allow overrides
  const allowOverrides = await ModelFactory.userPermissionOverride.findActive(
    user.id, user.current_org_id, 'allow',
  )
  for (const o of allowOverrides) {
    can(o.action as Actions, o.subject as Subjects, tenantCondition)
  }

  // Step 4 — Resource grants (KB read sources collected for cascade)
  const grants = await ModelFactory.resourceGrant.findActiveForUser(
    user.id, user.current_org_id,
  )
  const kbReadIds: string[] = []
  for (const g of grants) {
    for (const action of g.actions) {
      can(action as Actions, g.subject as Subjects, {
        id: g.resource_id, tenant_id: user.current_org_id,
      })
      if (g.resource_type === 'KnowledgeBase' && action === 'read') {
        kbReadIds.push(g.resource_id)
      }
    }
  }

  // Step 5 — KB → Category cascade (Option A, lazy single rule)
  if (kbReadIds.length > 0) {
    can('read', 'DocumentCategory', {
      knowledge_base_id: { $in: kbReadIds },
      tenant_id: user.current_org_id,
    })
  }

  // Step 6 — ABAC policy overlay (mirror V1 lines 145–153)
  for (const policy of policies) {
    if (policy.effect === 'deny') {
      cannot(policy.action as Actions, policy.subject as Subjects, policy.conditions as any)
    } else {
      can(policy.action as Actions, policy.subject as Subjects, policy.conditions as any)
    }
  }

  // Step 7 — Deny overrides LAST so they always win (R-G)
  const denyOverrides = await ModelFactory.userPermissionOverride.findActive(
    user.id, user.current_org_id, 'deny',
  )
  for (const o of denyOverrides) {
    cannot(o.action as Actions, o.subject as Subjects, tenantCondition)
  }

  return build()
}
```

### New models needed in P2.2
| Model | Methods needed | Why |
|-------|----------------|-----|
| `UserPermissionOverrideModel` (new) | `findActive(userId, tenantId, effect)` returning `{action, subject, key, expires_at}[]` joined with `permissions` table | None exists per init context |
| `ResourceGrantModel` (new) | `findActiveForUser(userId, tenantId)` returning rows with `actions[]`, `resource_type`, `resource_id`, joined to `permissions` for `subject` | None exists per init context |
| `RolePermissionModel` (extend) | Add `findByRoleWithSubjects(role, tenantId?)` returning `{action, subject, key}[]` (joined with `permissions`) | Existing `findByRole` only returns string keys (`role-permission.model.ts:69`) |

All three must follow the BE layering rule: **all queries live in models**, services don't touch `db()` directly.

## Validation Architecture

Per `.planning/config.json` — assuming nyquist_validation enabled (default).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (per `be/CLAUDE.md`, existing in `be/tests/permissions/`) |
| Config file | `be/vitest.config.ts` (existing — used by Phase 1 tests) |
| Quick run | `npm run test -w be -- tests/permissions/ability` |
| Full suite | `npm run test -w be` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Command | Exists? |
|-----|----------|-----------|---------|---------|
| TS5 | V2 builder produces functional superset of V1 for admin/leader/user/super-admin | unit + DB | `npm run test -w be -- tests/permissions/ability-v2-parity.test.ts` | Wave 0 |
| TS5 | V2 preserves super-admin shortcut | unit | same file | Wave 0 |
| TS5 | V2 preserves Redis cache shape | unit + Redis mock | `tests/permissions/ability-v2-cache.test.ts` | Wave 0 |
| TS8 | KB read grant cascades to DocumentCategory read | unit + DB | `tests/permissions/ability-v2-cascade.test.ts` | Wave 0 |
| TS8 | KB update grant does NOT cascade | unit + DB | same file | Wave 0 |
| TS15 | Override allow/deny precedence | unit + DB | `tests/permissions/ability-v2-overrides.test.ts` | Wave 0 |
| TS15 | Tenant cross-leak rejection | unit + DB | `tests/permissions/ability-v2-tenant.test.ts` | Wave 0 |
| TS15 | Snapshot files committed and stable | snapshot | `tests/permissions/ability-v1-snapshot.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- tests/permissions/`
- **Per wave merge:** `npm run test -w be`
- **Phase gate:** Full BE suite green + snapshot files committed before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `be/tests/permissions/ability-v1-snapshot.test.ts` — captures V1 snapshots (P2.1)
- [ ] `be/tests/permissions/__snapshots__/v1-{super-admin,admin,leader,user}.json` — committed JSON
- [ ] `be/tests/permissions/ability-v2-parity.test.ts` — functional + literal parity (P2.4)
- [ ] `be/tests/permissions/ability-v2-cascade.test.ts` — TS8 (P2.3)
- [ ] `be/tests/permissions/ability-v2-overrides.test.ts` — allow/deny precedence + edge cases 2/3/4/11
- [ ] `be/tests/permissions/ability-v2-tenant.test.ts` — edge cases 5/7/8
- [ ] `be/tests/permissions/ability-v2-cache.test.ts` — P2.5 versioned prefix round-trip
- [ ] Existing helpers (`_helpers.ts` `withScratchDb`) reused for DB-backed tests — no new fixture infra needed

## Project Constraints (from CLAUDE.md)

These directives apply to every file Phase 2 produces:

1. **Strict 3-layer architecture (Controller → Service → Model).** V2 builder lives in `services/`. All DB reads MUST go through new model methods (`findByRoleWithSubjects`, `findActiveForUser`, etc.). The service may NOT `import { db }` or call `db('table')` directly.
2. **No hardcoded string literals in comparisons.** Use:
   - `UserRole.SUPER_ADMIN` (already in V1 line 105)
   - `PermissionSubjects.*` from `be/src/shared/constants/permissions.ts:69`
   - `ROLE_PERMISSIONS_TABLE`, `USER_PERMISSION_OVERRIDES_TABLE`, `RESOURCE_GRANTS_TABLE` from same file
   - A new constant for `effect` values: `OverrideEffect.ALLOW = 'allow'` / `.DENY = 'deny'` (Phase 2 must add this — does not exist yet, verified)
   - A new constant for the cache prefix bump: `ABILITY_CACHE_PREFIX_V2 = 'ability:v2:'`
3. **JSDoc on every exported function/class/method/interface/type alias** with `@description`, `@param`, `@returns`, `@throws`. The new models and `buildAbilityForV2` MUST have full JSDoc.
4. **Inline comments above control flow, business logic, DB queries, Redis ops, guard clauses.** The cascade post-pass and the allow/deny ordering deserve prominent comments.
5. **Knex ORM only — no raw SQL** unless Knex cannot express the query. The `JOIN role_permissions ↔ permissions` is trivially expressible in Knex (`.join('permissions','permissions.key','role_permissions.permission_key')`).
6. **All migrations through Knex** — Phase 2 should not need any new migrations (Phase 1 created all the tables) unless R-A mitigation (iii) requires retro-seeding rows; that would be a Knex migration not a Peewee migrator.
7. **`config` object only — never `process.env` directly.** The feature flag goes in `config.permissions.useAbilityEngineV2`, not `process.env.USE_ABILITY_ENGINE_V2` at the call site.
8. **Cross-module imports through barrels only.** New models registered in `ModelFactory` must be exported via `@/shared/models/` barrel.

## Open Questions

1. **Allow/deny precedence ordering** (R-G): emit denies in step 4 (current §5 design) or step 7 (planner-recommended override)?
   - Recommendation: step 7 (denies LAST = denies always win = matches user expectations). **Flag for human in P2.2.**

2. **R-A mitigation:** how does V2 reproduce V1's universal `read Dataset`/`read Document` baseline for the `user` role?
   - Recommendation: option (iii) — accept functional superset, do NOT hand-roll baseline rules in V2. **Flag for human in P2.2.**

3. **Async signature change** (R-E): make `buildAbilityFor` async (rippling to 3 call sites) vs introduce `buildAbilityForAsync`?
   - Recommendation: make it async. **Mechanical change, included in P2.2.**

4. **Snapshot test framework choice:** Vitest's built-in `toMatchSnapshot()` (auto-managed `__snapshots__/` directory) vs hand-rolled JSON files committed explicitly?
   - Recommendation: hand-rolled JSON. Vitest auto-snapshots are fragile (whitespace, trailing-comma drift) and the human review of P2.1 is the entire safety net — explicit JSON files force code-review eyes onto every rule.

5. **Does V1 currently emit `policies` from any caller?** Grep for `buildAbilityFor(user, policies)` with second arg.
   - Per `auth.controller.ts:65,474,566`: all 3 call sites pass only `user`. The `policies` parameter is dead in production today. V2 should still preserve the parameter for forward-compat, but the parity test only needs to exercise it manually.

## Sources

### Primary (HIGH confidence) — file:line citations
- `be/src/shared/services/ability.service.ts:1-413` — full V1 builder, cache, OS translator
- `be/src/shared/config/rbac.ts:113-164` — legacy `ROLE_PERMISSIONS` map (the parity target)
- `be/src/shared/permissions/registry.ts:1-184` — registry helper, `Permission` type, `getAllPermissions`
- `be/src/shared/permissions/index.ts:28-83` — eager imports of all 21 module permissions files + barrel re-exports
- `be/src/shared/constants/permissions.ts:1-99` — table-name constants, `PermissionSubjects` (25 keys), `SyncLogCode`
- `be/src/shared/models/role-permission.model.ts:1-118` — existing `findByRole`, `seedFromMap`; needs `findByRoleWithSubjects` extension
- `be/src/modules/auth/auth.controller.ts:27-87,461-492,536-590` — `wireAbilityOnLogin`, `getAbilities`, `switchOrg` (the 3 call sites)
- `be/src/modules/auth/auth.routes.ts:90` — `GET /api/auth/abilities` route binding
- `be/src/modules/knowledge-base/knowledge-base.permissions.ts:1-123` — sample registry file showing `subject` usage and the KB/Category split
- `be/src/modules/users/users.permissions.ts:1-64` — sample registry file
- `fe/src/lib/ability.tsx:1-134` — FE `Subjects` drift, `createMongoAbility(data.rules)` consumption point
- `be/tests/permissions/_helpers.ts:1-237` — `withScratchDb`, `withScratchDbStoppingBefore`, `roundTripMigration` (reused for V2 tests)
- `be/src/shared/db/migrations/20260407{052126,052129,053000,062700}_phase1_*.ts` — Phase 1 migrations (referenced for table shape; not re-read)
- `be/src/shared/config/index.ts:109-172` — `config` object pattern + `enableLocalLogin` example for the new `useAbilityEngineV2` flag
- `.planning/REQUIREMENTS.md` (TS5, TS8, TS15) — locked decisions for Phase 2
- `.planning/ROADMAP.md` (Phase 2 section, lines 44–63) — plan sketch P2.1–P2.5
- `.planning/research/RISKS.md` (R-1, R-2, R-6, R-12) — phase-relevant risks
- Init context — Phase 1 row counts (110 keys, 209 seed rows: 80/80/46/3) and shipped table shapes

### Secondary (MEDIUM confidence)
- CASL `MongoAbility` rule serialization shape (training data + matches V1's `JSON.stringify(ability.rules)` at line 179) — confirmed by `loadCachedAbility` round-trip at line 208–210

### Tertiary (LOW confidence)
- None — every claim above maps to a file:line in the repo.

## Metadata

**Confidence breakdown:**
- V1 contract enumeration: HIGH — every rule cited to file:line, read in full
- V2 design: HIGH for §4–§7 precedence + cascade; MEDIUM for §5 step ordering (open question §G)
- Snapshot methodology: HIGH — `_helpers.ts` already provides DB scaffolding
- Edge case completeness: MEDIUM — 12 documented; more may surface during P2.4 implementation
- Feature flag design: HIGH — matches existing `config.enableLocalLogin` pattern verbatim
- FE compatibility: HIGH — wire format already verified at `auth.controller.ts:484` ↔ `ability.tsx:117`

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (V1 `ability.service.ts` is the cutover target — any change to it during Phase 2 invalidates §1/§2)
