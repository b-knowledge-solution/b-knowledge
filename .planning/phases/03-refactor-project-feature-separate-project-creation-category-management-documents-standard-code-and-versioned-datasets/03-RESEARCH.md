# Phase 03: Refactor Project Feature - Research

**Researched:** 2026-03-24
**Domain:** Full-stack refactor (Express + React) of project feature module
**Confidence:** HIGH

## Summary

This phase refactors the existing project feature from a 7-tab detail page with inline chat/search management into a streamlined 3-tab category-centric layout (Documents, Standard, Code) with a settings sidebar. The codebase already has a mature project module with category/version/file hierarchy, RBAC, dataset auto-creation, and full CRUD. The refactor involves database schema changes (adding `category_type` to `document_categories`), removing chat/search tabs from the project detail page, restructuring the FE detail page to use 3 category-type tabs, and adding code-specific dataset creation behavior.

The existing `advance-rag/rag/app/code.py` parser already supports tree-sitter AST parsing for 20+ languages, so the "code-aware chunking" requirement (D-09) is satisfied by the existing parser -- the task is to wire it up as the default parser for Code category datasets. The `document_categories` table currently has no `type` column, so a migration adding `category_type` (enum: documents, standard, code) is needed.

**Primary recommendation:** Add a `category_type` column to `document_categories` via a new migration, refactor the FE detail page to show 3 fixed tabs that filter categories by type, adjust dataset auto-creation logic per type (Documents: on version create, Standard: on category create, Code: on category create with code parser config), and remove Chat/Search tabs from the project detail page.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Pre-defined tabs per type. The project detail page has 3 fixed tabs: Documents, Standard, and Code. Users create multiple categories within each tab. Type is implicit from which tab they're in -- no type picker needed.
- **D-02:** Dataset creation on category creation. Standard: dataset created immediately when category is created. Code: dataset created immediately with code-specific parser config. Documents: no dataset yet -- a new dataset is created for each version.
- **D-03:** Type-specific parser defaults. Documents and Standard inherit the project's default parser config. Code forces a code-specific parser (language-aware chunking). Users can override per category.
- **D-04:** List page is create-only + navigate. Project list page shows project cards with name/description/status. Only action is "Create Project" button. Clicking a card navigates to the detail page. All management (edit, delete, permissions) moves to the detail page.
- **D-05:** Category tabs + settings sidebar. Project detail page main area has 3 category tabs (Documents, Standard, Code). Project settings (edit name, permissions, members, delete) in a collapsible sidebar or settings tab. Chat and Search tabs are removed from the project detail page -- those are separate top-level features.
- **D-06:** Version list + create button. Each Documents category shows a list of versions (v1, v2, v3...). "New Version" button creates a new version which auto-creates a new dataset. Each version is independently manageable (upload files, view parsing status).
- **D-07:** All versions stay active. Old versions remain active and searchable when new versions are created. Users can manually archive or delete individual versions. Chat/search can query specific versions or all versions of a category.
- **D-08:** Code parsing + optional git sync. Code category primarily provides code-aware parsing and file type restrictions. Git repository sync (GitHub/GitLab) is an optional add-on -- users can also manually upload code files.
- **D-09:** Language-aware chunking. Code parser detects programming language and chunks by functions/classes/methods. Uses existing advance-rag parsers. Supports major languages (Python, TypeScript, Java, Go, etc.). Not full AST parsing.

### Claude's Discretion
- Database migration strategy (alter existing tables vs new tables)
- Component decomposition within each category tab
- How to handle existing project_chats and project_searches data after removing those tabs
- Settings sidebar vs settings tab implementation approach
- Git sync polling/webhook architecture for code categories
- How to expose version selection in chat/search assistant config

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- TypeScript strict mode (BE + FE)
- JSDoc on every exported function/class/method/interface/type
- Inline comments above control flow, business logic, DB queries, guard clauses
- NX-style module boundaries: no cross-module imports, barrel exports only
- BE: ModelFactory pattern for all DB access, no direct `db()` in services
- BE: All mutations validated via Zod `validate()` middleware
- BE: Knex ORM for all models, migration naming via `npm run db:migrate:make`
- FE: API layer split: `*Api.ts` (raw HTTP) + `*Queries.ts` (TanStack Query hooks)
- FE: No manual memoization (React Compiler handles it)
- FE: i18n for all UI strings in 3 locales (en, vi, ja)
- FE: Dark mode support (class-based)
- FE: Native `useState` for forms, no form libraries

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Express | 4.21 | Backend HTTP framework | Project standard |
| Knex | latest | SQL query builder + migrations | Project ORM |
| Zod | latest | Schema validation | Project validation layer |
| React | 19 | Frontend UI | Project standard |
| TanStack Query | 5 | Server state management | Project data fetching pattern |
| shadcn/ui | latest | UI components (Tabs, Dialog, Sheet, etc.) | Project component library |
| Tailwind CSS | 3.4 | Styling | Project styling |
| react-i18next | latest | Internationalization | Project i18n |

### Supporting (already available)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tree-sitter-language-pack | (in advance-rag) | Code parsing | Code category parser -- already integrated |
| lucide-react | latest | Icons | All UI icons |

### No New Dependencies Needed
This phase requires zero new npm/pip packages. All functionality is achievable with the existing stack.

## Architecture Patterns

### Database Migration Strategy (Claude's Discretion: ALTER existing table)

**Recommendation:** Add `category_type` column to existing `document_categories` table rather than creating new tables.

**Rationale:**
1. The existing table structure (project -> categories -> versions -> files) already matches the needed hierarchy
2. Adding a type discriminator column is a safe, non-breaking ALTER
3. Avoids data migration complexity of new tables
4. Existing category CRUD service needs minimal changes

**Migration plan:**
```sql
-- New migration: add category_type to document_categories
ALTER TABLE document_categories
  ADD COLUMN category_type TEXT NOT NULL DEFAULT 'documents';

-- For Standard/Code categories, store the auto-created dataset_id
ALTER TABLE document_categories
  ADD COLUMN dataset_id TEXT NULL REFERENCES datasets(id) ON DELETE SET NULL;
```

The `category_type` column uses an enum-like TEXT ('documents', 'standard', 'code') with default 'documents' for backward compatibility with existing rows. The `dataset_id` column is needed because Standard and Code categories create a single dataset on category creation (unlike Documents which create datasets per version).

### Recommended Component Structure (FE)

```
fe/src/features/projects/
├── api/
│   ├── projectApi.ts           # Add category_type param to category APIs
│   └── projectQueries.ts       # TanStack Query hooks (add if converting from useState)
├── components/
│   ├── CategoryModal.tsx       # MODIFY: Add category_type field (hidden, set by parent tab)
│   ├── DocumentsTab.tsx        # MODIFY: Filter categories to type='documents' only
│   ├── StandardTab.tsx         # NEW: Standard categories (single dataset per category)
│   ├── CodeTab.tsx             # NEW: Code categories (code parser + optional git sync)
│   ├── ProjectSettingsSidebar.tsx  # NEW: Collapsible sidebar for project settings
│   ├── DocumentListPanel.tsx   # REUSE: File list within versions
│   ├── VersionModal.tsx        # REUSE: Version create modal
│   ├── UploadFilesModal.tsx    # REUSE: File upload
│   └── ... (existing components)
├── pages/
│   ├── ProjectListPage.tsx     # SIMPLIFY: Remove edit/delete/permissions inline
│   └── ProjectDetailPage.tsx   # MAJOR REFACTOR: 3 category tabs + settings sidebar
└── types/
    └── project.types.ts        # Update types
```

### Backend Service Changes

```
be/src/modules/projects/
├── services/
│   ├── projects.service.ts          # Minor: no structural changes
│   └── project-category.service.ts  # MAJOR: Add type-aware category creation
│       - createCategory(projectId, data, user)
│         - If type='standard': auto-create dataset, store dataset_id on category
│         - If type='code': auto-create dataset with parser_id='code', store dataset_id
│         - If type='documents': no dataset (created per version, existing behavior)
│       - deleteCategory(categoryId)
│         - If standard/code: also soft-delete the linked dataset
├── schemas/
│   └── projects.schemas.ts          # Add category_type to createCategorySchema
├── controllers/
│   └── projects.controller.ts       # Pass category_type through
└── routes/
    └── projects.routes.ts           # No route changes needed
```

### Pattern: Type-Discriminated Category Creation

**What:** Use category_type to dispatch different dataset creation behaviors
**When to use:** On category create (POST /api/projects/:id/categories)
**Example:**
```typescript
// In project-category.service.ts
async createCategory(projectId: string, data: any, user: UserContext): Promise<DocumentCategory> {
  const categoryType = data.category_type || 'documents'

  // Create the category record with type
  const category = await ModelFactory.documentCategory.create({
    project_id: projectId,
    name: data.name,
    description: data.description || null,
    category_type: categoryType,
    sort_order: data.sort_order ?? 0,
    dataset_config: JSON.stringify(data.dataset_config || {}),
    created_by: user.id,
    updated_by: user.id,
  })

  // Standard and Code categories auto-create a single dataset
  if (categoryType === 'standard' || categoryType === 'code') {
    const project = await ModelFactory.project.findById(projectId)
    const parserId = categoryType === 'code' ? 'code' : (project?.default_chunk_method || 'naive')

    const dataset = await ModelFactory.dataset.create({
      name: `${project?.name}_${data.name}`,
      parser_id: parserId,
      embedding_model: project?.default_embedding_model || null,
      // ... other fields
    })

    // Store dataset reference on the category
    await ModelFactory.documentCategory.update(category.id, { dataset_id: dataset.id })

    // Link dataset to project
    await ModelFactory.projectDataset.create({
      project_id: projectId,
      dataset_id: dataset.id,
      auto_created: true,
    })
  }

  return category
}
```

### Pattern: Settings Sidebar (Claude's Discretion)

**Recommendation:** Use a collapsible Sheet (shadcn/ui Sheet component) triggered by a Settings icon button in the project detail header. This keeps the main area fully dedicated to category management while providing easy access to settings.

**Why Sheet over Tab:**
- The settings tab was one of 7 tabs competing for space -- removing it reduces tab bar clutter
- Settings are accessed infrequently compared to category management
- Sheet slides in from the right, maintaining context of what the user was working on
- Already used in the codebase (RunHistorySheet, WebhookSheet in agents feature)

### Pattern: Handling Removed Chat/Search Tabs (Claude's Discretion)

**Recommendation:** Keep the `project_chats` and `project_searches` tables and their data intact. Do NOT drop or migrate them. Simply remove the UI tabs and the FE components that render them. The tables remain as data that can be queried via the existing API if needed.

**Rationale:**
1. No data loss -- existing chat/search configurations remain accessible via API
2. Chat and Search are separate top-level features (per D-05) that may still reference project datasets
3. The BE routes for project chats/searches can remain active or be deprecated gracefully
4. Avoids risky data migration in a UI refactor phase

### Anti-Patterns to Avoid
- **Creating separate tables per category type:** All three types share the same `document_categories` table with a discriminator column. Don't create `standard_categories` and `code_categories` tables.
- **Cross-module imports for dataset creation:** The category service creates datasets through `ModelFactory.dataset`, not by importing from the knowledge-base module.
- **Hardcoding parser config in FE:** Code parser selection should be determined by the BE service based on `category_type`, not hardcoded in FE API calls.
- **Removing BE chat/search routes immediately:** Keep them for backward compatibility; only remove FE tabs.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Code parsing | Custom AST parser | `advance-rag/rag/app/code.py` (tree-sitter) | Already supports 20+ languages, handles fallback to naive chunking |
| Collapsible sidebar | Custom sidebar component | shadcn/ui `Sheet` component | Already used in agents feature, handles accessibility/animation |
| Tab component | Custom tabs | shadcn/ui `Tabs` component | Already used in current ProjectDetailPage |
| Form validation | Custom validators | Zod schemas + `validate()` middleware | Project convention |
| Dataset naming | Manual string concatenation | Service-level naming convention | `${project.name}_${category.name}` for standard/code, `${project.name}_${version_label}` for document versions (existing pattern) |

## Common Pitfalls

### Pitfall 1: Existing Categories Have No Type
**What goes wrong:** After migration, existing `document_categories` rows have no `category_type` value, causing the new tab-filtered queries to show all categories under "Documents" or none at all.
**Why it happens:** The ALTER migration sets a DEFAULT but the FE might not handle the transition.
**How to avoid:** Migration sets `DEFAULT 'documents'` so all existing categories are treated as document categories. Verify FE filtering logic handles this correctly.
**Warning signs:** After migration, categories appear in wrong tab or disappear.

### Pitfall 2: Dataset Deletion Cascade on Category Delete
**What goes wrong:** Deleting a Standard or Code category should also soft-delete the auto-created dataset. Currently `deleteCategory` only deletes the category row (DB cascade handles versions/files but not the dataset).
**Why it happens:** The existing `deleteCategory` has no dataset cleanup logic because Documents categories don't own a single dataset.
**How to avoid:** Add dataset cleanup logic in `deleteCategory` that checks `category.dataset_id` before deletion.
**Warning signs:** Orphaned datasets after category deletion.

### Pitfall 3: FE Project Type Mismatch
**What goes wrong:** The FE `Project` type (in `projectApi.ts`) includes a `category: ProjectCategory` field ('office' | 'datasync' | 'source_code') that doesn't exist in the BE `Project` type or the `projects` DB table. The `CreateProjectModal` uses this for step 1 category selection.
**Why it happens:** The FE has a concept of project-level categories that was added independently of the DB schema.
**How to avoid:** Since D-01 says category types are per-category (not per-project), the project-level `category` field on the FE can be removed or kept for backward compatibility. The `CreateProjectModal` no longer needs step 1 category selection -- projects are type-agnostic containers.
**Warning signs:** TypeScript errors when removing the category step from CreateProjectModal.

### Pitfall 4: N+1 Queries When Listing Categories by Type
**What goes wrong:** Loading all three tabs' data separately creates 3 separate API calls.
**Why it happens:** Each tab filters by `category_type`, requiring 3 `GET /categories?type=X` calls.
**How to avoid:** Fetch all categories once in `ProjectDetailPage`, then filter client-side by `category_type`. The existing pattern already fetches all categories in the initial load.
**Warning signs:** Slow detail page load, visible loading spinners per tab.

### Pitfall 5: Version Creation Without Project Context
**What goes wrong:** The `createVersion` service method needs the project ID to build the dataset name and copy parser defaults, but it receives only the category ID.
**Why it happens:** The method already handles this by looking up the category to get `project_id`, then looking up the project. This pattern is correct but fragile.
**How to avoid:** Continue passing `project_id` in the version creation payload (already done in the current implementation).
**Warning signs:** "Project not found" errors during version creation.

### Pitfall 6: i18n Key Sprawl
**What goes wrong:** Adding 3 new tabs, category type labels, code-specific UI strings, and settings sidebar text in 3 locales leads to missed translations.
**Why it happens:** Easy to add en.json keys and forget vi.json/ja.json.
**How to avoid:** Create all i18n keys in a single task that touches all 3 locale files. Use grep to verify key parity across files.
**Warning signs:** UI showing raw i18n keys instead of translated text.

## Code Examples

### Migration: Add category_type column
```typescript
// Source: Based on existing migration patterns in 20260312000000_initial_schema.ts
export async function up(knex: Knex): Promise<void> {
  // Add category_type discriminator to document_categories
  await knex.schema.alterTable('document_categories', (table) => {
    // Type discriminator: documents (versioned), standard (single dataset), code (code parser)
    table.text('category_type').notNullable().defaultTo('documents')
    // Direct dataset reference for standard/code categories (no versioning)
    table.text('dataset_id').nullable()
    table.index('category_type')
  })

  // Add foreign key for dataset_id (separate statement for clarity)
  await knex.schema.alterTable('document_categories', (table) => {
    table.foreign('dataset_id').references('datasets.id').onDelete('SET NULL')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('document_categories', (table) => {
    table.dropForeign(['dataset_id'])
    table.dropColumn('dataset_id')
    table.dropColumn('category_type')
  })
}
```

### FE: Category Type Filtering
```typescript
// In ProjectDetailPage.tsx - fetch once, filter client-side
const allCategories = await getDocumentCategories(projectId)

// Filter by type for each tab
const documentCategories = allCategories.filter(c => c.category_type === 'documents')
const standardCategories = allCategories.filter(c => c.category_type === 'standard')
const codeCategories = allCategories.filter(c => c.category_type === 'code')
```

### BE: Updated Zod Schema
```typescript
// In projects.schemas.ts
export const createCategorySchema = z.object({
  name: z.string().min(1, 'Category name is required').max(255),
  description: z.string().max(2000).optional(),
  sort_order: z.number().int().min(0).optional(),
  category_type: z.enum(['documents', 'standard', 'code']).default('documents'),
  dataset_config: z.record(z.unknown()).optional(),
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 7-tab project detail (docs, chat, search, members, datasets, activity, settings) | 3 category tabs + settings sidebar | This phase | Simplifies UX, separates concerns |
| Project-level category (office/datasync/source_code) | Category-level type (documents/standard/code) | This phase | Categories within a project can be mixed types |
| Chat/Search managed within project | Chat/Search as separate top-level features | This phase | Decouples project scope from assistant config |
| Single category type (documents only) | Three category types with different behaviors | This phase | Enables Standard (single dataset) and Code (code parser) workflows |

## Open Questions

1. **Git sync architecture for Code categories**
   - What we know: D-08 says git sync is optional, manual upload is primary
   - What's unclear: Polling vs webhook for git repo sync, how to store git credentials
   - Recommendation: Defer git sync to a separate phase/task. This phase focuses on code category creation + manual upload + code parser. The existing `project_sync_configs` table can be reused later.

2. **Version selection in chat/search assistant config**
   - What we know: D-07 says chat/search can query specific versions or all versions
   - What's unclear: How the chat/search creation UI exposes version selection (since chat/search tabs are removed from project detail)
   - Recommendation: This is a cross-feature concern. The existing KnowledgeBasePicker component can be extended to group datasets by project/category/version. Defer detailed UX to when chat/search features are updated.

3. **Project-level `category` field cleanup**
   - What we know: FE has `ProjectCategory = 'office' | 'datasync' | 'source_code'` but BE projects table has no such column
   - What's unclear: Whether any other features depend on the project-level category concept
   - Recommendation: Remove the FE project-level category concept. Projects become type-agnostic containers. The `CategoryFilterTabs` component on the list page can be removed or repurposed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (BE: node env, FE: jsdom env) |
| Config file | `be/vitest.config.ts`, `fe/vitest.config.ts` |
| Quick run command | `npm run test -w be -- --run --reporter=verbose` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01 | Category type filtering (documents/standard/code) | unit | `npm run test -w be -- --run tests/projects/project-category.service.test.ts` | Exists (needs update) |
| D-02 | Dataset auto-creation by category type | unit | `npm run test -w be -- --run tests/projects/project-category.service.test.ts` | Exists (needs update) |
| D-03 | Parser defaults per type | unit | `npm run test -w be -- --run tests/projects/project-category.service.test.ts` | Exists (needs update) |
| D-04 | Project list simplified (create + navigate only) | unit | `npm run test -w fe -- --run tests/features/projects/` | Partial (needs update) |
| D-05 | Detail page 3 tabs + settings | unit | `npm run test -w fe -- --run tests/features/projects/` | Needs new tests |
| D-06 | Version list + create in Documents tab | unit | Already covered by existing DocumentsTab tests | Exists |
| D-07 | Versions stay active | unit | `npm run test -w be -- --run tests/projects/project-category.service.test.ts` | Exists |
| Schema | createCategorySchema with category_type | unit | `npm run test -w be -- --run tests/projects/projects.schemas.test.ts` | Exists (needs update) |
| Migration | category_type column added | integration | `npm run db:migrate` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -w be -- --run tests/projects/` and `npm run test -w fe -- --run tests/features/projects/`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Update `be/tests/projects/project-category.service.test.ts` -- add tests for type-discriminated category creation
- [ ] Update `be/tests/projects/projects.schemas.test.ts` -- add category_type enum validation
- [ ] Add `fe/tests/features/projects/ProjectDetailPage.test.tsx` -- test 3-tab layout rendering
- [ ] Add `fe/tests/features/projects/StandardTab.test.tsx` -- test standard category behavior
- [ ] Add `fe/tests/features/projects/CodeTab.test.tsx` -- test code category behavior

## Sources

### Primary (HIGH confidence)
- Project codebase: `be/src/modules/projects/` -- full existing implementation reviewed
- Project codebase: `be/src/shared/db/migrations/20260312000000_initial_schema.ts` -- current DB schema
- Project codebase: `advance-rag/rag/app/code.py` -- existing code parser with tree-sitter (20+ languages)
- Project codebase: `fe/src/features/projects/` -- full existing FE feature reviewed
- CONTEXT.md: User decisions D-01 through D-09

### Secondary (MEDIUM confidence)
- `be/CLAUDE.md`, `fe/CLAUDE.md` -- project conventions and patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing libraries
- Architecture: HIGH - extending existing patterns with minimal structural changes
- Pitfalls: HIGH - identified from direct codebase inspection of current implementation
- Migration strategy: HIGH - simple ALTER table, well-understood pattern

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- internal refactor, no external dependency changes)
