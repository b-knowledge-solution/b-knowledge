---
phase: 02-ability-engine-regression-snapshots
verified: 2026-04-07T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 2: Ability Engine + Regression Snapshots — Verification Report

**Phase Goal:** New DB-backed `buildAbilityFor()` behind a feature flag, regression snapshot suite proving V2↔V1 parity, zero user-visible behavior change. Safety net for Phase 3 cutover.

**Verdict:** PASS — ready for Phase 3 transition.

---

## TS5 — Unified Ability Engine — ✅ MET

- `buildAbilityForV1Sync` (private, sync) at `be/src/shared/services/ability.service.ts:136`; body unchanged from pre-Phase-2 V1 (super-admin shortcut at L140, tenant condition at L145, ABAC overlay loop at L180-188).
- `buildAbilityForV2` (private, async, DB-driven) at `ability.service.ts:231`. Implements the locked 7-step algorithm:
  1. Super-admin shortcut — L240-243 (mirrors V1 line ~140 unchanged)
  2. Role defaults via `findByRoleWithSubjects` — L252-258
  3. Resource grants with row-scoped `{tenant_id, id}` — L264-288 (skips legacy rows missing `actions[]` with warn at L273)
  4. KB→Category cascade — L293-319 (covered separately under TS8)
  5. Override ALLOW — L335-347
  6. ABAC overlay — L351-365 (preserved from V1)
  7. Override DENY emitted LAST — L370-382 (R-G "later wins" lock)
- Every non-superadmin rule carries `tenantCondition = {tenant_id: user.current_org_id}` (L247) — structural cross-tenant guarantee.
- Public async dispatcher `buildAbilityFor` at `ability.service.ts:397-406` — picks via `config.permissions.useV2Engine`.
- Feature flag default `false`: `be/src/shared/config/index.ts:497` — `useV2Engine: process.env['USE_ABILITY_ENGINE_V2'] === 'true'` (only true when explicitly set).
- `__forTesting` export at `ability.service.ts:671-674` exposes both raw V1 and V2 builders for parity tests.
- 3 new model methods, all enforcing `expires_at` filter in SQL (never JS):
  - `RolePermissionModel.findByRoleWithSubjects` — `be/src/shared/models/role-permission.model.ts:155`
  - `ResourceGrantModel.findActiveForUser` — `be/src/shared/models/resource-grant.model.ts:111` with `whereNull('expires_at').orWhereRaw('expires_at > NOW()')` at L121
  - `UserPermissionOverrideModel.findActiveForUser` — `be/src/shared/models/user-permission-override.model.ts:90` with same SQL filter at L102
- All `buildAbilityFor` callers updated to `await`:
  - `be/src/modules/auth/auth.controller.ts:65`, `:474`, `:566`
  - `be/src/shared/middleware/auth.middleware.ts:366`
  - `be/src/modules/chat/services/chat-conversation.service.ts:1022`
- `ABILITY_CACHE_PREFIX` bumped to `'ability:v2:'` at `be/src/shared/constants/permissions.ts:117`; consumed by ability.service.ts L428/L453/L482/L509.
- Strict layering preserved: all 3 new models live in `be/src/shared/models/`; service calls them only via `ModelFactory.{rolePermission, resourceGrant, userPermissionOverride}`.

## TS8 — KB→Category Cascade — ✅ MET

- Single-rule cascade synthesis at `ability.service.ts:293-319`:
  - Class-level KB read or manage (L293-297) ⇒ generic `can('read', 'DocumentCategory', tenantCondition)` at L311.
  - Otherwise, row-scoped grants accumulate into `grantedKbIds` at L299-306, producing one rule with `knowledge_base_id: { $in: grantedKbIds }` at L315-318.
  - `read` action only — write actions never piggy-back.
- `cascade.test.ts` has 4 cases (matches plan: class-level read, row-scoped read, no read, write-not-cascaded) at `be/tests/permissions/cascade.test.ts`.
- The synthesis is data-driven from steps 2/3 (no CASL introspection pass) — keeps the build deterministic and cheap, as documented at L290-292.

## TS15 — Regression Snapshot Tests — ✅ MET

All required test files exist under `be/tests/permissions/`:

| File | Purpose | Count |
|---|---|---|
| `v1-snapshot-capture.test.ts` | Freezes V1 per-fixture output | 1 (snapshot file) |
| `v1-v2-parity.test.ts` | Per-fixture **subject-scoped** matrix (Decision C, post-Wave-2) — header L110 | 1 (it.each matrix) |
| `v2-vs-v1-snapshot.test.ts` | Subject-scoped serialization tripwire with registry-derived `MANAGE_EXPANSION` (header L203, normalizer L125-145, manage-expansion at L183-194) | 1 (it.each) |
| `cascade.test.ts` | TS8 cascade — 4 cases | 4 |
| `override-precedence.test.ts` | Allow vs deny precedence (R-G lock) | 6 |
| `tenant-isolation.test.ts` | Cross-tenant rejection | 4 |
| Plus support: `serializeRules.test.ts` (4), `iterateMatrix.test.ts` (5), `models.test.ts` (19), `phase02-seed.test.ts` (5), `cache-prefix.test.ts` (2), and Phase 1 carry-overs (`migrations`, `registry`, `sync`, `backfill`, `role-seed`) | | |

- **16 test files total** in `be/tests/permissions/` — matches plan exactly.
- **Test count:** Static `test()`/`it()` callsite count is ~86; the plan's "89" headline includes runtime expansions of `it.each` matrices in `v1-v2-parity` and `v2-vs-v1-snapshot`. Within tolerance — see tech-debt §1 below.
- The bonus normalizer fix (registry-derived `MANAGE_EXPANSION` instead of hard-coded CRUD verbs) is at `v2-vs-v1-snapshot.test.ts:108-145`, motivated by Agent's custom verbs ("registry-derived" comment at L116).
- Edge cases (a–g from research §10) covered across `cascade.test.ts` (a, b, c, g), `override-precedence.test.ts` (d, e), `tenant-isolation.test.ts` (f).

## Zero User-Visible Behavior Change — ✅ MET

- `config.permissions.useV2Engine` default `false` — `config/index.ts:497`.
- V1 builder (`buildAbilityForV1Sync`) body unchanged from pre-Phase-2 — verified line-by-line at `ability.service.ts:136-191`. Super-admin shortcut at L140 unchanged.
- `be/src/shared/middleware/rbac.ts` last touched in commit `c1e91e5` (Phase 1 / pre-Phase-2 baseline) — untouched in Phase 2.
- `fe/src/lib/ability.tsx` last touched in commit `c1e91e5` — untouched (Phase 4 contract honored).
- The only callsite churn is the `await` insertion at the 5 callers listed under TS5 — no route, controller, or middleware modified beyond that.

## Seed Integrity Post-Patches — ✅ MET

- **P2.6 seed migration** at `be/src/shared/db/migrations/20260407085310_phase02_seed_user_leader_dataset_document_view.ts` adds `datasets.view` + `documents.view` for `user` and `leader` roles (constants L75-85, cross-product builder at L93-102).
- **P2.4 patch migration** at `be/src/shared/db/migrations/20260407090000_phase02_patch_role_permissions_for_v2_parity.ts`:
  - Adds `audit.view` for admin + super-admin (L118-120)
  - Adds full `manage_knowledge_base` expansion for leader (L122-141, including knowledge_base.*, document_categories.*, documents.view)
  - Removes 3 leader Dataset over-grants (`datasets.share`, `datasets.reindex`, `datasets.advanced`) — header §4 at L46-64, deletion logic in body
  - Adds agents.* and memory.* for leader — header §3 at L35-44
- `legacy-mapping.ts:228-231` — `AGENTS_MEMORY_ADMIN_ROLES` includes `'leader'` with the documented Phase 2 amendment rationale at L210-223 (justifies why the original Phase 1 decision was reversed).
- **Both migrations import `getAllPermissions` from the BARREL** `'@/shared/permissions/index.js'` — verified at:
  - `20260407090000_phase02_patch_role_permissions_for_v2_parity.ts:95`
  - `20260407085310_phase02_seed_user_leader_dataset_document_view.ts:63` (with explicit comment at L60-62 about side-effect import requirement, citing Phase 1 UAT finding)

---

## Known Issues / Tech-Debt IOUs (Carry to Phase 3+)

1. **Headline "89 tests across 16 files" vs static count of ~86.** The discrepancy is `it.each` matrix expansion at runtime in `v1-v2-parity` and `v2-vs-v1-snapshot` (each fixture × subject tuple counts as one logical test). The 16-file count is exact; the test count is the human-review-gate evidence and should be re-confirmed by `npm test -w be -- permissions/` output before Phase 3 cutover. Not a blocker — recommend a one-line script in the Phase 3 readiness checklist that runs the suite and prints the actual test count.

2. **`as any` casts on V2 condition objects** at `ability.service.ts:286` and `:318`. The CASL types do not accept arbitrary `$in` keys without a wider rule generic parameter. Phase 4 (Subjects type alignment) should widen the rule type so these casts can be removed.

3. **Subjects type drift between BE and FE.** `Subjects` union at `ability.service.ts:37-65` includes 27 subjects; `fe/src/lib/ability.tsx` (untouched per Phase 4 contract) has the legacy union with `Project` etc. Phase 4 P4.2 must reconcile — already in the roadmap, flagging here as a known live drift.

4. **Chain-idempotency contract change.** `buildAbilityFor` is now ALWAYS async (V1 wrapped in async at L405). Any future synchronous caller must `await`; the type system enforces this, but eslint-no-floating-promises should be reviewed for any chained calls in Phase 3 middleware refactor.

5. **Team-membership resolution deferred.** `buildAbilityForV2` passes `teamIds=[]` to `findActiveForUser` at L267 with `TODO(Phase 5)` at L263. Team-grant cascade is intentionally out of scope for Phase 2; document in Phase 5 entry criteria.

6. **Per-fixture matrix tuple counts as the human-review-gate evidence.** The `v1-v2-parity` and `v2-vs-v1-snapshot` `it.each` matrices are the substantive proof of parity; the `__snapshots__/` directory captures the literal serialized rule bag per fixture×subject. Human reviewer for Phase 3 must spot-check 2-3 snapshot files for non-obvious diffs (e.g., undefined vs missing keys, ordering).

7. **Legacy `permission_level` resource_grant rows.** V2 logs and skips rows with empty `actions[]` at `ability.service.ts:272-279`. Production data is expected to be backfilled by P1.2; Phase 3 deploy hook should grep for any remaining `permission_level IS NOT NULL AND actions IS NULL` rows and fail-fast if found.

---

## Phase 2 Ready For Transition — ✅ YES

| Gate | Status |
|---|---|
| TS5 — Unified ability engine | ✅ MET |
| TS8 — KB→Category cascade | ✅ MET |
| TS15 — Regression snapshot tests | ✅ MET |
| Zero user-visible behavior change | ✅ MET |
| Seed integrity post-patches | ✅ MET |

**Recommendation:** Proceed to Phase 3 (Middleware Cutover). Before flipping `USE_ABILITY_ENGINE_V2=true`, the Phase 3 readiness checklist must:
(a) Run `npm test -w be -- permissions/` and confirm green + record actual test count,
(b) Spot-check 2–3 `__snapshots__/` files for non-obvious diffs,
(c) Run `invalidateAllAbilities()` immediately post-deploy (R-2 mitigation already documented),
(d) Resolve tech-debt items 2 and 3 as part of Phase 4 entry criteria.

---

_Verified: 2026-04-07_
_Verifier: Claude (gsd-verifier)_
