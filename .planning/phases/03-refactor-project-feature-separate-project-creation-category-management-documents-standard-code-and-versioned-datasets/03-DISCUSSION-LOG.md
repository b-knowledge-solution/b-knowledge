# Phase 3: Refactor project feature - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 03-refactor-project-feature
**Areas discussed:** Category types & behavior, Project list → detail flow, Versioning UX for documents, Code category specifics

---

## Category Types & Behavior

### Q1: Category type selection method

| Option | Description | Selected |
|--------|-------------|----------|
| Type picker on create | User picks documents/standard/code when creating. Type fixed after creation. | |
| Pre-defined tabs per type | Project detail has 3 fixed sections. User creates categories within each. Type implicit. | ✓ |
| Single list, type as property | All categories in one flat list. Type is dropdown field. Can be changed. | |

**User's choice:** Pre-defined tabs per type
**Notes:** User clarified: one project can create multiple categories within each tab/type

### Q2: Dataset creation timing

| Option | Description | Selected |
|--------|-------------|----------|
| On category creation | Standard/Code: dataset created immediately. Documents: dataset per version. | ✓ |
| On first file upload | Lazy-created when first file uploaded. Documents still per version. | |
| Manual trigger | User explicitly clicks 'Create Dataset'. More control but more friction. | |

**User's choice:** On category creation (Recommended)

### Q3: Parser config per type

| Option | Description | Selected |
|--------|-------------|----------|
| Type-specific defaults | Documents/Standard inherit project defaults. Code forces code parser. Users can override. | ✓ |
| All inherit project defaults | Same config for all 3 types. No type-specific behavior. | |
| Each category has full config | Every category has own embedding model, chunk method, parser config. No inheritance. | |

**User's choice:** Type-specific defaults (Recommended)

---

## Project List → Detail Flow

### Q4: Project list page actions

| Option | Description | Selected |
|--------|-------------|----------|
| Create only + navigate | Cards with name/description/status. Only 'Create Project' button. Click → detail. | ✓ |
| Create + basic actions | Create, delete, archive on list. Edit/permissions on detail. | |
| Minimal list + quick actions | Compact table with inline actions. Detail for everything else. | |

**User's choice:** Create only + navigate (Recommended)

### Q5: Project detail page organization

| Option | Description | Selected |
|--------|-------------|----------|
| Category tabs + settings sidebar | 3 category tabs (Documents/Standard/Code). Settings in sidebar. Chat/Search removed. | ✓ |
| Keep current 7-tab layout | Keep existing tabs, refactor Documents tab into 3 sub-tabs. | |
| Simplified: categories + settings | Only Categories + Settings. Remove Chat/Search/Activity/Datasets tabs. | |

**User's choice:** Category tabs + settings sidebar
**Notes:** Chat and Search features fully separated from project detail — become independent top-level features

---

## Versioning UX for Documents

### Q6: Version management pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Version list + create button | Shows version list (v1, v2, v3). 'New Version' creates version + dataset. | ✓ |
| Active version + history | One active version shown. Old versions in 'Version History' drawer. | |
| Git-like branching | Versions can branch from existing. Parallel document sets. | |

**User's choice:** Version list + create button (Recommended)

### Q7: Old version behavior

| Option | Description | Selected |
|--------|-------------|----------|
| All stay active | Old versions remain active/searchable. Manual archive/delete available. | ✓ |
| Auto-archive previous | New version auto-archives previous. Only latest active by default. | |
| Keep all, flag latest | All active but latest gets 'current' badge. No auto-archiving. | |

**User's choice:** All stay active (Recommended)

---

## Code Category Specifics

### Q8: What makes Code special

| Option | Description | Selected |
|--------|-------------|----------|
| Code-aware parsing + file filters | Code parser, code file types only, syntax previews. Single dataset. | |
| Git repo sync | Syncs from Git repo. Auto-pulls on schedule. Language-aware chunking. | |
| Code parsing + optional git sync | Code-aware parsing primary. Git sync optional add-on. Manual upload also works. | ✓ |

**User's choice:** Code parsing + optional git sync

### Q9: Code parser depth

| Option | Description | Selected |
|--------|-------------|----------|
| Language-aware chunking | Detect language, chunk by functions/classes. Uses existing parsers. Major languages. | ✓ |
| AST-based deep parsing | Full AST. Extract signatures, docstrings, imports, call graphs. Much more complex. | |
| Simple file-level chunking | Treat as text. Chunk by lines/tokens. No language awareness. | |

**User's choice:** Language-aware chunking (Recommended)

---

## Claude's Discretion

- Database migration strategy
- Component decomposition within category tabs
- Handling existing project_chats/project_searches data
- Settings sidebar vs tab implementation
- Git sync architecture for code categories
- Version selection exposure in chat/search config

## Deferred Ideas

None — discussion stayed within phase scope
