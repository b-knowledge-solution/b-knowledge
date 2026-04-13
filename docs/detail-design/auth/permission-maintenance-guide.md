# Permission Maintenance Guide

> Operational checklist for adding or maintaining a permission across backend, frontend, admin UI, tests, i18n, and docs.

## 1. Overview

Use this guide when you need to add a new permission, rename an existing permission, or debug why a permission is not propagating correctly through the system.

The maintained workflow is:

1. define the permission in the backend registry
2. let the backend sync expose it in the catalog
3. regenerate the FE `PERMISSION_KEYS` map from the committed catalog snapshot
4. wire frontend gates with `useHasPermission` or `<Can>`
5. verify the admin surfaces discover the new key
6. update tests, i18n, and docs
7. run final verification, including `docs:build`

Do not start by editing `rbac.ts`. That file is a compatibility shim, not the source of truth for new permissions.

## 2. Before You Change Anything

Confirm which kind of access you are adding:

| Need | Use |
|------|-----|
| Flat capability such as entering an admin feature or showing an action button | New registry permission key |
| Subject-aware or row-scoped check on a specific record | Existing or new permission key plus `requireAbility(...)` / `<Can>` |
| Exception for one user only | `OverrideEditor` and `user_permission_overrides` |
| Shared access to a KB or document category | `ResourceGrantEditor` and `resource_grants` |

If the request is really about one knowledge base or document category, do not solve it with a brand-new per-user flat permission key.

## 3. Backend Authoring Flow

### 3.1 Add the permission in the registry

Start in the backend module that owns the feature. Most permissions are declared through a module-local `*.permissions.ts` file that calls `definePermissions(...)`, and all entries feed the central registry in `be/src/shared/permissions/registry.ts`.

Primary files:

- `be/src/shared/permissions/registry.ts`
- `be/src/shared/permissions/sync.ts`
- the owning module's `*.permissions.ts` file
- `be/src/shared/constants/permissions.ts` when you need the canonical subject constant

Pattern:

```ts
export const EXAMPLE_PERMISSIONS = definePermissions('example', {
  view: {
    action: 'read',
    subject: PermissionSubjects.Example,
    label: 'View example records',
  },
})
```

Rules:

- use the canonical `<feature>.<action>` shape
- keep the `action` and `subject` aligned with the backend CASL model
- choose a label that the admin UI can render without extra translation work

### 3.2 Let sync publish the catalog row

`be/src/shared/permissions/sync.ts` reconciles the in-code registry into the `permissions` table at boot. If your new key is registered correctly, it will appear in:

- the backend `permissions` catalog table
- `GET /api/permissions/catalog`
- the FE runtime catalog provider

If the key does not appear, debug this path first:

1. confirm the module `*.permissions.ts` file is imported by the permissions barrel
2. confirm the backend boot sync ran
3. confirm `GET /api/permissions/catalog` returns the new key

### 3.3 Wire route enforcement

Choose the correct middleware in `be/src/shared/middleware/auth.middleware.ts`:

- use `requirePermission('feature.action')` for flat catalog-key checks
- use `requireAbility(action, subject, idParam?)` when the route needs subject-aware or row-scoped enforcement

Keep in mind:

- `requirePermission(...)` still resolves through the registry-backed `(action, subject)` mapping
- `requireAbility(...)` is the better choice when the route cares about a specific entity id
- some older routes still use compatibility keys such as `manage_users`; do not copy that pattern for new work unless you are intentionally preserving a legacy contract

## 4. Frontend Propagation Flow

### 4.1 Refresh the generated FE key map

The FE uses a generated constant map rather than hardcoded permission strings.

Primary files:

- `fe/src/generated/permissions-catalog.json`
- `fe/scripts/generate-permission-keys.mjs`
- `fe/src/constants/permission-keys.ts`

Command:

```bash
npm run permissions:generate-keys -w fe
```

What this does:

- reads `fe/src/generated/permissions-catalog.json`
- regenerates `fe/src/constants/permission-keys.ts`
- ensures callers can use `PERMISSION_KEYS` and the `PermissionKey` union safely

Do not hand-edit `fe/src/constants/permission-keys.ts`.

### 4.2 Use `useHasPermission` for flat capability checks

Primary file:

- `fe/src/lib/permissions.tsx`

Use `useHasPermission(PERMISSION_KEYS.X)` when the UI check is about a named registry permission key and does not need a specific resource instance.

Examples:

- showing or hiding a page entry
- enabling a global create button
- gating access to a management section

### 4.3 Use `<Can>` or `useAppAbility()` for subject-aware checks

Primary file:

- `fe/src/lib/ability.tsx`

Use `<Can>` or `useAppAbility()` when the UI needs CASL semantics for a subject or a row-scoped record. This is the right choice when:

- the backend route uses `requireAbility(...)`
- the decision depends on the current resource
- the view already works in terms of action and subject instead of a flat permission key

Decision rule:

- `useHasPermission` for flat key-based feature gating
- `<Can>` for subject-aware rendering
- `useAppAbility()` for imperative logic that still depends on CASL

## 5. Admin UI Discovery

The permissions admin UI is registry-driven. Once the backend catalog and FE generated keys are correct, the new key should surface naturally in the admin tools.

Relevant files:

- `fe/src/features/users/pages/PermissionManagementPage.tsx`
- `fe/src/features/permissions/components/PermissionMatrix.tsx`
- `fe/src/features/permissions/components/OverrideEditor.tsx`
- `fe/src/features/permissions/components/ResourceGrantEditor.tsx`
- `fe/src/features/permissions/pages/EffectiveAccessPage.tsx`
- `fe/src/features/users/pages/UserDetailPage.tsx`

Expected behavior:

| Surface | How the new key shows up |
|---------|--------------------------|
| `PermissionMatrix` | Appears as another registry-driven row in the role matrix |
| `OverrideEditor` | Appears in the permission picker for allow or deny overrides |
| `EffectiveAccessPage` | Appears in the grouped dropdown used for `who-can-do` inspection |
| `ResourceGrantEditor` | Does not automatically become a new grant action picker today; this editor is currently scoped around the existing KB/category sharing flow |

Important compatibility exception:

- `ResourceGrantEditor` does not currently expose an arbitrary multi-action selector for every catalog key. It is for the current resource-sharing workflow, not a universal key editor.

## 6. Tests to Update

### 6.1 Backend tests

Start in `be/tests/permissions/`. Choose the narrowest relevant suite instead of editing unrelated tests.

Common targets:

- `registry.test.ts` for catalog registration shape
- `sync.test.ts` or `catalog-versioning.test.ts` for sync and version propagation
- `auth-middleware.test.ts` when route enforcement changes
- `permissions-module.test.ts` for admin API behavior
- `override-precedence.test.ts` when allow or deny precedence is involved
- `grant-dataset-resolution.test.ts` when resource grants affect dataset resolution
- `tenant-isolation.test.ts` when the permission changes scope-sensitive access

### 6.2 Frontend tests

Relevant FE suites:

- `fe/tests/features/permissions/PermissionMatrix.test.tsx`
- `fe/tests/features/permissions/OverrideEditor.test.tsx`
- `fe/tests/features/permissions/ResourceGrantEditor.test.tsx`
- `fe/tests/features/permissions/EffectiveAccessPage.test.tsx`
- `fe/tests/features/permissions/permissionsApi.test.ts`
- `fe/tests/features/permissions/permissionsCatalogRefresh.test.tsx`
- `fe/tests/lib/permissions.test.tsx`

Use these to validate:

- new key visibility in the registry-driven admin UI
- correct behavior of runtime catalog refresh
- correct FE gating through `useHasPermission`

## 7. i18n and Admin Copy

Inspect the FE locale bundles whenever the new permission changes visible admin wording or adds a new UI branch:

- `fe/src/i18n/locales/en.json`
- `fe/src/i18n/locales/vi.json`
- `fe/src/i18n/locales/ja.json`

Also check existing admin copy usages under:

- `permissions.admin.*`
- `users.detail.*`

Not every new key requires a new locale string because many permission rows use backend labels, but any new UI affordance, empty state, button, or help text must be translated in all three locales.

## 8. Docs to Update

If you add or materially change permission behavior, update the docs that future maintainers actually read:

- auth overview pages under `/detail-design/auth/`
- user or team docs when the behavior changes admin workflows
- SRS or basic-design pages if the capability meaning changed
- this guide when the maintenance workflow itself changed
- `docs/.vitepress/config.ts` if you add a new docs page

Always finish with:

```bash
npm run docs:build
```

## 9. Common Mistakes

Avoid these failures:

1. Editing `rbac.ts` first and assuming the new permission is complete.
2. Forgetting to import the new backend `*.permissions.ts` file into the registry barrel.
3. Forgetting to refresh `PERMISSION_KEYS` after the catalog snapshot changes.
4. Using bare permission strings in the FE instead of `PERMISSION_KEYS`.
5. Using `useHasPermission` for a genuinely row-scoped problem that should use `<Can>`.
6. Treating `ResourceGrantEditor` as a universal grant-action editor; its current scope is narrower.
7. Updating only the backend and skipping the admin UI discovery path.
8. Updating locale strings in only one language.
9. Skipping docs verification after adding a new docs page or sidebar item.

## 10. Step-by-Step Checklist

Use this sequence for a normal new permission:

1. Add the new permission in the backend module registry with `definePermissions(...)`.
2. Confirm the backend sync path exposes it through `/api/permissions/catalog`.
3. Update or add backend enforcement with `requirePermission(...)` or `requireAbility(...)`.
4. Refresh the FE generated key map with `npm run permissions:generate-keys -w fe`.
5. Replace any FE bare string usage with `PERMISSION_KEYS`.
6. Add FE gates with `useHasPermission` or `<Can>` as appropriate.
7. Confirm `PermissionMatrix`, `OverrideEditor`, and `EffectiveAccessPage` discover the new key where applicable.
8. Update backend permission tests.
9. Update frontend permission tests, including `fe/tests/lib/permissions.test.tsx` when runtime catalog behavior changes.
10. Update locale bundles if new UI copy was introduced.
11. Update docs and sidebar wiring if the docs set changed.
12. Run final verification.

## 11. Verification Commands

Typical final checks:

```bash
npm run permissions:generate-keys -w fe
```

```bash
npm run docs:build
```

Then run the smallest relevant BE and FE permission test commands for the files you touched.

## 12. Related Docs

- [Auth System Overview](/detail-design/auth/overview)
- [RBAC & ABAC Permission Model](/detail-design/auth/rbac-abac)
- [RBAC & ABAC: Comprehensive Authorization Reference](/detail-design/auth/rbac-abac-comprehensive)
- [User Management Overview](/detail-design/user-team/user-management-overview)
- [Team Management: Step-by-Step Detail](/detail-design/user-team/team-management-detail)
