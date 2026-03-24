# Phase 3: Refactor project feature - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Refactor the project feature to separate concerns into a clear hierarchy: Project (create on list page) → Project Detail (category management) → Categories with 3 types (Documents, Standard, Code), each with distinct dataset creation behavior. Documents categories support versioned datasets, Standard categories create a single dataset, and Code categories create a special code-aware dataset with optional git sync.

</domain>

<decisions>
## Implementation Decisions

### Category Types & Behavior
- **D-01:** **Pre-defined tabs per type.** The project detail page has 3 fixed tabs: Documents, Standard, and Code. Users create multiple categories within each tab. Type is implicit from which tab they're in — no type picker needed.
- **D-02:** **Dataset creation on category creation.** Standard: dataset created immediately when category is created. Code: dataset created immediately with code-specific parser config. Documents: no dataset yet — a new dataset is created for each version.
- **D-03:** **Type-specific parser defaults.** Documents and Standard inherit the project's default parser config. Code forces a code-specific parser (language-aware chunking). Users can override per category.

### Project List → Detail Flow
- **D-04:** **List page is create-only + navigate.** Project list page shows project cards with name/description/status. Only action is "Create Project" button. Clicking a card navigates to the detail page. All management (edit, delete, permissions) moves to the detail page.
- **D-05:** **Category tabs + settings sidebar.** Project detail page main area has 3 category tabs (Documents, Standard, Code). Project settings (edit name, permissions, members, delete) in a collapsible sidebar or settings tab. Chat and Search tabs are removed from the project detail page — those are separate top-level features.

### Versioning UX for Documents
- **D-06:** **Version list + create button.** Each Documents category shows a list of versions (v1, v2, v3...). "New Version" button creates a new version which auto-creates a new dataset. Each version is independently manageable (upload files, view parsing status).
- **D-07:** **All versions stay active.** Old versions remain active and searchable when new versions are created. Users can manually archive or delete individual versions. Chat/search can query specific versions or all versions of a category.

### Code Category Specifics
- **D-08:** **Code parsing + optional git sync.** Code category primarily provides code-aware parsing and file type restrictions. Git repository sync (GitHub/GitLab) is an optional add-on — users can also manually upload code files.
- **D-09:** **Language-aware chunking.** Code parser detects programming language and chunks by functions/classes/methods. Uses existing advance-rag parsers. Supports major languages (Python, TypeScript, Java, Go, etc.). Not full AST parsing.

### Claude's Discretion
- Database migration strategy (alter existing tables vs new tables)
- Component decomposition within each category tab
- How to handle existing project_chats and project_searches data after removing those tabs
- Settings sidebar vs settings tab implementation approach
- Git sync polling/webhook architecture for code categories
- How to expose version selection in chat/search assistant config

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database Schema
- `be/src/shared/db/migrations/20260312000000_initial_schema.ts` — Tables: projects, document_categories, document_category_versions, document_category_version_files, project_datasets, project_permissions, project_entity_permissions

### Backend Module
- `be/src/modules/projects/` — Full module: services, controllers, models, routes, schemas
- `be/src/modules/projects/services/projects.service.ts` — Core project CRUD + auto-dataset creation
- `be/src/modules/projects/services/project-category.service.ts` — Category + version management
- `be/src/modules/projects/schemas/projects.schemas.ts` — All Zod validation schemas

### Frontend Feature
- `fe/src/features/projects/` — Full feature: pages, components, api, types
- `fe/src/features/projects/components/DocumentsTab.tsx` — Current documents tab implementation
- `fe/src/features/projects/components/CategoryModal.tsx` — Category create/edit modal
- `fe/src/features/projects/components/VersionModal.tsx` — Version create modal
- `fe/src/app/routeConfig.ts` — Route metadata for project pages
- `fe/src/app/App.tsx` — Route definitions

### Architecture & Conventions
- `be/CLAUDE.md` — Backend architecture, module layout rules, validation patterns
- `fe/CLAUDE.md` — Frontend architecture, feature module conventions, API layer split
- `CLAUDE.md` — Root project conventions, NX-style module boundary rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **DocumentsTab.tsx**: Current category sidebar + version panel — can be refactored into the 3-tab structure
- **CategoryModal.tsx / VersionModal.tsx**: Existing create/edit modals for categories and versions
- **ProjectDatasetPicker.tsx**: Dataset linking UI — reusable for standard/code category dataset display
- **DocumentListPanel.tsx**: File list with status indicators — reusable within version views
- **UploadFilesModal.tsx / UploadFolderModal.tsx**: File upload UX — reusable across all category types
- **KnowledgeBasePicker component**: Shared multi-select for datasets — already used in chat assistant config

### Established Patterns
- **Tab-based detail page**: Current 7-tab layout uses React state for active tab
- **API layer split**: `projectApi.ts` (raw HTTP) + `projectQueries.ts` (TanStack Query hooks)
- **Zod validation**: All mutations validated via `validate()` middleware with schemas in `projects.schemas.ts`
- **ModelFactory pattern**: All DB access through `ModelFactory.project`, `ModelFactory.documentCategory`, etc.
- **RBAC via CASL**: `requireAbility('read', 'Project')` enforces permissions at route level

### Integration Points
- **Routes**: Add/modify routes in `be/src/modules/projects/routes/projects.routes.ts`
- **Navigation**: Update `fe/src/app/App.tsx` and `fe/src/app/routeConfig.ts` for modified project pages
- **Sidebar nav**: Update `fe/src/layouts/sidebarNav.ts` if project menu structure changes
- **i18n**: All 3 locales (en.json, vi.json, ja.json) need new keys for category type labels, code-specific UI strings

</code_context>

<specifics>
## Specific Ideas

- One project can have multiple categories of the same type (e.g., multiple Documents categories)
- Chat/Search features are fully separated from projects — removed from project detail tabs
- Code category's git sync is optional (not required) — manual upload is the primary path
- Version numbering is user-facing (v1, v2, v3) with version_label field

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-refactor-project-feature*
*Context gathered: 2026-03-24*
