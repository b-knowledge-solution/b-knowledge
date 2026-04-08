# Phase 5 Admin UI — Dark Mode + i18n UAT Checklist

**Plan:** 5.4 (polish pass)
**Generated:** 2026-04-08
**Scope:** Manual verification of all Phase 5 admin surfaces in light + dark themes and all 3 locales (en/vi/ja).

## Pre-flight

- [ ] `cd fe && npm run dev:fe` running and reachable
- [ ] Logged in as an admin user (role: `admin` or `super-admin`)
- [ ] Browser dev-tools open to toggle theme and watch for console errors
- [ ] Locale switcher located (top-right language selector)

## Surfaces to Verify

For each surface below, walk it in **light mode AND dark mode**, with locale switched to **EN, VI, and JA**. Tick the row for each (locale × theme) combination that passes.

### 1. `/iam/permissions` — Role × Permission Matrix (Plan 5.1)

| Locale | Light | Dark |
|---|---|---|
| en | [ ] | [ ] |
| vi | [ ] | [ ] |
| ja | [ ] | [ ] |

Functional checks (do once, en + light is fine):
- [ ] Sections render grouped by feature dotted-prefix
- [ ] Columns show SUPER_ADMIN / ADMIN / LEADER / USER
- [ ] Toggle any cell → sticky "Save changes (1)" footer appears
- [ ] Cancel button clears dirty state, no confirmation dialog
- [ ] Save button fires one PUT per dirty role; R-10 toast appears in current locale
- [ ] Error path: with devtools Network "offline", toggling + Save shows error toast; dirty state preserved

### 2. `/iam/users/:id?tab=profile` — User Profile Tab (Plan 5.2)

| Locale | Light | Dark |
|---|---|---|
| en | [ ] | [ ] |
| vi | [ ] | [ ] |
| ja | [ ] | [ ] |

- [ ] Reached by clicking a row in /iam/users table
- [ ] Back-to-list link present and localized
- [ ] Profile fields: displayName, email, role, department all render
- [ ] Not-found case: visit /iam/users/99999 → empty state in current locale

### 3. `/iam/users/:id?tab=permissions` — Override Editor (Plan 5.2)

| Locale | Light | Dark |
|---|---|---|
| en | [ ] | [ ] |
| vi | [ ] | [ ] |
| ja | [ ] | [ ] |

- [ ] Allow overrides card + Deny overrides card render
- [ ] "+ Add" opens PermissionKeyPicker popover with grouped catalog keys
- [ ] Keys already in allow list are hidden from the deny picker (and vice versa)
- [ ] Selecting a key creates the row; R-10 toast appears
- [ ] × button removes the row; R-10 toast appears
- [ ] Expand "Effective permissions" panel → merged list (role + allow − deny) renders sorted
- [ ] Deep-link `/iam/users/:id?tab=permissions` opens on Permissions tab directly

### 4. KB Permission Modal (Plan 5.3 — KB scope)

| Locale | Light | Dark |
|---|---|---|
| en | [ ] | [ ] |
| vi | [ ] | [ ] |
| ja | [ ] | [ ] |

- [ ] Open modal from a KB card / detail page
- [ ] Scope toggle shows "Whole knowledge base" / "Specific category"
- [ ] Public/Private switch still writes `is_private` (dual-write preserved)
- [ ] Current grants list renders existing grants with × remove buttons
- [ ] PrincipalPicker search input functional
- [ ] Filter chips: All / Users / Teams / Roles all narrow the results
- [ ] Select principal → click Add → row appears in Current grants; R-10 toast
- [ ] × on grant row → removed; R-10 toast

### 5. Category Permission Modal (Plan 5.3 — category scope)

| Locale | Light | Dark |
|---|---|---|
| en | [ ] | [ ] |
| vi | [ ] | [ ] |
| ja | [ ] | [ ] |

- [ ] Open modal by clicking lock icon on a category row (EntityPermissionModal, entityType=category)
- [ ] Category scope grants flow through `/api/permissions/grants` (not legacy entity endpoints)
- [ ] `knowledge_base_id` is populated on the created grant (5.0a migration made column nullable; category scope still sends kbId)
- [ ] Add user grant with category scope → succeeds; R-10 toast
- [ ] × removes; R-10 toast

### 6. Legacy chat/search Entity modal branches (Plan 5.3 — NOT rewired)

- [ ] Chat entity permission modal still works via legacy `/knowledge_base_entity_permissions` endpoints (IOU #1 from 5.3)
- [ ] Search entity permission modal same
- [ ] No regression in either branch

### 7. R-10 Session Refresh Toast Localization

Trigger any mutation in each locale and confirm the toast text reads correctly:

- [ ] en — "Saved. Affected users will see changes on their next request — they may need to refresh."
- [ ] vi — Vietnamese translation of the same
- [ ] ja — Japanese translation of the same

## Dark Mode Parity

- [ ] Walk every surface in dark mode; no white-on-white, no black-on-black, no illegible hover states
- [ ] Grant row hover, picker popover background, section headers, sticky footer, toast — all contrast correctly
- [ ] 1 fix landed in Plan 5.4: OverrideEditor row remove button `text-slate-400` now paired with `dark:text-slate-500`

## i18n Parity

- [ ] All 22 namespaces under `permissions.admin.*` present in en, vi, ja (verified automatically by 5.4 parity script — exit 0)
- [ ] All `users.detail.*` keys present in all 3 locales (verified automatically)
- [ ] No `[TRANSLATE:` placeholder markers anywhere (none were introduced in 5.4)
- [ ] i18n parity script exit code: **0** (no missing keys found at 5.4 execution)

## Issues Found

_(fill in below as you walk the checklist)_

- …

## Sign-off

- [ ] All surfaces verified in light + dark
- [ ] All strings localized in en/vi/ja
- [ ] No placeholder `[TRANSLATE:` markers remain
- [ ] R-10 toast appears in the correct locale on every mutation
- [ ] Dark mode contrast acceptable across all surfaces
- [ ] No console errors during the walk-through

**Verified by:** ________________
**Date:** ________________
