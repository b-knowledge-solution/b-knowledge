# Quick Task 260403-i6n: Rename Administrators to System — Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Task Boundary

Rename "Administrators" to "System" across the entire codebase:
- Menu label "Administrators" → "System" in sidebar navigation
- BE module `admin/` → `system/` (files, classes, exports, barrel)
- API routes `/api/admin/*` → `/api/system/*`
- FE route paths `/admin/*` → `/system/*`
- FE API client URLs updated to match
- i18n keys updated (`nav.administrators` → `nav.system`, `admin.*` → `system.*`)

**Out of scope:**
- Role names (`admin`, `super-admin`) remain unchanged — these are authorization concepts, not module names
- `system-tools` module stays as-is (separate concern)
- Dashboard module route registration changes from `/api/admin/dashboard` to `/api/system/dashboard`

</domain>

<decisions>
## Implementation Decisions

### URL Path Scope
- **All `/api/admin/*` routes become `/api/system/*`** — full rename including dashboard, history, audit-log, system-tools, system-monitor, tokenizer, broadcast-messages, llm-providers
- This is a breaking API change but acceptable (no external consumers per v0.2 decisions)

### Module Rename Scope
- **Full rename `be/src/modules/admin/` → `be/src/modules/system/`**
- All files renamed: admin.controller.ts → system.controller.ts, admin.routes.ts → system.routes.ts, admin-history.model.ts → system-history.model.ts, etc.
- Barrel exports updated in index.ts
- ModelFactory references updated (AdminHistoryModel → SystemHistoryModel)
- `system-tools` module remains separate (no merge)

### Role Names (Not discussed — Claude's Discretion)
- Role strings (`admin`, `super-admin`, `leader`) stay unchanged
- Only module/route/UI label references to "admin"/"administrators" are renamed

</decisions>

<specifics>
## Specific Ideas

- FE sidebar nav: `labelKey: 'nav.administrators'` → `labelKey: 'nav.system'`
- FE routeConfig: all `/admin/*` paths → `/system/*`
- FE API files: `dashboardApi.ts` and `historiesApi.ts` update `/admin/` → `/system/`
- BE routes.ts: `apiRouter.use('/admin', ...)` → `apiRouter.use('/system', ...)`
- i18n: all 3 locales (en, vi, ja) updated

</specifics>
