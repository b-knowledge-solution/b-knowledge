---
phase: 260403-i6n
plan: 01
subsystem: full-stack
tags: [rename, module, routes, i18n, navigation]
dependency-graph:
  requires: []
  provides:
    - "BE system module at be/src/modules/system/"
    - "API routes at /api/system/* prefix"
    - "FE routes at /system/* paths"
    - "Sidebar nav.system label in 3 locales"
  affects:
    - "be/src/app/routes.ts"
    - "be/src/shared/models/factory.ts"
    - "fe/src/layouts/sidebarNav.ts"
    - "fe/src/app/routeConfig.ts"
    - "fe/src/app/App.tsx"
tech-stack:
  added: []
  patterns: [module-rename, route-prefix-change]
key-files:
  created:
    - be/src/modules/system/index.ts
    - be/src/modules/system/controllers/system.controller.ts
    - be/src/modules/system/controllers/system-history.controller.ts
    - be/src/modules/system/services/system-history.service.ts
    - be/src/modules/system/models/system-history.model.ts
    - be/src/modules/system/routes/system.routes.ts
    - be/src/modules/system/routes/system-history.routes.ts
  modified:
    - be/src/shared/models/factory.ts
    - be/src/app/routes.ts
    - be/CLAUDE.md
    - fe/src/layouts/sidebarNav.ts
    - fe/src/app/routeConfig.ts
    - fe/src/app/App.tsx
    - fe/src/features/dashboard/api/dashboardApi.ts
    - fe/src/features/histories/api/historiesApi.ts
    - fe/src/features/broadcast/pages/BroadcastMessagePage.tsx
    - fe/src/features/broadcast/api/broadcastQueries.ts
    - fe/src/i18n/locales/en.json
    - fe/src/i18n/locales/vi.json
    - fe/src/i18n/locales/ja.json
  deleted:
    - be/src/modules/admin/ (entire directory)
decisions:
  - "Role strings (admin, super-admin) preserved in auth middleware -- these are authorization roles, not module names"
  - "ModelFactory getter renamed from adminHistory to systemHistory for full consistency"
metrics:
  duration: 8min
  completed: "2026-04-03T13:23:00Z"
---

# Quick Task 260403-i6n: Rename Administrators to System Summary

Full-stack rename of "Administrators" module to "System" across BE module directory, API route prefixes, FE route paths, sidebar navigation, API client URLs, and i18n keys in all 3 locales.

## Task Results

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Rename BE admin module to system | 64d729c | Done |
| 2 | Rename FE routes, nav, API URLs, and i18n | 3a026f8 | Done |
| 3 | Verify full rename in browser | - | Done (human-verified) |

## What Changed

### Backend (Task 1)
- Moved `be/src/modules/admin/` to `be/src/modules/system/` with all files renamed (controllers, services, models, routes)
- Renamed all classes: AdminHistoryModel -> SystemHistoryModel, AdminHistoryService -> SystemHistoryService, AdminHistoryController -> SystemHistoryController, AdminController -> SystemController
- Updated ModelFactory: `adminHistory` getter -> `systemHistory` with renamed private field
- Updated routes.ts: `/api/admin/*` -> `/api/system/*` route prefixes
- Deleted `be/src/modules/admin/` directory entirely
- Updated be/CLAUDE.md architecture diagram

### Frontend (Task 2)
- Sidebar nav: `nav.administrators` -> `nav.system`, all `/admin/*` paths -> `/system/*`
- Route config: all `/admin/*` entries -> `/system/*`, `admin.broadcastMessages` -> `system.broadcastMessages`
- App.tsx: all `admin/*` route paths -> `system/*`
- Dashboard API: `/api/admin/dashboard/*` -> `/api/system/dashboard/*`
- Histories API: `/api/admin/history/*` -> `/api/system/history/*`
- Broadcast: `admin.broadcast.*` i18n keys -> `system.broadcast.*`
- i18n (en/vi/ja): `nav.administrators` -> `nav.system` with translations (System / He thong / sisutemu), `admin` namespace -> `system` namespace

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
