# ADMIN_ROLES Preservation Note (R-9)

**Status:** Active through milestone 1. Migration deferred to milestone 2.
**Created:** Phase 6, task 6.5.2
**Owner:** Permission overhaul milestone

## What this is

`ADMIN_ROLES` is a hardcoded role-tier constant in `be/src/shared/config/rbac.ts`
containing `['super-admin', 'admin', 'leader']`. Despite the Phase 3+ move to a
registry-driven permission system fed through `useHasPermission` / `<Can>`,
this constant is intentionally preserved for milestone 1 and all its usage
sites are documented here.

## Why it still exists

`ADMIN_ROLES` answers the question "is this user a tenant operator?" - a
coarse metadata gate distinct from fine-grained feature permissions. During
the milestone 1 transition, some branches of the middleware stack rely on
this gate to apply admin-level bypasses (e.g. for ownership checks) where a
permission-key check would be a larger refactor. Replacing these calls
eagerly would:

1. Expand the Phase 6 scope beyond cleanup into active refactor territory
   (out of scope per Phase 6 CONTEXT.md D-11).
2. Risk regressing tenant operator flows that are not yet covered by the
   registry.
3. Require designing new permission keys for operator-level bypass
   semantics, which is a milestone 2 design task.

## Active usage sites (3)

| File | Line (snapshot) | Role |
|------|-----------------|------|
| `be/src/shared/config/rbac.ts` | ~94 | Definition of `ADMIN_ROLES = ['super-admin', 'admin', 'leader']` |
| `be/src/shared/middleware/auth.middleware.ts` | ~327 | First `allowAdminBypass` branch in ownership check |
| `be/src/shared/middleware/auth.middleware.ts` | ~381 | Second `allowAdminBypass` branch |

Each site carries an inline rationale comment pointing back to this note
(added in Phase 6 task 6.5.1).

## Explicitly out-of-scope sites

- `be/src/shared/permissions/legacy-mapping.ts:228` defines a separate
  constant `AGENTS_MEMORY_ADMIN_ROLES` whose semantics differ. Not covered
  by this preservation note.
- Historical migration files that reference the string `ADMIN_ROLES`
  (`20260407062700_phase1_seed_role_permissions.ts`,
  `20260407090000_phase02_patch_role_permissions_for_v2_parity.ts`) are
  frozen history and are not rewritten or commented.

## Milestone 2 migration plan

In milestone 2 each of the 3 active sites should be replaced with a
`useHasPermission('<key>')` call backed by a new registry permission key
(tentative names: `ownership.admin_bypass`, `tenant.operator`). The exact
key naming is a milestone 2 design decision.

Until that work lands, the `check:legacy-roles` script (Phase 6.2) does
NOT flag `ADMIN_ROLES` - it only targets the legacy `UserRole.SUPERADMIN`
/ `UserRole.MEMBER` / bare `'superadmin'` aliases. The preservation is
intentional and recorded here so future contributors do not assume the
constant is an oversight.

## Related references

- Phase 6 CONTEXT.md - D-11 (P6.5 repurposed as documentation pass)
- Phase 6 RESEARCH.md - §10 (ADMIN_ROLES audit results)
- R-9 in the permission overhaul backlog
