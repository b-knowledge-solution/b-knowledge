# Requirements — v0.1 Document Upload Pipeline

## Functional Requirements

- [x] **REQ-01**: Upload documents with optional parser_id selection
- [x] **REQ-02**: Office files (doc/xls/ppt) create converter job in Redis
- [x] **REQ-03**: Non-Office files auto-parse immediately after upload
- [x] **REQ-04**: Converter worker picks up jobs via Redis polling
- [x] **REQ-05**: Manual trigger bypasses converter schedule window
- [x] **REQ-06**: Converter job status endpoint for progress monitoring
- [x] **REQ-07**: Version document list has parity with dataset detail page
- [x] **REQ-08**: Per-document parse/stop buttons in version list
- [x] **REQ-09**: Inline progress bar during parsing
- [x] **REQ-10**: Process log dialog on status click
- [x] **REQ-11**: Enable/disable toggle per document
- [x] **REQ-12**: Change parser dialog per document
- [x] **REQ-13**: Chunk navigation (clickable document name)
- [x] **REQ-14**: Force Convert Now button in conversion modal
- [x] **REQ-15**: Bulk metadata tag editing
- [x] **REQ-16**: Inline delete per document
- [x] **REQ-17**: Parser badge column showing parser_id
- [x] **REQ-18**: Update date column

## Traceability

| REQ | Component | Status | Notes |
|-----|-----------|--------|-------|
| REQ-01 | BE rag.controller.ts | Complete | Reads parser_id from FormData body |
| REQ-02 | BE converter-queue.service.ts | Complete | Creates Redis hash/set keys |
| REQ-03 | BE rag.controller.ts | Complete | Calls beginParse + queueParseInit |
| REQ-04 | converter/src/worker.py | Complete | Pre-existing, no changes needed |
| REQ-05 | BE converter-queue.service.ts | Complete | Sets converter:manual_trigger=1 |
| REQ-06 | BE rag.controller.ts + routes | Complete | GET /converter-jobs/:jobId/status |
| REQ-07 | FE DocumentListPanel.tsx | Complete | Full rewrite with all columns/actions |
| REQ-08 | FE DocumentListPanel.tsx | Complete | Play/Square icons per row |
| REQ-09 | FE DocumentListPanel.tsx | Complete | Progress component from shadcn/ui |
| REQ-10 | FE DocumentListPanel.tsx | Complete | Reuses ProcessLogDialog from datasets |
| REQ-11 | FE DocumentListPanel.tsx | Complete | Switch component, calls RAG toggle API |
| REQ-12 | FE DocumentListPanel.tsx | Complete | Reuses ChangeParserDialog from datasets |
| REQ-13 | FE DocumentListPanel.tsx | Complete | Navigates to /datasets/{id}/documents/{docId}/chunks |
| REQ-14 | FE ConversionStatusModal.tsx | Complete | Zap icon, calls triggerManualConversion |
| REQ-15 | FE DocumentListPanel.tsx | Complete | Reuses MetadataManageDialog from datasets |
| REQ-16 | FE DocumentListPanel.tsx | Complete | Trash2 icon per row with confirmation |
| REQ-17 | FE DocumentListPanel.tsx | Complete | Badge variant="outline" showing parser_id |
| REQ-18 | FE DocumentListPanel.tsx | Complete | formatDocUpdateDate helper |

## Test Coverage

- 57 backend tests (converter-queue.service.test.ts + document-upload-pipeline.test.ts)
- 0 new TypeScript errors introduced (5 pre-existing)
