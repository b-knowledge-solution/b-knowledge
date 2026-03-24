# Per-Document Parser Change — Detail Design

> **Feature**: GAP-4 | **Module**: RAG | **Status**: Implemented

## 1. Overview

Users can change the parser type for an individual document that has already been parsed. This is a destructive operation: all existing chunks are deleted, the parser configuration is updated, and the document is re-queued for parsing with the new parser. This allows users to experiment with different parser types without re-uploading documents.

---

## 2. Use Cases

| Actor | Action | Outcome |
|-------|--------|---------|
| User | Changes PDF parser from Naive to Paper | Existing chunks deleted, document re-parsed with academic paper parser |
| Knowledge Manager | Corrects parser selection mistake | Document re-parsed with correct parser |
| Content Curator | Tries Manual parser on a DOCX | Compares chunking quality vs previous parser |
| User | Attempts change during parsing | Receives 409 Conflict error |

---

## 3. Design

### 3.1 Sequence Diagram

```
User                  Frontend              Backend                 OpenSearch        Redis/Worker
 │                      │                      │                       │                  │
 │ Click "Change Parser"│                      │                       │                  │
 │─────────────────────▶│                      │                       │                  │
 │                      │ Show ChangeParserDialog                      │                  │
 │                      │◀─────────────────────│                       │                  │
 │ Select new parser    │                      │                       │                  │
 │ + config, Confirm    │                      │                       │                  │
 │─────────────────────▶│                      │                       │                  │
 │                      │ PUT /documents/:id/  │                       │                  │
 │                      │     parser           │                       │                  │
 │                      │─────────────────────▶│                       │                  │
 │                      │                      │ 1. Check status ≠     │                  │
 │                      │                      │    RUNNING (else 409) │                  │
 │                      │                      │                       │                  │
 │                      │                      │ 2. Delete chunks      │                  │
 │                      │                      │───────────────────────▶│                  │
 │                      │                      │   delete_by_query     │                  │
 │                      │                      │◀───────────────────────│                  │
 │                      │                      │                       │                  │
 │                      │                      │ 3. Decrement dataset  │                  │
 │                      │                      │    chunk/token counts  │                  │
 │                      │                      │                       │                  │
 │                      │                      │ 4. Update document    │                  │
 │                      │                      │    parser_id, config  │                  │
 │                      │                      │    reset progress     │                  │
 │                      │                      │                       │                  │
 │                      │                      │ 5. Queue re-parse     │                  │
 │                      │                      │────────────────────────────────────────▶│
 │                      │                      │                       │                  │
 │                      │ 200 OK               │                       │                  │
 │                      │◀─────────────────────│                       │                  │
 │ UI refreshes,        │                      │                       │                  │
 │ shows parsing status │                      │                       │                  │
 │◀─────────────────────│                      │                       │                  │
```

### 3.2 Available Parser Types

| Parser ID | Display Name | Applicable Formats |
|-----------|--------------|--------------------|
| `naive` | General | PDF, DOCX, TXT, MD, HTML, Excel, JSON, EPUB |
| `book` | Book | PDF, DOCX, TXT, HTML |
| `paper` | Paper | PDF |
| `manual` | Manual | PDF, DOCX |
| `laws` | Laws | DOCX, PDF, TXT, HTML |
| `presentation` | Presentation | PPTX, PPT, PDF |
| `qa` | Q&A | Excel, CSV, TXT, PDF, MD, DOCX |
| `table` | Table | Excel, CSV, TXT |
| `resume` | Resume | PDF, DOCX |
| `picture` | Picture | Images, Video |
| `audio` | Audio | WAV, MP3, AAC, FLAC, OGG |
| `one` | One (Whole Doc) | PDF, DOCX, Excel, TXT, MD, HTML |
| `email` | Email | EML |

---

## 4. Business Logic

### 4.1 Pre-Conditions

| Check | Condition | Error |
|-------|-----------|-------|
| Document exists | Document found in database | 404 Not Found |
| Document not parsing | `status ≠ RUNNING` | 409 Conflict |
| Document belongs to dataset | `document.dataset_id === datasetId` | 403 Forbidden |

### 4.2 Parser Change Steps

1. **Validate** parser_id against `ParserType` enum
2. **Guard**: Check document status is DONE or FAIL (not RUNNING/UNSTART)
3. **Delete chunks**: OpenSearch `delete_by_query` where `doc_id = document.id`
4. **Decrement counts**: Subtract deleted chunk count and token count from dataset totals
5. **Update document**:
   - `parser_id` = new parser type
   - `parser_config` = new config (or default for parser type)
   - `progress` = 0
   - `run` = 'UNSTART'
   - `chunk_num` = 0
   - `token_num` = 0
6. **Queue task**: Push re-parse message to Redis task queue for advance-rag worker

### 4.3 Parser-Specific Config

Some parsers accept additional configuration:

```json
// Naive parser config example
{
  "chunk_token_num": 512,
  "delimiter": "\n!?。；！？",
  "layout_recognize": "DeepDOC"
}

// Table parser config example
{
  "html4excel": false
}
```

The `ChangeParserDialog` renders parser-specific config fields via `ParserSettingsFields` component when applicable.

---

## 5. Frontend Components

### 5.1 ChangeParserDialog

| Element | Details |
|---------|---------|
| Current parser | Read-only badge showing current parser name |
| New parser | Dropdown selector with 13 parser options |
| Config fields | Dynamic fields based on selected parser (via `ParserSettingsFields`) |
| Warning | Destructive alert: "Changing the parser will delete all existing chunks and re-parse the document." |
| Cancel | Closes dialog, no changes |
| Confirm | Submits parser change, shows loading state |

### 5.2 Document Table Integration

- "Change Parser" option appears in the per-row action dropdown menu
- Only visible when document status is DONE or FAIL
- Hidden during active parsing (RUNNING status)

---

## 6. API Reference

```
PUT /api/v1/datasets/:id/documents/:docId/parser
Content-Type: application/json

{
  "parser_id": "paper",
  "parser_config": {
    "chunk_token_num": 256
  }
}

Response 200:
{
  "id": "doc-123",
  "name": "research-paper.pdf",
  "parser_id": "paper",
  "parser_config": { "chunk_token_num": 256 },
  "run": "UNSTART",
  "progress": 0,
  "chunk_num": 0,
  "token_num": 0
}

Response 409 (document is parsing):
{
  "error": "Document is currently being parsed"
}
```

---

## 7. Error Handling

| Scenario | Response | UI Behavior |
|----------|----------|-------------|
| Document not found | 404 | Toast error |
| Document currently parsing | 409 | Toast: "Wait for parsing to complete" |
| Invalid parser_id | 400 | Validation error |
| OpenSearch delete failure | 503 | Toast error, document not updated |
| Worker queue failure | 503 | Document updated but not queued, manual retry needed |

---

## 8. Related Documents

- [Document Parsing](/detail-design/dataset-document/document-parsing-detail)
- [RAG Pipeline Parsers](/detail-design/rag-pipeline/overview)
- [Document Upload](/detail-design/dataset-document/document-upload-detail)
