# Phase 8: Frontend Rename - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename all frontend references from "Project" to "Knowledge Base" — feature directory, page components, all 43 components, API layer files, types, router config, sidebar nav, URL paths, TanStack Query keys, and i18n strings across 3 locales (en, vi, ja). Backend rename completed in Phase 7.

</domain>

<decisions>
## Implementation Decisions

### URL & Route Naming
- **D-01:** URL path: `/data-studio/projects/:projectId` → `/data-studio/knowledge-base/:knowledgeBaseId` (singular, consistent with BE route `/api/knowledge-base`)
- **D-02:** Route parameter: `:knowledgeBaseId` (full, explicit, matches `knowledge_base_id` FK convention)

### UI Label & i18n
- **D-03:** Display label: "Knowledge Base" everywhere — nav, breadcrumbs, page titles, buttons, modals. No abbreviation.
- **D-04:** i18n JSON keys: rename from `project.*` namespace to `knowledgeBase.*` (e.g., `knowledgeBase.create`, `knowledgeBase.settings`)
- **D-05:** All 3 locales (en, vi, ja) updated: ~54 en, ~24 vi, ~23 ja lines with "project" references

### File & Component Naming
- **D-06:** Feature directory: `fe/src/features/projects/` → `fe/src/features/knowledge-base/` (singular, kebab-case, matches BE module)
- **D-07:** Component naming: Full `KnowledgeBase` prefix (e.g., `KnowledgeBaseListPage.tsx`, `KnowledgeBaseDetailPage.tsx`, `KnowledgeBaseSettingsSheet.tsx`)
- **D-08:** API files: `projectApi.ts` → `knowledgeBaseApi.ts`, `projectQueries.ts` → `knowledgeBaseQueries.ts`
- **D-09:** Types file: `project.types.ts` → `knowledge-base.types.ts`

### TanStack Query Keys
- **D-10:** Query key namespace: `['projects', ...]` → `['knowledge-base', ...]` (kebab-case, matches URL)

### Claude's Discretion
- Order of file renames within the feature directory
- How to handle `ragflowApi.ts` in the projects feature (rename or leave as-is since it proxies RAG endpoints)
- Whether `CategoryFilterTabs.tsx` (noted as dead code in Phase 3 D-03-03) should be deleted during rename or left
- Exact component rename mapping for all 43 components (some like `DocumentListPanel.tsx` and `DocumentsTab.tsx` are generic and may not need "KnowledgeBase" prefix)
- Test file updates strategy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Feature (source of rename)
- `fe/src/features/projects/index.ts` — Barrel exports
- `fe/src/features/projects/api/projectApi.ts` — Raw HTTP API layer
- `fe/src/features/projects/api/projectQueries.ts` — TanStack Query hooks
- `fe/src/features/projects/types/project.types.ts` — TypeScript types
- `fe/src/features/projects/pages/ProjectListPage.tsx` — List page
- `fe/src/features/projects/pages/ProjectDetailPage.tsx` — Detail page
- `fe/src/features/projects/components/` — 43 components (full inventory)

### App Integration Points
- `fe/src/app/App.tsx` — Route definitions (lines 82-83 lazy imports, 192-193 routes)
- `fe/src/app/routeConfig.ts` — Route metadata (line 83, 194-195)
- `fe/src/layouts/sidebarNav.ts` — Sidebar nav (line 129-130: path + labelKey)

### i18n Files
- `fe/src/i18n/locales/en.json` — ~54 "project" references
- `fe/src/i18n/locales/vi.json` — ~24 "project" references
- `fe/src/i18n/locales/ja.json` — ~23 "project" references

### Architecture & Conventions
- `fe/CLAUDE.md` — FE architecture, feature module conventions, API layer split, i18n rules
- `CLAUDE.md` — Root project conventions, NX module boundary rules

### Prior Phase Context
- `.planning/phases/07-db-be-python-rename/07-CONTEXT.md` — BE naming decisions that FE must match
- `.planning/phases/03-refactor-project-feature-separate-project-creation-category-management-documents-standard-code-and-versioned-datasets/03-CONTEXT.md` — Original project refactor decisions (D-01 through D-09)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 7 naming map**: All BE names already established — FE must match
- **43 components**: Many are domain-specific (DocumentsTab, CategoryModal) and don't need "KnowledgeBase" prefix — only "Project"-prefixed ones do

### Established Patterns
- **API layer split**: `<domain>Api.ts` (raw HTTP) + `<domain>Queries.ts` (TanStack Query hooks) — rename both
- **Feature barrel**: `index.ts` re-exports all public components/hooks/types
- **Lazy imports**: `App.tsx` uses `React.lazy()` for page components
- **i18n**: Flat namespace in JSON files, referenced via `t('project.xxx')` pattern

### Integration Points
- **App.tsx**: Lazy imports + route definitions (4 lines)
- **routeConfig.ts**: Route metadata for breadcrumbs/nav highlighting (3 lines)
- **sidebarNav.ts**: Sidebar navigation item (2 lines)
- **i18n files**: All `t('project.*')` calls across the entire FE codebase
- **Cross-feature imports**: Other features may import from `@/features/projects` barrel

</code_context>

<specifics>
## Specific Ideas

- Only "Project"-prefixed components rename to "KnowledgeBase"-prefixed. Domain components (DocumentsTab, CategoryModal, VersionList, etc.) keep their names since they describe their content, not the parent entity.
- The BE API now serves at `/api/knowledge-base` — FE API layer must update all endpoint URLs.
- TanStack Query key change will invalidate all cached project data — this is expected and desired.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-frontend-rename*
*Context gathered: 2026-04-02*
