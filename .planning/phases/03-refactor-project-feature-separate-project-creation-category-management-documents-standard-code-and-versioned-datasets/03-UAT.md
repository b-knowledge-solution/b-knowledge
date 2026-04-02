---
status: testing
phase: 03-refactor-project-feature
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md]
started: 2026-03-24T13:00:00Z
updated: 2026-03-24T13:00:00Z
---

## Current Test

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server. Run `npm run db:migrate` then `npm run dev`. Server boots without errors, migration 20260324120000_add_category_type completes, and the app loads at localhost:5173.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Run `npm run db:migrate` then `npm run dev`. Server boots without errors, migration 20260324120000_add_category_type completes, and the app loads at localhost:5173.
result: [pending]

### 2. Project List Page — Create and Navigate
expected: Navigate to the Projects page. The list shows project cards in a grid layout. Clicking a card navigates to the project detail page. There is a create button but no inline editing or category management on the list page.
result: [pending]

### 3. Create New Project
expected: Click the create project button. A simple modal appears (no category picker in the modal). Enter a project name and submit. The project is created and you're navigated to its detail page.
result: [pending]

### 4. Project Detail Page — 3 Category Tabs
expected: On the project detail page, you see 3 category tabs: Documents, Standard, and Code. Clicking each tab switches the content area. The active tab is visually highlighted. The tab state persists in the URL.
result: [pending]

### 5. Category Sidebar
expected: A sidebar (CategorySidebar) shows categories for the currently active tab. You can create new categories via a modal. The category modal auto-sets the category type based on which tab is active.
result: [pending]

### 6. Project Settings Sheet
expected: There is a settings button/gear icon that opens a ProjectSettingsSheet (slide-out panel). It shows project-level settings like name, description, and default parser configuration.
result: [pending]

### 7. Standard Category — Auto Dataset Creation
expected: When creating a category under the Standard tab, a linked dataset is automatically created in the background (named `{projectName}_{categoryName}`). The Standard category view shows a document list panel for uploading/managing documents.
result: [pending]

### 8. Code Category — Parser and View
expected: When creating a category under the Code tab, a linked dataset is auto-created with parser forced to 'code'. The Code category view shows a document list panel plus a git sync placeholder section (disabled/greyed out).
result: [pending]

### 9. Documents Tab — Version Management
expected: Under the Documents tab, selecting a category shows a VersionList with VersionCard components. Each version card is expandable and shows version details.
result: [pending]

### 10. Category Deletion — Dataset Cleanup
expected: Deleting a standard or code category soft-deletes the linked dataset (sets status to inactive) rather than hard-deleting it. The category disappears from the sidebar.
result: [pending]

### 11. i18n — Language Switching
expected: Switch the app language to Vietnamese (vi) or Japanese (ja). All project-related UI text (tab labels, button text, form labels, sidebar headers) appears translated. No untranslated keys or romanized placeholders are visible.
result: [pending]

### 12. TypeScript Build Check
expected: Run `npm run build` from the repo root. The build completes without TypeScript errors related to project/category types (DocumentCategory, DocumentCategoryType, category_type, dataset_id).
result: [pending]

## Summary

total: 12
passed: 0
issues: 0
pending: 12
skipped: 0
blocked: 0

## Gaps

[none yet]
