---
phase: 02-access-control
plan: 04
subsystem: ui
tags: [casl, react, abac, i18n, rbac, sidebar, org-switcher]

# Dependency graph
requires:
  - phase: 02-access-control
    provides: CASL ability service and auth endpoints (02-02)
provides:
  - AbilityProvider distributing CASL abilities via React context
  - Can component for declarative permission gating
  - useAppAbility hook for imperative permission checks
  - RoleBadge component with color-coded role display
  - OrgSwitcher component for multi-org navigation
  - CASL-gated sidebar navigation (Data Studio, IAM, Administration)
  - Full i18n keys for access control in 3 locales (en, vi, ja)
affects: [02-05, 02-06, 02-07]

# Tech tracking
tech-stack:
  added: ["@casl/ability@6.8.0", "@casl/react@5.0.1"]
  patterns: [casl-react-context, ability-based-nav-gating, role-badge-color-coding]

key-files:
  created:
    - fe/src/lib/ability.tsx
    - fe/src/components/ui/role-badge.tsx
    - fe/src/components/OrgSwitcher.tsx
  modified:
    - fe/src/app/Providers.tsx
    - fe/src/layouts/Sidebar.tsx
    - fe/src/layouts/sidebarNav.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json
    - fe/package.json

key-decisions:
  - "AbilityProvider placed inside AuthProvider to access user state for conditional ability fetching"
  - "Sidebar uses CASL ability.can() checks per nav group labelKey rather than replacing the existing role-based config"
  - "OrgSwitcher supports both collapsed and expanded sidebar modes"

patterns-established:
  - "CASL React pattern: AbilityProvider -> useAppAbility/Can for permission gating"
  - "Role badge color coding: super-admin=red, admin=purple, leader=blue, user=slate"

requirements-completed: [ACCS-02]

# Metrics
duration: 10min
completed: 2026-03-18
---

# Phase 2 Plan 4: Frontend CASL Integration Summary

**CASL React bindings with AbilityProvider, permission-gated sidebar, RoleBadge, OrgSwitcher, and access control i18n in 3 locales**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-18T13:36:17Z
- **Completed:** 2026-03-18T13:46:17Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Installed @casl/ability and @casl/react, created AbilityProvider that fetches user permission rules from backend
- Created RoleBadge component with 4 color-coded role styles supporting light and dark mode
- Created OrgSwitcher component supporting single-org static display and multi-org dropdown
- Added CASL ability.can() checks to sidebar for Data Studio, IAM, and Administration nav groups
- Added comprehensive accessControl i18n namespace plus audit log action/resource extensions in all 3 locales

## Task Commits

Each task was committed atomically:

1. **Task 1: Install CASL React, create AbilityProvider and RoleBadge** - `da25bc6` (feat)
2. **Task 2: Add OrgSwitcher, sidebar permission gating, and i18n keys** - `8120df0` (feat)

## Files Created/Modified
- `fe/src/lib/ability.tsx` - AbilityProvider, Can component, useAppAbility hook, AppAbility type
- `fe/src/components/ui/role-badge.tsx` - Color-coded role badge (super-admin, admin, leader, user)
- `fe/src/components/OrgSwitcher.tsx` - Org selector with multi-org dropdown and single-org static display
- `fe/src/app/Providers.tsx` - Wired AbilityProvider inside AuthProvider
- `fe/src/layouts/Sidebar.tsx` - Added CASL ability checks for nav group visibility
- `fe/src/layouts/sidebarNav.ts` - Updated roles to include super-admin
- `fe/src/i18n/locales/en.json` - Added accessControl namespace and audit log extensions
- `fe/src/i18n/locales/vi.json` - Vietnamese translations for all access control keys
- `fe/src/i18n/locales/ja.json` - Japanese translations for all access control keys
- `fe/package.json` - Added @casl/ability and @casl/react dependencies

## Decisions Made
- AbilityProvider placed inside AuthProvider (needs user state) but outside SettingsProvider in the provider tree
- Sidebar uses CASL ability.can() checks mapped by nav group labelKey for clean separation from existing role config
- OrgSwitcher receives isCollapsed prop to support both sidebar states

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- @casl/react version 4.x specified in plan did not exist; used 5.0.1 (latest stable with React 19 support)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CASL React integration complete, Can component and useAppAbility ready for use in all feature components
- Sidebar permission gating in place; ready for route-level protection and feature page guards
- i18n keys in place for role management, policy editor, and access denied pages

---
*Phase: 02-access-control*
*Completed: 2026-03-18*
