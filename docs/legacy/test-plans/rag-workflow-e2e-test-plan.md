# RAG Workflow — E2E Test Plan

**Document ID:** TP-RAG-001
**Version:** 1.0
**Date:** 2026-03-20
**Classification:** Software Integration Testing (IEC 62304 §5.6)

---

## 1. Purpose

This document defines manual and automated End-to-End (E2E) test cases for the complete Retrieval-Augmented Generation (RAG) workflow in B-Knowledge. Tests validate the full pipeline from document ingestion through search and chat with citations.

---

## 2. RAG Pipeline Architecture

```
Document Upload → S3 Storage → Parse Trigger → RAG Worker
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │  Document Parser   │
    │                                    │  (naive/deepdoc)   │
    │                                    └─────────┬─────────┘
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │  Chunking Engine   │
    │                                    │  (token-based)     │
    │                                    └─────────┬─────────┘
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │ Embedding Model    │
    │                                    │ (vector generation)│
    │                                    └─────────┬─────────┘
    │                                              │
    │                                    ┌─────────┴─────────┐
    │                                    │ OpenSearch Index   │
    │                                    │ (chunks + vectors) │
    │                                    └─────────┬─────────┘
    │                                              │
    ├──────── Search App ─────────────────────────►│
    │                                              │
    └──────── Chat Assistant ──► LLM ──────────►Response + Citations
```

---

## 3. Automated E2E Test Suites

### 3.1 RAG Full Pipeline (`rag-full-pipeline.spec.ts`)

| Test ID | Description | Phase |
|---------|-------------|-------|
| RAG-PIPE-001 | Create dataset with naive parser config | Dataset Creation |
| RAG-PIPE-002 | Verify dataset appears in dataset list | Dataset Creation |
| RAG-PIPE-003 | Upload PDF document to dataset | Document Upload |
| RAG-PIPE-004 | Verify document status is pending before parsing | Document Upload |
| RAG-PIPE-005 | Verify document appears in document list | Document Upload |
| RAG-PIPE-006 | Trigger document parsing and wait for completion | Parsing |
| RAG-PIPE-007 | Verify chunks are generated after parsing | Parsing |
| RAG-PIPE-008 | Verify all chunks are marked available | Parsing |
| RAG-PIPE-009 | Verify chunks exist in OpenSearch | Indexing |
| RAG-PIPE-010 | Verify embedding vectors exist for chunks | Indexing |
| RAG-PIPE-011 | Verify chunks are searchable via full-text search | Indexing |
| RAG-PIPE-012 | Create chat assistant linked to dataset | Chat |
| RAG-PIPE-013 | Create conversation for chat testing | Chat |
| RAG-PIPE-014 | Send message and receive RAG-augmented response | Chat |
| RAG-PIPE-015 | Verify response contains source citations | Chat |
| RAG-PIPE-016 | Conversation history persists across page reload | Chat |
| RAG-PIPE-017 | Create search app linked to dataset | Search |
| RAG-PIPE-018 | Verify search app is retrievable | Search |
| RAG-PIPE-019 | Delete conversation | Cleanup |
| RAG-PIPE-020 | Delete chat assistant | Cleanup |
| RAG-PIPE-021 | Delete search app | Cleanup |
| RAG-PIPE-022 | Delete dataset and verify OpenSearch cleanup | Cleanup |

### 3.2 Multi-Document RAG (`rag-multi-document.spec.ts`)

| Test ID | Description |
|---------|-------------|
| RAG-MULTI-001 | Create dataset for multi-document testing |
| RAG-MULTI-002 | Upload first document (PDF) |
| RAG-MULTI-003 | Upload second document (text buffer) |
| RAG-MULTI-004 | Parse all documents and wait for completion |
| RAG-MULTI-005 | Verify each document has chunks |
| RAG-MULTI-006 | Verify total chunks across all documents |
| RAG-MULTI-007 | Verify all documents have chunks in OpenSearch |
| RAG-MULTI-008 | Cross-document search returns results |
| RAG-MULTI-009 | Delete first document without affecting second |
| RAG-MULTI-010 | Delete dataset and verify full cleanup |

### 3.3 Chunk Management (`rag-chunk-management.spec.ts`)

| Test ID | Description |
|---------|-------------|
| RAG-CHUNK-001 | Verify initial chunks exist and are available |
| RAG-CHUNK-002 | Verify chunks have consistent doc_id linking |
| RAG-CHUNK-003 | Update parser settings to smaller chunk size |
| RAG-CHUNK-004 | Re-parse with new settings produces chunks |
| RAG-CHUNK-005 | Re-parsed chunks are searchable in OpenSearch |
| RAG-CHUNK-006 | Re-parse with larger chunk size |
| RAG-CHUNK-007 | Verify OpenSearch consistency after multiple re-parses |
| RAG-CHUNK-008 | Search still works after multiple re-parses |

### 3.4 Dataset Search API (`rag-dataset-search-api.spec.ts`)

| Test ID | Description |
|---------|-------------|
| RAG-SEARCH-001 | Search API returns results for matching query |
| RAG-SEARCH-002 | Search API returns chunks with content |
| RAG-SEARCH-003 | Search API respects top_k parameter |
| RAG-SEARCH-004 | Search API returns empty for irrelevant query |
| RAG-SEARCH-005 | Search finds ISO 13485 compliance content |
| RAG-SEARCH-006 | Search finds architecture content |
| RAG-SEARCH-007 | List chunks returns all chunks for dataset |
| RAG-SEARCH-008 | List chunks filtered by doc_id |
| RAG-SEARCH-009 | Document list shows parsed status |

### 3.5 Error Handling (`rag-error-handling.spec.ts`)

| Test ID | Description |
|---------|-------------|
| RAG-ERR-001 | Get non-existent dataset returns null/404 |
| RAG-ERR-002 | Get non-existent document returns null/404 |
| RAG-ERR-003 | Delete non-existent dataset does not throw |
| RAG-ERR-004 | Delete non-existent document does not throw |
| RAG-ERR-005 | List documents on empty dataset returns empty |
| RAG-ERR-006 | List chunks on empty dataset returns empty |
| RAG-ERR-007 | Search on empty dataset returns empty results |
| RAG-ERR-008 | Create dataset with empty name fails |
| RAG-ERR-009 | Trigger parse with empty document list |
| RAG-ERR-010 | API rejects non-JSON content type |
| RAG-ERR-011 | Get non-existent chat assistant returns null/404 |
| RAG-ERR-012 | Get non-existent search app returns null/404 |
| RAG-ERR-013 | Health check endpoint is accessible |

---

## 4. Manual Test Cases (Supplement)

### TC-RAG-M001: UI Document Upload with Drag-and-Drop
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Steps** | 1. Navigate to a dataset page <br> 2. Drag a PDF file onto the upload area <br> 3. Verify the file appears in the document list |
| **Expected** | Document is uploaded and shows in pending status |

### TC-RAG-M002: Parser Type Selection via UI
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Steps** | 1. Navigate to dataset settings <br> 2. Change parser type (naive → deepdoc or others) <br> 3. Re-parse a document <br> 4. Verify chunks are generated with new parser |
| **Expected** | Parser change is persisted and re-parse uses new parser |

### TC-RAG-M003: Chat Response Quality with Citations
| Field | Value |
|---|---|
| **Priority** | High |
| **Steps** | 1. Create a dataset with domain-specific documents <br> 2. Create a chat assistant linked to the dataset <br> 3. Ask domain-specific questions <br> 4. Verify response accuracy and citation relevance |
| **Expected** | Responses are factually accurate with relevant citations |

### TC-RAG-M004: Search Result Ranking Relevance
| Field | Value |
|---|---|
| **Priority** | High |
| **Steps** | 1. Index multiple documents with overlapping topics <br> 2. Search for a specific topic <br> 3. Verify the most relevant document appears first |
| **Expected** | Search results are ranked by relevance with most relevant first |

### TC-RAG-M005: Large File Upload (>50MB)
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Steps** | 1. Upload a large PDF (50-100MB) <br> 2. Monitor parsing progress <br> 3. Verify all chunks are generated |
| **Expected** | Large file is processed completely without timeout |

### TC-RAG-M006: Concurrent Document Parsing
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Steps** | 1. Upload 5+ documents to a dataset <br> 2. Trigger bulk parse for all documents <br> 3. Monitor progress for all documents |
| **Expected** | All documents are parsed successfully (may be sequential or parallel) |

### TC-RAG-M007: Dataset Versioning Workflow
| Field | Value |
|---|---|
| **Priority** | High |
| **Steps** | 1. Create a dataset and parse documents <br> 2. Create a new version with updated documents <br> 3. Compare chunk counts between versions <br> 4. Verify search works on the new version |
| **Expected** | New version has updated chunks, old version data is preserved |

### TC-RAG-M008: Cross-Dataset Chat
| Field | Value |
|---|---|
| **Priority** | High |
| **Steps** | 1. Create two datasets with different documents <br> 2. Create a chat assistant linked to both datasets <br> 3. Ask questions that span both datasets |
| **Expected** | Assistant retrieves context from both datasets and provides combined answer |

### TC-RAG-M009: RAG with No Relevant Documents
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Steps** | 1. Create a chat assistant with a small dataset <br> 2. Ask a question completely unrelated to the dataset content |
| **Expected** | Assistant acknowledges lack of relevant information; does not hallucinate |

### TC-RAG-M010: Document Re-upload After Deletion
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Steps** | 1. Upload and parse a document <br> 2. Delete the document <br> 3. Re-upload the same document <br> 4. Parse and verify chunks |
| **Expected** | Document can be re-uploaded and parsed without conflicts |

---

## 5. Test Execution Log Template

| Test ID | Date | Tester | Result | Notes |
|---|---|---|---|---|
| RAG-PIPE-001 | | | PASS / FAIL | |
| RAG-PIPE-002 | | | PASS / FAIL | |
| ... | | | | |
| RAG-MULTI-001 | | | PASS / FAIL | |
| ... | | | | |
| RAG-CHUNK-001 | | | PASS / FAIL | |
| ... | | | | |
| RAG-SEARCH-001 | | | PASS / FAIL | |
| ... | | | | |
| RAG-ERR-001 | | | PASS / FAIL | |
| ... | | | | |
| TC-RAG-M001 | | | PASS / FAIL | |
| ... | | | | |

---

## 6. Running the Tests

```bash
# Run all RAG workflow E2E tests
npx playwright test e2e/rag-workflow/

# Run specific test suite
npx playwright test e2e/rag-workflow/rag-full-pipeline.spec.ts

# Run only @smoke tagged tests
npx playwright test --grep @smoke e2e/rag-workflow/

# Run with UI mode for debugging
npx playwright test --ui e2e/rag-workflow/
```

---

## 7. Traceability Matrix

| Regulatory Requirement | Test Cases |
|---|---|
| ISO 13485 §7.5.3 — Traceability | RAG-PIPE-009..015, RAG-SEARCH-001..006 |
| IEC 62304 §5.6 — Integration testing | RAG-PIPE-001..022 (full pipeline) |
| IEC 62304 §5.7 — Risk management | RAG-ERR-001..013 |
| ISO 14971 — Risk management | RAG-ERR-001..013, TC-RAG-M009 |
| 21 CFR Part 11 §11.10(a) — Validation | RAG-SEARCH-001..009 |
| ISO 13485 §4.2.4 — Document control | RAG-MULTI-001..010, TC-RAG-M007 |

---

## 8. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| QA Engineer | | | |
| Software Developer | | | |
| Regulatory Affairs | | | |
