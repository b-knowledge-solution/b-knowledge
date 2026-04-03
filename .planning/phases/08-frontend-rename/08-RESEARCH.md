# Phase 8: Frontend Rename - Research

**Researched:** 2026-04-02
**Domain:** React SPA rename (feature directory, routes, i18n, TanStack Query, TypeScript types)
**Confidence:** HIGH

## Summary

Phase 8 renames all frontend references from "Project" to "Knowledge Base" across the React SPA. The backend rename (Phase 7) is complete -- the BE now serves at `/api/knowledge-base/*` with `knowledge_base_id` parameters. The FE must catch up: rename the feature directory, all 48 files within it, update API endpoint URLs, TanStack Query keys, route definitions, sidebar navigation, i18n strings across 3 locales, and fix cross-feature references from chat/search management pages.

The rename is contained. No other features import from the `@/features/projects` barrel -- only `App.tsx` lazy-imports 2 page components. However, 2 external pages (`ChatAssistantManagementPage`, `SearchAppManagementPage`) directly fetch `/api/projects` and use `queryKeys.projects.all`, so those must be updated too. The `ConnectorSourceFields.tsx` references to "project" are for external services (Jira, Bitbucket, Asana) and must NOT be renamed.

**Primary recommendation:** Execute as a 3-wave rename: (1) core feature directory + API layer + types + query keys, (2) route/nav/i18n integration points, (3) cross-feature references + tests. Use git mv for directory rename to preserve history.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** URL path: `/data-studio/projects/:projectId` -> `/data-studio/knowledge-base/:knowledgeBaseId` (singular, consistent with BE route `/api/knowledge-base`)
- **D-02:** Route parameter: `:knowledgeBaseId` (full, explicit, matches `knowledge_base_id` FK convention)
- **D-03:** Display label: "Knowledge Base" everywhere -- nav, breadcrumbs, page titles, buttons, modals. No abbreviation.
- **D-04:** i18n JSON keys: rename from `project.*` namespace to `knowledgeBase.*` (e.g., `knowledgeBase.create`, `knowledgeBase.settings`)
- **D-05:** All 3 locales (en, vi, ja) updated: ~54 en, ~24 vi, ~23 ja lines with "project" references
- **D-06:** Feature directory: `fe/src/features/projects/` -> `fe/src/features/knowledge-base/` (singular, kebab-case, matches BE module)
- **D-07:** Component naming: Full `KnowledgeBase` prefix (e.g., `KnowledgeBaseListPage.tsx`, `KnowledgeBaseDetailPage.tsx`, `KnowledgeBaseSettingsSheet.tsx`)
- **D-08:** API files: `projectApi.ts` -> `knowledgeBaseApi.ts`, `projectQueries.ts` -> `knowledgeBaseQueries.ts`
- **D-09:** Types file: `project.types.ts` -> `knowledge-base.types.ts`
- **D-10:** Query key namespace: `['projects', ...]` -> `['knowledge-base', ...]` (kebab-case, matches URL)

### Claude's Discretion
- Order of file renames within the feature directory
- How to handle `ragflowApi.ts` in the projects feature (rename or leave as-is since it proxies RAG endpoints)
- Whether `CategoryFilterTabs.tsx` (noted as dead code in Phase 3 D-03-03) should be deleted during rename or left
- Exact component rename mapping for all 43 components (some like `DocumentListPanel.tsx` and `DocumentsTab.tsx` are generic and may not need "KnowledgeBase" prefix)
- Test file updates strategy

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REN-01 | User sees "Knowledge Base" instead of "Project" across all UI pages, navigation, and labels (3 locales: en, vi, ja) | i18n audit: 54 en + 24 vi + 23 ja lines; sidebar nav; route config; all component labels |
| REN-04 | All FE feature files, routes, components renamed (`/projects/:id` -> `/knowledge-base/:knowledgeBaseId`, feature directory, API layer) | Full file inventory (48 files), route definitions in App.tsx (2 routes), routeConfig.ts (1 entry), sidebarNav.ts (1 entry), API endpoints (60+ URLs) |
| REN-06 | All test files updated to use new naming, full test suite passes after rename | 6 test files in `fe/tests/features/projects/`, plus `queryKeys.test.ts` and 4 agent test files with project refs |
</phase_requirements>

## Architecture Patterns

### Feature Directory Rename Map

Current: `fe/src/features/projects/` (48 files)
Target: `fe/src/features/knowledge-base/` (per D-06)

```
fe/src/features/knowledge-base/
├── api/
│   ├── knowledgeBaseApi.ts        # was projectApi.ts (D-08)
│   ├── knowledgeBaseQueries.ts    # was projectQueries.ts (D-08)
│   └── ragflowApi.ts             # KEEP as-is (RAG dataset proxy, not a "project" concept)
├── components/
│   ├── KnowledgeBaseActivityFeed.tsx     # was ProjectActivityFeed.tsx
│   ├── KnowledgeBaseDatasetPicker.tsx    # was ProjectDatasetPicker.tsx
│   ├── KnowledgeBaseMemberList.tsx       # was ProjectMemberList.tsx
│   ├── KnowledgeBasePermissionModal.tsx  # was ProjectPermissionModal.tsx
│   ├── KnowledgeBaseSettingsSheet.tsx    # was ProjectSettingsSheet.tsx
│   ├── CreateKnowledgeBaseModal.tsx      # was CreateProjectModal.tsx
│   ├── BuiltInParserFields.tsx          # KEEP (generic)
│   ├── CategoryFilterTabs.tsx           # DELETE (dead code per Phase 3 D-03-03)
│   ├── CategoryModal.tsx                # KEEP (generic)
│   ├── CategorySidebar.tsx              # KEEP (generic)
│   ├── ChatModal.tsx                    # KEEP (generic)
│   ├── ChatTab.tsx                      # KEEP (generic)
│   ├── CodeCategoryModal.tsx            # KEEP (generic)
│   ├── CodeCategoryView.tsx             # KEEP (generic)
│   ├── CodeSourcePanel.tsx              # KEEP (generic)
│   ├── CodeTabRedesigned.tsx            # KEEP (generic)
│   ├── ConversionStatusModal.tsx        # KEEP (generic)
│   ├── DocumentListPanel.tsx            # KEEP (generic)
│   ├── DocumentsTab.tsx                 # KEEP (generic)
│   ├── DocumentsTabRedesigned.tsx       # KEEP (generic)
│   ├── EditVersionModal.tsx             # KEEP (generic)
│   ├── EntityPermissionModal.tsx        # KEEP (generic)
│   ├── JobManagementModal.tsx           # KEEP (generic)
│   ├── JobManagementPanel.tsx           # KEEP (generic)
│   ├── PipelineStatusBar.tsx            # KEEP (generic)
│   ├── SearchModal.tsx                  # KEEP (generic)
│   ├── SearchTab.tsx                    # KEEP (generic)
│   ├── SettingsTab.tsx                  # KEEP (generic)
│   ├── StandardCategoryView.tsx         # KEEP (generic)
│   ├── StandardTabRedesigned.tsx        # KEEP (generic)
│   ├── SyncConfigPanel.tsx              # KEEP (generic)
│   ├── SyncConnectionFields.tsx         # KEEP (generic)
│   ├── SyncSchedulePanel.tsx            # KEEP (generic)
│   ├── SyncStatusPanel.tsx              # KEEP (generic)
│   ├── SyncTab.tsx                      # KEEP (generic)
│   ├── UploadFilesModal.tsx             # KEEP (generic)
│   ├── UploadFolderModal.tsx            # KEEP (generic)
│   ├── VersionCard.tsx                  # KEEP (generic)
│   ├── VersionList.tsx                  # KEEP (generic)
│   ├── VersionModal.tsx                 # KEEP (generic)
│   └── VersionUploadArea.tsx            # KEEP (generic)
├── pages/
│   ├── KnowledgeBaseListPage.tsx        # was ProjectListPage.tsx (D-07)
│   └── KnowledgeBaseDetailPage.tsx      # was ProjectDetailPage.tsx (D-07)
├── types/
│   └── knowledge-base.types.ts          # was project.types.ts (D-09)
└── index.ts                             # barrel (updated exports)
```

**Rename summary:** 8 files renamed (6 "Project"-prefixed components + 2 API files + 1 types file + 2 pages = 11 renames). 1 file deleted (CategoryFilterTabs). ~36 files keep their names but move with the directory.

### API Endpoint URL Changes

All 60+ API calls in `projectApi.ts` change from `/api/projects/...` to `/api/knowledge-base/...`:

```typescript
// BEFORE
api.get("/api/projects")
api.get(`/api/projects/${id}`)
api.post("/api/projects", data)
api.get(`/api/projects/${projectId}/categories`)

// AFTER
api.get("/api/knowledge-base")
api.get(`/api/knowledge-base/${id}`)
api.post("/api/knowledge-base", data)
api.get(`/api/knowledge-base/${knowledgeBaseId}/categories`)
```

### TanStack Query Key Changes

**In `lib/queryKeys.ts`:** Rename `projects` section to `knowledgeBase`, change root key from `['projects']` to `['knowledge-base']`:

```typescript
// BEFORE
projects: {
  all: ['projects'] as const,
  members: (projectId: string) => [...queryKeys.projects.all, projectId, 'members'] as const,
  ...
}

// AFTER
knowledgeBase: {
  all: ['knowledge-base'] as const,
  members: (knowledgeBaseId: string) => [...queryKeys.knowledgeBase.all, knowledgeBaseId, 'members'] as const,
  ...
}
```

**In `projectQueries.ts` (becomes `knowledgeBaseQueries.ts`):** Currently uses inline string keys like `['projects', 'list']` instead of the centralized `queryKeys.projects.*`. These MUST be migrated to use the centralized factory:

```typescript
// BEFORE (inline keys, inconsistent)
queryKey: ['projects', 'list'],
queryKey: ['projects', 'detail', id],
queryKey: ['projects', projectId, 'categories'],

// AFTER (centralized factory)
queryKey: queryKeys.knowledgeBase.list(),
queryKey: queryKeys.knowledgeBase.detail(id),
queryKey: queryKeys.knowledgeBase.categories(knowledgeBaseId),
```

This requires expanding `queryKeys.knowledgeBase` to include `list`, `detail`, `categories`, `versions`, `documents`, `chats`, `searches`, `permissions` sub-keys that currently only exist as inline strings in `projectQueries.ts`.

### TypeScript Type Renames

In `knowledge-base.types.ts` (was `project.types.ts`):

```typescript
// Key type renames
Project -> KnowledgeBase
ProjectDataset -> KnowledgeBaseDataset
ProjectPermission -> KnowledgeBasePermission
ProjectChat -> KnowledgeBaseChat
ProjectSearch -> KnowledgeBaseSearch
ProjectSyncConfig -> KnowledgeBaseSyncConfig
ProjectMember -> KnowledgeBaseMember

// Key field renames (to match BE Phase 7)
project_id -> knowledge_base_id
```

### Route & Navigation Changes

**App.tsx (lines 82-83, 192-193):**
```typescript
// BEFORE
const ProjectListPage = lazy(() => import('@/features/projects/pages/ProjectListPage'));
const ProjectDetailPage = lazy(() => import('@/features/projects/pages/ProjectDetailPage'));
// routes:
<Route path="data-studio/projects" element={...}><ProjectListPage /></Route>
<Route path="data-studio/projects/:projectId" element={...}><ProjectDetailPage /></Route>

// AFTER
const KnowledgeBaseListPage = lazy(() => import('@/features/knowledge-base/pages/KnowledgeBaseListPage'));
const KnowledgeBaseDetailPage = lazy(() => import('@/features/knowledge-base/pages/KnowledgeBaseDetailPage'));
// routes:
<Route path="data-studio/knowledge-base" element={...}><KnowledgeBaseListPage /></Route>
<Route path="data-studio/knowledge-base/:knowledgeBaseId" element={...}><KnowledgeBaseDetailPage /></Route>
```

**routeConfig.ts (line 83-87):**
```typescript
// BEFORE
'/data-studio/projects': { titleKey: 'projectManagement.title', guidelineFeatureId: 'projects', fullBleed: true }

// AFTER
'/data-studio/knowledge-base': { titleKey: 'knowledgeBase.title', guidelineFeatureId: 'knowledge-base', fullBleed: true }
```

**sidebarNav.ts (lines 129-132):**
```typescript
// BEFORE
{ path: '/data-studio/projects', labelKey: 'nav.projects', icon: FolderOpen }

// AFTER
{ path: '/data-studio/knowledge-base', labelKey: 'nav.knowledgeBase', icon: FolderOpen }
```

**NavigationLoader.tsx (line 190-192):** Contains example paths `/projects` in JSDoc comments -- update to `/knowledge-base`.

### i18n Key Renames

Two namespaces need renaming:

1. **`projectManagement.*`** (primary namespace, ~387 usage sites across 33 files) -> `knowledgeBase.*`
2. **`projects.*`** (secondary namespace, ~86 usage sites across 13 files) -> merge into `knowledgeBase.*`
3. **`nav.projects`** -> `nav.knowledgeBase`

Total i18n lines to edit: ~54 en + ~24 vi + ~23 ja = ~101 lines across 3 locale files.

**Important:** Do NOT rename i18n keys that refer to external "projects" (Jira projects, Bitbucket projects, Asana projects). These are in `datasets.connectors.fields.*` and `datasets.connectors.tooltips.*` namespaces and must be preserved.

### Cross-Feature References (Outside projects/ directory)

| File | What References | Action |
|------|----------------|--------|
| `fe/src/features/chat/pages/ChatAssistantManagementPage.tsx` | `queryKeys.projects.all`, `/api/projects` fetch, `projectItems` variable | Update to `queryKeys.knowledgeBase.all`, `/api/knowledge-base`, `knowledgeBaseItems` |
| `fe/src/features/search/pages/SearchAppManagementPage.tsx` | `queryKeys.projects.all`, `/api/projects` fetch, `projectItems` variable | Same as above |
| `fe/src/features/agents/api/agentApi.ts` | `project_id` param in agent list | Update to `knowledge_base_id` (must match BE) |
| `fe/src/features/agents/types/agent.types.ts` | `project_id` field | Update to `knowledge_base_id` |
| `fe/src/lib/queryKeys.ts` | `projects` section | Rename to `knowledgeBase` with expanded keys |
| `fe/src/app/App.tsx` | Lazy imports + route paths | Update imports + paths |
| `fe/src/app/routeConfig.ts` | Route metadata entry | Update path + titleKey |
| `fe/src/layouts/sidebarNav.ts` | Sidebar nav item | Update path + labelKey |
| `fe/src/components/NavigationLoader.tsx` | JSDoc example paths | Update comment only |

### Files That Must NOT Be Renamed

| File | Why |
|------|-----|
| `fe/src/features/datasets/components/ConnectorSourceFields.tsx` | "project" refs are for Jira/Bitbucket/Asana external projects |
| `fe/src/i18n/locales/*.json` connector field keys | Same -- external service terminology |
| `fe/src/features/projects/api/ragflowApi.ts` | Proxies RAG dataset endpoints, not a "project" concept. Recommend keeping as `ragflowApi.ts` since it wraps RAGFlow-specific dataset operations. It moves with the directory but keeps its name. |

### Anti-Patterns to Avoid

- **Partial rename:** Leaving `projectId` variable names when the parameter is now `:knowledgeBaseId` in routes. Use `knowledgeBaseId` consistently in all function signatures and destructured params.
- **Mixed query keys:** Inline `['projects', ...]` keys alongside centralized `queryKeys.knowledgeBase.*`. All keys must go through the centralized factory after rename.
- **Forgetting barrel exports:** The `index.ts` barrel re-exports types like `Project`, `ProjectDataset` -- these must become `KnowledgeBase`, `KnowledgeBaseDataset`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Directory rename with git history | Manual file copy + delete | `git mv` for directory rename | Preserves git blame/history for all 48 files |
| Find-and-replace across i18n files | Manual editing of 101 lines | Structured search-replace with verification | Too error-prone manually; need to avoid renaming external "project" references |
| Query key migration | Manual string replacement | Update centralized `queryKeys.ts` factory, then update all consumers | Single source of truth prevents cache key mismatches |

## Common Pitfalls

### Pitfall 1: Stale Query Cache After Rename
**What goes wrong:** Old `['projects', ...]` cache entries remain in QueryClient, causing phantom data or missing invalidation.
**Why it happens:** TanStack Query identifies cache entries by key arrays. If some code still uses `['projects', ...]` while others use `['knowledge-base', ...]`, invalidation breaks.
**How to avoid:** Ensure EVERY query key reference is updated. After rename, grep for any remaining `'projects'` string in query key positions.
**Warning signs:** Data doesn't refresh after mutations; stale data appears after navigation.

### Pitfall 2: Route Parameter Mismatch
**What goes wrong:** Components use `useParams<{ projectId: string }>()` but route defines `:knowledgeBaseId`.
**Why it happens:** Renaming the route path parameter without updating all `useParams` destructuring.
**How to avoid:** Search for all `useParams` calls and `projectId` destructuring in the feature. Update to `knowledgeBaseId`.
**Warning signs:** `undefined` values where IDs are expected; blank detail pages.

### Pitfall 3: i18n Key Mismatch Between Code and JSON
**What goes wrong:** Component calls `t('knowledgeBase.createSuccess')` but JSON still has `projectManagement.createSuccess`.
**Why it happens:** Renaming code references and JSON keys in separate steps without cross-verification.
**How to avoid:** Rename i18n JSON keys first, then update `t()` calls, then verify no untranslated keys appear in UI.
**Warning signs:** Translation keys showing as raw strings in UI instead of translated text.

### Pitfall 4: External "Project" References Accidentally Renamed
**What goes wrong:** Jira "Project Key", Bitbucket "Projects", Asana "Project ID" labels get renamed to "Knowledge Base".
**Why it happens:** Overly aggressive find-and-replace.
**How to avoid:** ConnectorSourceFields.tsx and its related i18n keys (`datasets.connectors.fields.projectOwner`, etc.) must be excluded from rename. Same for `datasets.connectors.tooltips.jiraProjectKey`, `bitbucketProjects`, etc.
**Warning signs:** Connector configuration UI shows "Knowledge Base Key" instead of "Project Key" for Jira integration.

### Pitfall 5: Cross-Feature Inline API Calls
**What goes wrong:** `ChatAssistantManagementPage` and `SearchAppManagementPage` still fetch `/api/projects` after BE rename.
**Why it happens:** These files are outside the `features/projects/` directory and easy to miss.
**How to avoid:** The research identifies exactly 2 external pages with inline `/api/projects` calls. Both must update to `/api/knowledge-base`.
**Warning signs:** 404 errors when loading chat assistant or search app management pages.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom) |
| Config file | `fe/vitest.config.ts` (umbrella), `fe/vitest.unit.config.ts`, `fe/vitest.ui.config.ts` |
| Quick run command | `npm run test:run -w fe` |
| Full suite command | `npm run test:run -w fe` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REN-04 | API layer calls correct endpoints | unit | `npm run test:run:unit -w fe` | Yes (projectApi.test.ts -> rename) |
| REN-04 | Query keys use new namespace | unit | `npm run test:run:unit -w fe` | Yes (queryKeys.test.ts -> update) |
| REN-06 | All test files reference new paths/names | unit+ui | `npm run test:run -w fe` | Yes (6 files -> rename + update) |
| REN-01 | Components render with correct i18n keys | ui | `npm run test:run:ui -w fe` | Yes (5 component tests -> update) |

### Test Files Requiring Rename/Update

| Current Path | Action |
|-------------|--------|
| `fe/tests/features/projects/api/projectApi.test.ts` | Move to `tests/features/knowledge-base/api/knowledgeBaseApi.test.ts`, update endpoint URLs |
| `fe/tests/features/projects/ProjectSettingsSheet.test.tsx` | Move + rename to `KnowledgeBaseSettingsSheet.test.tsx` |
| `fe/tests/features/projects/StandardCategoryView.test.tsx` | Move (name stays) |
| `fe/tests/features/projects/VersionCard.test.tsx` | Move (name stays) |
| `fe/tests/features/projects/CategorySidebar.test.tsx` | Move (name stays) |
| `fe/tests/features/projects/CodeCategoryView.test.tsx` | Move (name stays) |
| `fe/tests/lib/queryKeys.test.ts` | Update `projects` key references to `knowledgeBase` |
| `fe/tests/features/agent/agentApi.test.ts` | Update `project_id` references |
| `fe/tests/features/agent/AgentCard.test.tsx` | Update project references if any |
| `fe/tests/features/agent/AgentListPage.test.tsx` | Update project references if any |
| `fe/tests/features/agent/AgentToolbar.test.tsx` | Update project references if any |

### Sampling Rate
- **Per task commit:** `npm run test:run -w fe`
- **Per wave merge:** `npm run test:run -w fe && npm run build -w fe`
- **Phase gate:** Full suite green + TypeScript build clean

### Wave 0 Gaps
None -- existing test infrastructure covers all phase requirements. Test files need rename/update, not creation.

## Project Constraints (from CLAUDE.md)

- **TypeScript strict mode** -- all renamed types must maintain strict typing
- **NX-style module boundaries** -- no cross-module imports; barrel exports only
- **API layer split** -- `knowledgeBaseApi.ts` (raw HTTP) + `knowledgeBaseQueries.ts` (TanStack hooks)
- **Never use `*Service.ts`** -- always `*Api.ts`
- **i18n: 3 locales required** -- en, vi, ja all must be updated
- **Query keys centralized in `lib/queryKeys.ts`** -- never define local query key constants
- **JSDoc mandatory** -- all renamed exports must maintain JSDoc blocks
- **Inline comments mandatory** -- maintain above control flow, business logic, integration points
- **`@/*` path alias** -- all imports use `@/features/knowledge-base/...`
- **No manual memoization** -- React Compiler handles it
- **Dark mode support** -- class-based, both themes (no impact on rename but verify no hardcoded strings)

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all 48 files in `fe/src/features/projects/`
- Direct codebase inspection of `fe/src/lib/queryKeys.ts` (centralized query keys)
- Direct codebase inspection of `fe/src/app/App.tsx`, `routeConfig.ts`, `sidebarNav.ts`
- Direct codebase inspection of `fe/src/i18n/locales/{en,vi,ja}.json`
- Direct codebase inspection of cross-feature references (chat, search, agents)
- `fe/CLAUDE.md` -- FE architecture conventions
- `CLAUDE.md` -- Root project conventions
- Phase 7 CONTEXT.md -- BE naming decisions
- Phase 8 CONTEXT.md -- locked decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries needed, pure rename operation
- Architecture: HIGH - direct codebase inspection, all files inventoried
- Pitfalls: HIGH - common rename issues well understood, specific to this codebase

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable -- rename scope is fully defined)
