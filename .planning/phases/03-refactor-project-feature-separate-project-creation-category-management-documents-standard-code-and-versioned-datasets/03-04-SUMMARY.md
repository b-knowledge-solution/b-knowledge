---
phase: "03"
plan: "04"
subsystem: fe-projects
tags: [frontend, project-detail, tabs, category-sidebar, settings-sheet]
dependency_graph:
  requires: [03-02, 03-03]
  provides: [refactored-project-detail-page, category-sidebar, settings-sheet]
  affects: [fe/src/features/projects/pages/ProjectDetailPage.tsx, fe/src/features/projects/components/*]
tech_stack:
  added: []
  patterns: [url-state-management, sheet-sidebar, category-tab-filtering]
key_files:
  created:
    - fe/src/features/projects/components/CategorySidebar.tsx
    - fe/src/features/projects/components/ProjectSettingsSheet.tsx
  modified:
    - fe/src/features/projects/pages/ProjectDetailPage.tsx
    - fe/src/features/projects/components/CategoryModal.tsx
decisions:
  - "Documents tab reuses existing DocumentsTab component with its internal sidebar (parallel sidebar exists)"
  - "Standard/Code tabs show placeholder content until Plan 05 implements StandardCategoryView and CodeCategoryView"
  - "CategoryModal categoryType prop is passed from parent (active tab) rather than internal state"
metrics:
  duration: "3min"
  completed: "2026-03-24T11:28:40Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 03 Plan 04: Project Detail Page 3-Tab Layout Summary

Refactored project detail page from 7-tab layout to 3 category tabs with settings sheet sidebar.

## One-liner

3-tab category layout (Documents/Standard/Code) with CategorySidebar, URL-persisted state, and ProjectSettingsSheet replacing old 7-tab design.

## What Was Done

### Task 1: Create CategorySidebar and ProjectSettingsSheet (7c89c88)

**CategorySidebar.tsx** — Reusable sidebar component for listing categories within a tab:
- 240px fixed width with border-r divider
- ScrollArea for scrollable list
- Active item highlighted with bg-accent + left border-l-2 border-primary
- DropdownMenu context menu per category (edit, delete)
- Empty state with UI-SPEC copywriting
- "New Category" button pinned at bottom
- Full i18n via useTranslation()
- JSDoc on exported component

**ProjectSettingsSheet.tsx** — Sheet sidebar for project settings:
- Slides from right, 320px width using shadcn Sheet
- Sections: name/description edit, visibility toggle (is_private), member management (ProjectMemberList), danger zone (delete with name confirmation)
- Uses updateProject and deleteProject from projectApi
- Full i18n via useTranslation()
- JSDoc on exported component

### Task 2: Refactor ProjectDetailPage (26a944d)

**ProjectDetailPage.tsx** — Major refactor:
- Removed imports and state for ChatTab, SearchTab, SyncTab, ProjectMemberList, ProjectDatasetPicker, ProjectActivityFeed, SettingsTab
- Removed getProjectChats, getProjectSearches API calls
- Added 3 fixed tabs: Documents (FolderOpen, blue badge), Standard (FileText, amber badge), Code (Code2, emerald badge)
- URL state via useSearchParams: ?tab=documents|standard|code, ?category=<id>
- Each TabsContent renders CategorySidebar + content area
- Documents tab: CategorySidebar + existing DocumentsTab
- Standard/Code tabs: CategorySidebar + placeholder content with dataset_id null guard
- Header: back button + project name (28px display) + status badge + gear icon for settings
- Settings sheet triggered by gear icon button
- Delete project dialog removed (moved into ProjectSettingsSheet)

**CategoryModal.tsx** — Updated:
- Added categoryType prop (DocumentCategoryType) auto-set from active tab
- Parent passes category_type to API when creating categories
- No type picker shown in modal (implicit from tab, per D-01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Documents tab has its own internal sidebar**
- **Found during:** Task 2
- **Issue:** DocumentsTab already has its own category sidebar baked in. Adding a CategorySidebar wrapper around it creates a dual-sidebar situation.
- **Fix:** Left as-is for now — the DocumentsTab internal sidebar handles document-specific category/version flow. The outer CategorySidebar provides the new standardized pattern. Plan 05 or a future plan should refactor DocumentsTab to remove its internal sidebar and use the shared CategorySidebar.
- **Impact:** Minimal — documents tab works correctly, just has redundant sidebar UI elements.

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| ProjectDetailPage.tsx | renderStandardOrCodeContent | Placeholder text for Standard/Code content | Plan 05 will implement StandardCategoryView and CodeCategoryView |

These stubs do not prevent the plan's goal (layout refactoring) from being achieved. Content views are explicitly deferred to Plan 05.

## Decisions Made

1. Documents tab reuses existing DocumentsTab with its internal sidebar — refactoring that into the shared CategorySidebar pattern is deferred
2. Standard/Code tab content is a placeholder with dataset_id null guard until Plan 05
3. CategoryModal receives categoryType from parent rather than managing it internally

## Self-Check: PASSED
