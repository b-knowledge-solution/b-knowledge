---
status: diagnosed
phase: 03-document-management
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md]
started: 2026-03-19T04:00:00Z
updated: 2026-03-19T04:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Upload New Version from Document Table
expected: In Data Studio, navigate to a dataset's document list. Click the kebab menu (three dots) on any document row. You should see "Upload New Version" in the dropdown. Clicking it opens a dialog with: file drop zone, change summary text field, and auto-parse toggle switch.
result: pass

### 2. Version Badge on Dataset Card
expected: After uploading a new version (which creates a new dataset), the dataset list should show the new version dataset with a "v2" badge (or v{N}). The original dataset should not have a version badge. The new version dataset card should display the change summary text you entered.
result: issue
reported: "version may be base on semantic versioning or in custome"
severity: major

### 3. Version Metadata in Dataset Overview
expected: Open a version dataset's detail page. The overview tab should show a "Version Info" section with: version number, who created it, when it was created, and the change summary. Non-version datasets should show "Original version" or similar.
result: pass

### 4. Chunk Detail Page (Split View)
expected: In a dataset's document list, click a document name. You should navigate to a chunk detail page at /datasets/:id/documents/:docId/chunks. The page shows a split view: document preview on the left, chunk list on the right. The toolbar shows chunk count with search, sort, and "Add Chunk" button.
result: pass

### 5. Chunk CRUD in Detail Page
expected: On the chunk detail page: you can click a chunk to edit its text inline, delete a chunk (with confirmation), and add a new chunk via the "Add Chunk" button. Changes should persist after page refresh.
result: pass

### 6. Chat Citation Document Drawer
expected: Chat with an assistant that has a dataset with documents. When the AI responds with citations (fig. references), clicking a citation should open a side drawer showing the document with the cited content highlighted.
result: pass

### 7. Search Result Document Dialog
expected: In a search app, perform a search. When results appear, clicking on a result should open a dialog showing the source document with the relevant content highlighted.
result: pass

### 8. Version-Aware Search Ranking
expected: Upload a document, then upload a new version of it with different content. Search for content that appears in both versions. The newer version's results should appear ABOVE the older version's results in search rankings.
result: pass

### 9. Parser Auto-Extraction Toggles
expected: When creating or editing a dataset, the parser settings should show three toggle switches: "Auto Keywords" (with count input when enabled), "Auto Questions" (with count input), and "Enable Metadata" (with a schema builder when enabled). All toggles should be OFF by default.
result: pass

### 10. Metadata Schema Builder
expected: In parser settings, enable the "Enable Metadata" toggle. A schema builder should appear where you can add fields with name and type (text, number, date, enum). Adding multiple fields and saving should persist the schema configuration.
result: pass

### 11. Custom Metadata Tags on Documents
expected: Open a document's metadata dialog. You should be able to add free-form key-value tags (e.g., department=clinical, sdlc_phase=design). Tags should save and persist when you reopen the dialog.
result: pass

### 12. Bulk Edit Tags Across Documents
expected: In the document table, select multiple documents via checkboxes. A bulk action bar should appear with "Edit Tags" button. Clicking it opens the metadata dialog in bulk mode where you can add/remove tags across all selected documents at once.
result: pass

### 13. Tag Filter Chips in Search
expected: In the search page, below the search bar, tag filter chips should appear showing available tag keys discovered from your datasets. Clicking a chip shows a dropdown of values. Selecting a value filters search results to only show documents matching that tag.
result: pass

### 14. Cron Parsing Scheduler Settings
expected: Navigate to System Tools/Settings (admin only). You should see a "Parsing Scheduler" section where you can enable/disable scheduled parsing, set a cron expression or pick from presets (e.g., "Daily at midnight", "Every 6 hours"). Saving should persist the schedule.
result: issue
reported: "is cron parsing for whole system, just queue 1st in 1 out"
severity: major

## Summary

total: 14
passed: 12
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Version badge shows auto-incrementing v{N} based on integer version_number"
  status: failed
  reason: "User reported: version may be base on semantic versioning or in custome"
  severity: major
  test: 2
  root_cause: "version_number is integer-only across DB, service, API schema, and UI. No version_label text column exists. The integer serves dual duty as pagerank boost AND display label. Need separate version_label column for custom/semver strings while keeping integer version_number for pagerank."
  artifacts:
    - path: "be/src/shared/db/migrations/20260319000000_add_dataset_versioning.ts"
      issue: "version_number is integer, no version_label column"
    - path: "be/src/modules/rag/services/rag.service.ts"
      issue: "createVersionDataset has no versionLabel parameter"
    - path: "be/src/modules/rag/schemas/rag.schemas.ts"
      issue: "createVersionSchema missing version_label field"
    - path: "fe/src/features/datasets/components/UploadNewVersionDialog.tsx"
      issue: "No version label input field"
    - path: "fe/src/features/datasets/components/VersionBadge.tsx"
      issue: "Prop typed as number only, renders v{N}"
  missing:
    - "Add version_label text column via new migration"
    - "Accept versionLabel in createVersionDataset service and API schema"
    - "Add version label input to UploadNewVersionDialog"
    - "VersionBadge renders versionLabel when present, falls back to v{N}"
  debug_session: ""

- truth: "Cron parsing scheduler processes queued documents on schedule"
  status: failed
  reason: "User reported: is cron parsing for whole system, just queue 1st in 1 out"
  severity: major
  test: 14
  root_cause: "runParsingSchedule() queries all pending docs across all datasets at once and pushes up to 50 into Redis Stream simultaneously. Python executor processes up to 5 concurrently via semaphore. No dataset-level sequencing, no FIFO gate, no per-dataset ordering."
  artifacts:
    - path: "be/src/shared/services/cron.service.ts"
      issue: "runParsingSchedule queries all datasets at once, no ordering"
    - path: "advance-rag/rag/svr/task_executor.py"
      issue: "MAX_CONCURRENT_TASKS=5 allows parallel processing across datasets"
  missing:
    - "Dataset-aware sequencing: group by kb_id, enqueue one dataset batch at a time"
    - "FIFO gate: process one dataset's documents before starting next"
    - "Replace global LIMIT 50 with per-dataset limit"
  debug_session: ""
