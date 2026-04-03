# Document Upload → Converter → Parse Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three gaps in the document upload pipeline: (1) add per-upload parser selection, (2) create the missing `converter-queue.service.ts` that writes converter jobs to Redis, and (3) auto-trigger parsing after upload/conversion completes.

**Architecture:** The upload endpoints accept an optional `parser_id` override. After file upload, Office files get a converter job queued to Redis (consumed by the Python converter worker). Non-Office files skip conversion. Once all files are ready, parsing is auto-triggered via `ragRedisService.queueParseInit()`. A new `ConverterQueueService` manages all Redis key creation matching the converter worker's expected key layout.

**Tech Stack:** Node.js/Express/TypeScript backend, Redis (node-redis), existing RAG module services, Python converter worker (read-only — no changes needed).

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `be/src/modules/rag/services/converter-queue.service.ts` | Redis job creation for converter worker (writes `converter:vjob:*`, `converter:file:*` keys) |
| **Modify** | `be/src/modules/rag/controllers/rag.controller.ts` | Accept optional `parser_id` on upload; auto-trigger parse for non-Office files; create converter jobs for Office files |
| **Modify** | `be/src/modules/rag/services/rag-document.service.ts` | Add helper to check if a file suffix is an Office type |
| **Modify** | `be/src/modules/rag/index.ts` | Export the new `converterQueueService` |
| **Modify** | `be/src/modules/projects/controllers/projects.controller.ts` | Wire converter queue + auto-parse into project version upload |

---

## Chunk 1: Converter Queue Service

### Task 1: Create converter-queue.service.ts

This is the critical missing piece. The Python converter worker (converter/src/worker.py) polls Redis for jobs with status 'converting' and processes pending files. This service creates those Redis structures.

**Files:**
- Create: `be/src/modules/rag/services/converter-queue.service.ts`

- [ ] **Step 1: Create the converter queue service file**

The service must write to the same Redis key layout that worker.py reads. Key constants must match exactly.

- [ ] **Step 2: Export from barrel file**

In `be/src/modules/rag/index.ts`, add the converterQueueService export.

- [ ] **Step 3: Verify build compiles**

Run: `npm run build -w be`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

Stage and commit the new service file and updated barrel export.

---

### Task 2: Add Office file detection helper

The upload controller needs to know which files require Office-to-PDF conversion vs. which can go directly to parsing. Add a utility method to rag-document.service.ts.

**Files:**
- Modify: `be/src/modules/rag/services/rag-document.service.ts`

- [ ] **Step 1: Add the isOfficeFile static method**

Add a static set of OFFICE_EXTENSIONS and isOfficeFile() method to the RagDocumentService class. Extensions must match converter/src/converter.py: doc, docx, docm, xls, xlsx, xlsm, ppt, pptx, pptm.

- [ ] **Step 2: Verify build compiles**

Run: `npm run build -w be`

- [ ] **Step 3: Commit**

---

## Chunk 2: Wire Upload Endpoints

### Task 3: Update RAG uploadDocuments — accept parser_id + auto-trigger

The current uploadDocuments (line 439 of rag.controller.ts) always inherits parser_id from the dataset. Add an optional parser_id from FormData body and auto-trigger parsing.

**Files:**
- Modify: `be/src/modules/rag/controllers/rag.controller.ts` (method uploadDocuments)

- [ ] **Step 1: Read optional parser_id from request body**

After dataset validation, read: `const uploadParserId = req.body?.parser_id || dataset.parser_id || 'naive'`

Use this value instead of `dataset.parser_id` when creating documents.

- [ ] **Step 2: Add auto-parse trigger after upload loop**

After incrementing doc_count, loop through results and call ragDocumentService.beginParse() + ragRedisService.queueParseInit() for each document.

- [ ] **Step 3: Verify build compiles**

- [ ] **Step 4: Commit**

---

### Task 4: Update RAG uploadVersionDocuments — converter job + auto-parse

The version upload (line 196 of rag.controller.ts) needs to split Office vs non-Office files, auto-parse non-Office, and create converter jobs for Office files.

**Files:**
- Modify: `be/src/modules/rag/controllers/rag.controller.ts` (method uploadVersionDocuments)

- [ ] **Step 1: Add imports for converterQueueService and RagDocumentService**

- [ ] **Step 2: After the file upload loop, split into Office vs non-Office**

Use RagDocumentService.isOfficeFile(suffix) to classify each uploaded doc. Auto-parse non-Office files. Create a converter job for Office files via converterQueueService.createJob(). Call triggerManualConversion() so the worker picks up immediately.

- [ ] **Step 3: Verify build compiles**

- [ ] **Step 4: Commit**

---

### Task 5: Update Projects uploadVersionDocuments — converter job + auto-parse

The projects module has its own version upload endpoint (projects.controller.ts:458) that also needs the same treatment.

**Files:**
- Modify: `be/src/modules/projects/controllers/projects.controller.ts`

- [ ] **Step 1: Add imports from rag module barrel**

Import converterQueueService from the rag barrel. Import RagDocumentService for isOfficeFile.

- [ ] **Step 2: Accept parser_id and add auto-parse + converter logic**

Same pattern as Task 4: read optional parser_id, split Office vs non-Office after upload, auto-parse non-Office, create converter job for Office files with project/category/version path components.

- [ ] **Step 3: Verify build compiles**

- [ ] **Step 4: Commit**

---

## Chunk 3: Converter Status Endpoint

### Task 6: Add converter job status endpoint

The frontend needs a way to poll converter job progress so it knows when to trigger parsing for converted Office files.

**Files:**
- Modify: `be/src/modules/rag/services/converter-queue.service.ts`
- Modify: `be/src/modules/rag/controllers/rag.controller.ts`
- Modify: `be/src/modules/rag/routes/rag.routes.ts`

- [ ] **Step 1: Add getConverterJobStatus method to controller**

Read job status from Redis via converterQueueService.getJobStatus(). Return id, status, fileCount, completedCount, failedCount.

- [ ] **Step 2: Register the route**

Add: `GET /datasets/:id/converter-jobs/:jobId/status`

- [ ] **Step 3: Verify build compiles**

- [ ] **Step 4: Commit**

---

## Pipeline Flow After Implementation

```
User uploads files (with optional parser_id)
         |
   +-----+-----+
   |            |
 Office      Non-Office
 files        files
   |            |
   v            v
Converter   Auto-parse
 job in     immediately
  Redis     (queueParseInit)
   |
   v
Python converter worker
picks up job (Redis poll)
   |
   v
Office -> PDF conversion
   |
   v
Frontend polls converter
job status endpoint
   |
   v
User triggers parse for
converted documents
```

**Key design decisions:**
- Non-Office files auto-parse immediately on upload (no manual step needed)
- Office files queue a converter job; parsing must be triggered after conversion
- The converter worker is untouched — we only create the Redis structures it already expects
- triggerManualConversion() bypasses the converter's schedule window for immediate processing
