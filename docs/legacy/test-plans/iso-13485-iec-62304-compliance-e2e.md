# ISO 13485 / IEC 62304 Healthcare Compliance — E2E Test Plan

**Document ID:** TP-COMP-001
**Version:** 1.0
**Date:** 2026-03-20
**Classification:** Software Verification & Validation (V&V)

---

## 1. Purpose

This document defines manual End-to-End (E2E) test cases to verify that B-Knowledge meets the requirements of:

- **ISO 13485:2016** — Medical devices — Quality management systems
- **IEC 62304:2006+A1:2015** — Medical device software — Software life cycle processes
- **21 CFR Part 11** — Electronic Records; Electronic Signatures
- **ISO 14971:2019** — Application of risk management to medical devices

These tests supplement the automated compliance test suite and must be executed as part of the formal release validation process.

---

## 2. Test Environment Prerequisites

| Prerequisite | Setup Command | Verification |
|---|---|---|
| Infrastructure running | `npm run docker:base` | `docker ps` shows PostgreSQL, Valkey, OpenSearch, RustFS |
| Backend running | `npm run dev:be` | `curl http://localhost:3001/health` returns `{"status":"ok"}` |
| Frontend running | `npm run dev:fe` | Browser opens `http://localhost:5173` |
| RAG Worker running | `npm run dev:worker` | Backend logs show worker connected |
| Converter running | `npm run dev:converter` | Backend logs show converter connected |
| Test user created | Via seed or manual | Admin + standard user accounts available |

---

## 3. Test Cases

### 3.1 Authentication & Access Control (21 CFR Part 11 §11.10, §11.100)

#### TC-AUTH-001: User Login with Valid Credentials
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | User account exists, user is logged out |
| **Steps** | 1. Navigate to `http://localhost:5173` <br> 2. Verify redirect to `/login` <br> 3. Enter valid email and password <br> 4. Click "Login" / "Sign in" |
| **Expected** | User is redirected to dashboard/home page. Session is established. |
| **Regulatory** | 21 CFR Part 11 §11.100(a) — Unique user identification |

#### TC-AUTH-002: User Login with Invalid Credentials
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | User account exists |
| **Steps** | 1. Navigate to `/login` <br> 2. Enter valid email with wrong password <br> 3. Click "Login" |
| **Expected** | Login fails with generic error message (does not reveal whether email exists). |
| **Regulatory** | 21 CFR Part 11 §11.300 — Controls for identification codes/passwords |

#### TC-AUTH-003: Session Timeout
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | User is logged in |
| **Steps** | 1. Login successfully <br> 2. Wait for session TTL to expire (default 7 days, or modify for testing) <br> 3. Attempt to access a protected page |
| **Expected** | User is redirected to `/login` with appropriate message. |
| **Regulatory** | 21 CFR Part 11 §11.10(d) — Limiting system access |

#### TC-AUTH-004: Unauthenticated API Access
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | No active session |
| **Steps** | 1. Clear all cookies/sessions <br> 2. Directly call `GET /api/users` or any protected endpoint |
| **Expected** | Returns HTTP 401 Unauthorized. |
| **Regulatory** | 21 CFR Part 11 §11.10(d) |

#### TC-AUTH-005: User Logout
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | User is logged in |
| **Steps** | 1. Click logout button <br> 2. Attempt to navigate to a protected page |
| **Expected** | Session is destroyed. User is redirected to `/login`. |
| **Regulatory** | 21 CFR Part 11 §11.10(d) |

#### TC-AUTH-006: Role-Based Access — Admin Panel
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Admin and regular user accounts exist |
| **Steps** | 1. Login as admin → verify admin panel is accessible <br> 2. Login as regular user → verify admin panel is NOT accessible |
| **Expected** | Admin sees admin panel. Regular user does not see or access admin routes. |
| **Regulatory** | 21 CFR Part 11 §11.10(g) — Authority checks |

#### TC-AUTH-007: Role-Based Access — User Management
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Admin and regular user accounts exist |
| **Steps** | 1. As admin: create, edit, delete a user <br> 2. As regular user: attempt same operations |
| **Expected** | Admin succeeds. Regular user receives 403 Forbidden. |
| **Regulatory** | ISO 13485 §6.2, 21 CFR Part 11 §11.10(g) |

---

### 3.2 Audit Trail (ISO 13485 §4.2.5, 21 CFR Part 11 §11.10(e))

#### TC-AUDIT-001: Login Event Logging
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Admin has access to audit logs |
| **Steps** | 1. Login with a test user <br> 2. Navigate to admin → audit logs <br> 3. Filter by action type "login" |
| **Expected** | Audit record exists with: user ID, timestamp, IP address, action="login" |
| **Regulatory** | 21 CFR Part 11 §11.10(e) |

#### TC-AUDIT-002: Document Upload Logging
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Knowledge base exists, user is logged in |
| **Steps** | 1. Upload a document to a knowledge base <br> 2. Check audit logs |
| **Expected** | Audit record shows: user ID, document name, knowledge base ID, timestamp, action="upload_document" |
| **Regulatory** | ISO 13485 §4.2.4 — Control of documents |

#### TC-AUDIT-003: Document Deletion Logging
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Document exists in a knowledge base |
| **Steps** | 1. Delete a document <br> 2. Check audit logs |
| **Expected** | Audit record shows: user ID, document ID, action="delete_document", timestamp |
| **Regulatory** | ISO 13485 §4.2.5 — Control of records |

#### TC-AUDIT-004: User Management Logging
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Admin is logged in |
| **Steps** | 1. Create a new user <br> 2. Update user role <br> 3. Delete the user <br> 4. Check audit logs for all three events |
| **Expected** | Three separate audit records with correct action types and timestamps |
| **Regulatory** | 21 CFR Part 11 §11.10(e) |

#### TC-AUDIT-005: Knowledge Base Lifecycle Logging
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Admin is logged in |
| **Steps** | 1. Create a knowledge base <br> 2. Update its settings <br> 3. Delete it <br> 4. Verify audit records |
| **Expected** | Audit records for create, update, and delete actions |
| **Regulatory** | ISO 13485 §4.2.5 |

#### TC-AUDIT-006: Audit Log Integrity
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Multiple audit records exist |
| **Steps** | 1. View audit logs <br> 2. Verify timestamps are in chronological order <br> 3. Verify no audit records can be modified or deleted via the UI |
| **Expected** | Audit records are read-only and chronologically ordered |
| **Regulatory** | 21 CFR Part 11 §11.10(e) — Use of secure, computer-generated, time-stamped audit trails |

---

### 3.3 Data Integrity (ISO 13485 §7.5.1, 21 CFR Part 11 §11.10(a))

#### TC-DATA-001: File Upload — Valid File Types
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Knowledge base exists |
| **Steps** | 1. Upload PDF, DOCX, TXT, XLSX files <br> 2. Verify each is accepted |
| **Expected** | All supported file types are accepted and processed |
| **Regulatory** | ISO 13485 §7.5.1 |

#### TC-DATA-002: File Upload — Blocked File Types
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Knowledge base exists |
| **Steps** | 1. Attempt to upload .exe, .bat, .sh, .js files <br> 2. Verify rejection |
| **Expected** | System rejects dangerous file types with clear error message |
| **Regulatory** | IEC 62304 §5.5, ISO 14971 |

#### TC-DATA-003: File Upload — Size Limit
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Knowledge base exists |
| **Steps** | 1. Attempt to upload a file exceeding the size limit <br> 2. Verify rejection |
| **Expected** | System rejects oversized files with clear error message |
| **Regulatory** | ISO 14971 — Risk management |

#### TC-DATA-004: Form Validation — Required Fields
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | User is on any creation form |
| **Steps** | 1. Submit form with required fields empty <br> 2. Verify validation errors |
| **Expected** | Form shows validation errors for each missing required field |
| **Regulatory** | ISO 13485 §7.5.1 — Input validation |

#### TC-DATA-005: Data Encryption at Rest
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | System is running |
| **Steps** | 1. Store sensitive data (API keys, tokens) via settings <br> 2. Query database directly <br> 3. Verify stored values are encrypted |
| **Expected** | Sensitive fields in database are not stored in plaintext |
| **Regulatory** | 21 CFR Part 11 §11.10(c) |

#### TC-DATA-006: API Input Validation
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | System is running |
| **Steps** | 1. Send POST requests with invalid JSON <br> 2. Send requests with SQL injection payloads <br> 3. Send requests with XSS payloads |
| **Expected** | All malicious inputs are rejected. No SQL injection or XSS is possible. |
| **Regulatory** | IEC 62304 §5.3, ISO 14971 |

---

### 3.4 Document Management (ISO 13485 §4.2.3, §4.2.4)

#### TC-DOC-001: Document Upload and Parse
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Knowledge base exists, RAG worker running |
| **Steps** | 1. Upload a PDF document <br> 2. Wait for parsing to complete <br> 3. Verify document status shows "parsed" <br> 4. Verify chunks are created |
| **Expected** | Document is parsed into chunks with metadata preserved |
| **Regulatory** | ISO 13485 §4.2.4 |

#### TC-DOC-002: Document Versioning
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Document exists in knowledge base |
| **Steps** | 1. Upload a new version of the same document <br> 2. Verify version tracking |
| **Expected** | New version is tracked, previous version history is maintained |
| **Regulatory** | ISO 13485 §4.2.3 — Document approval and review |

#### TC-DOC-003: Document Download
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | Document exists |
| **Steps** | 1. Download the original document <br> 2. Compare with uploaded file |
| **Expected** | Downloaded file is identical to uploaded original |
| **Regulatory** | ISO 13485 §4.2.5 — Control of records |

#### TC-DOC-004: Document Search
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Indexed documents exist |
| **Steps** | 1. Search for specific content from an uploaded document <br> 2. Verify results contain relevant chunks |
| **Expected** | Search returns relevant document chunks with source attribution |
| **Regulatory** | ISO 13485 §4.2.3 |

---

### 3.5 System Monitoring & Error Handling (IEC 62304 §5.7, ISO 14971)

#### TC-SYS-001: Health Check — All Services Healthy
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | All services running |
| **Steps** | 1. Call `GET /health` <br> 2. Verify response |
| **Expected** | Returns 200 with `{"status":"ok","services":{"express":"running","database":"connected","redis":"connected"}}` |
| **Regulatory** | ISO 13485 §8.2.3 |

#### TC-SYS-002: Health Check — Database Failure
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Stop PostgreSQL container |
| **Steps** | 1. Stop PostgreSQL: `docker stop b-knowledge-postgresql` <br> 2. Call `GET /health` |
| **Expected** | Returns 503 with `{"status":"degraded","services":{"database":"disconnected"}}` |
| **Regulatory** | IEC 62304 §5.7 |

#### TC-SYS-003: Health Check — Redis Failure
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Stop Valkey/Redis container |
| **Steps** | 1. Stop Redis: `docker stop b-knowledge-valkey` <br> 2. Call `GET /health` |
| **Expected** | System reports Redis status appropriately. Application continues to function. |
| **Regulatory** | IEC 62304 §5.7 |

#### TC-SYS-004: Graceful Error Handling — 404
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | System is running |
| **Steps** | 1. Navigate to a non-existent page <br> 2. Call a non-existent API endpoint |
| **Expected** | User sees friendly 404 page. API returns structured JSON error (no stack traces). |
| **Regulatory** | IEC 62304 §5.7 |

#### TC-SYS-005: Content-Type Validation
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | System is running |
| **Steps** | 1. Send POST request with `Content-Type: text/xml` <br> 2. Verify response |
| **Expected** | Returns 415 Unsupported Media Type |
| **Regulatory** | IEC 62304 §5.5 |

---

### 3.6 Chat & AI Response Quality (IEC 62304 §5.3)

#### TC-CHAT-001: Chat Session Creation
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Chat assistant configured with knowledge base |
| **Steps** | 1. Create a new chat session <br> 2. Send a message <br> 3. Verify response with source citations |
| **Expected** | AI response is generated with proper source attribution from knowledge base |
| **Regulatory** | IEC 62304 §5.3 — Traceability of outputs |

#### TC-CHAT-002: Chat Response with Citations
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Knowledge base with indexed documents |
| **Steps** | 1. Ask a question related to indexed documents <br> 2. Verify response includes source references |
| **Expected** | Response cites specific documents and chunks used for answer generation |
| **Regulatory** | ISO 13485 §7.5.3 — Traceability |

#### TC-CHAT-003: Chat with No Relevant Documents
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | Knowledge base exists but has no relevant content |
| **Steps** | 1. Ask a question on a topic not in the knowledge base |
| **Expected** | System acknowledges it cannot find relevant information (does not hallucinate) |
| **Regulatory** | ISO 14971 — Risk mitigation |

#### TC-CHAT-004: Chat RBAC — Dialog Access Control
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Two users with different team assignments |
| **Steps** | 1. User A creates a private chat dialog <br> 2. User B attempts to access User A's dialog |
| **Expected** | User B cannot access User A's private dialog |
| **Regulatory** | 21 CFR Part 11 §11.10(d) |

---

### 3.7 Search Application (IEC 62304 §5.3)

#### TC-SEARCH-001: Search Query Execution
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Search app configured, documents indexed |
| **Steps** | 1. Open search application <br> 2. Enter a search query <br> 3. Verify results |
| **Expected** | Search returns relevant results with source attribution |
| **Regulatory** | IEC 62304 §5.3 |

#### TC-SEARCH-002: Search with Filters
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | Multiple knowledge bases with documents |
| **Steps** | 1. Search with knowledge base filter <br> 2. Verify results are from selected knowledge base only |
| **Expected** | Results are correctly filtered |
| **Regulatory** | ISO 13485 §7.5.1 |

#### TC-SEARCH-003: Search RBAC — Access Control
| Field | Value |
|---|---|
| **Priority** | Critical |
| **Precondition** | Knowledge bases with different team access |
| **Steps** | 1. User with Team A access searches <br> 2. Verify results only include accessible knowledge bases |
| **Expected** | User cannot see results from knowledge bases they don't have access to |
| **Regulatory** | 21 CFR Part 11 §11.10(d) |

---

### 3.8 Feedback & Quality Improvement (ISO 13485 §8.2.1)

#### TC-FB-001: Submit Positive Feedback
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | Chat session with at least one AI response |
| **Steps** | 1. Click thumbs-up on an AI response <br> 2. Verify feedback is recorded |
| **Expected** | Positive feedback is stored and visible in feedback management |
| **Regulatory** | ISO 13485 §8.2.1 — Customer feedback |

#### TC-FB-002: Submit Negative Feedback with Comment
| Field | Value |
|---|---|
| **Priority** | High |
| **Precondition** | Chat session with at least one AI response |
| **Steps** | 1. Click thumbs-down on an AI response <br> 2. Add a comment explaining the issue <br> 3. Submit |
| **Expected** | Negative feedback with comment is stored |
| **Regulatory** | ISO 13485 §8.2.1, §8.5 — Improvement |

#### TC-FB-003: Feedback Dashboard
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | Multiple feedback entries exist |
| **Steps** | 1. Navigate to feedback management <br> 2. Review feedback statistics |
| **Expected** | Dashboard shows aggregated feedback metrics, filterable by date and type |
| **Regulatory** | ISO 13485 §8.4 — Analysis of data |

---

### 3.9 Broadcast & Communication (ISO 13485 §5.5.3)

#### TC-BC-001: Create System Broadcast
| Field | Value |
|---|---|
| **Priority** | Medium |
| **Precondition** | Admin is logged in |
| **Steps** | 1. Create a new broadcast message <br> 2. Verify all active users see the broadcast |
| **Expected** | Broadcast message is displayed to all users |
| **Regulatory** | ISO 13485 §5.5.3 — Internal communication |

#### TC-BC-002: Dismiss Broadcast
| Field | Value |
|---|---|
| **Priority** | Low |
| **Precondition** | Active broadcast exists |
| **Steps** | 1. User dismisses the broadcast <br> 2. Verify it doesn't reappear <br> 3. Verify audit log records the dismissal |
| **Expected** | Broadcast is dismissed for the user, audit record created |
| **Regulatory** | ISO 13485 §4.2.5 |

---

## 4. Test Execution Log Template

| Test ID | Date | Tester | Result | Notes |
|---|---|---|---|---|
| TC-AUTH-001 | | | PASS / FAIL | |
| TC-AUTH-002 | | | PASS / FAIL | |
| TC-AUTH-003 | | | PASS / FAIL | |
| TC-AUTH-004 | | | PASS / FAIL | |
| TC-AUTH-005 | | | PASS / FAIL | |
| TC-AUTH-006 | | | PASS / FAIL | |
| TC-AUTH-007 | | | PASS / FAIL | |
| TC-AUDIT-001 | | | PASS / FAIL | |
| TC-AUDIT-002 | | | PASS / FAIL | |
| TC-AUDIT-003 | | | PASS / FAIL | |
| TC-AUDIT-004 | | | PASS / FAIL | |
| TC-AUDIT-005 | | | PASS / FAIL | |
| TC-AUDIT-006 | | | PASS / FAIL | |
| TC-DATA-001 | | | PASS / FAIL | |
| TC-DATA-002 | | | PASS / FAIL | |
| TC-DATA-003 | | | PASS / FAIL | |
| TC-DATA-004 | | | PASS / FAIL | |
| TC-DATA-005 | | | PASS / FAIL | |
| TC-DATA-006 | | | PASS / FAIL | |
| TC-DOC-001 | | | PASS / FAIL | |
| TC-DOC-002 | | | PASS / FAIL | |
| TC-DOC-003 | | | PASS / FAIL | |
| TC-DOC-004 | | | PASS / FAIL | |
| TC-SYS-001 | | | PASS / FAIL | |
| TC-SYS-002 | | | PASS / FAIL | |
| TC-SYS-003 | | | PASS / FAIL | |
| TC-SYS-004 | | | PASS / FAIL | |
| TC-SYS-005 | | | PASS / FAIL | |
| TC-CHAT-001 | | | PASS / FAIL | |
| TC-CHAT-002 | | | PASS / FAIL | |
| TC-CHAT-003 | | | PASS / FAIL | |
| TC-CHAT-004 | | | PASS / FAIL | |
| TC-SEARCH-001 | | | PASS / FAIL | |
| TC-SEARCH-002 | | | PASS / FAIL | |
| TC-SEARCH-003 | | | PASS / FAIL | |
| TC-FB-001 | | | PASS / FAIL | |
| TC-FB-002 | | | PASS / FAIL | |
| TC-FB-003 | | | PASS / FAIL | |
| TC-BC-001 | | | PASS / FAIL | |
| TC-BC-002 | | | PASS / FAIL | |

---

## 5. Traceability Matrix

| Regulatory Requirement | Test Cases |
|---|---|
| 21 CFR Part 11 §11.10(a) — System validation | TC-DATA-006, TC-SYS-001 |
| 21 CFR Part 11 §11.10(c) — Protection of records | TC-DATA-005 |
| 21 CFR Part 11 §11.10(d) — Limiting access | TC-AUTH-003, TC-AUTH-004, TC-AUTH-006, TC-AUTH-007, TC-CHAT-004, TC-SEARCH-003 |
| 21 CFR Part 11 §11.10(e) — Audit trails | TC-AUDIT-001 through TC-AUDIT-006 |
| 21 CFR Part 11 §11.10(g) — Authority checks | TC-AUTH-006, TC-AUTH-007 |
| 21 CFR Part 11 §11.100 — Unique identification | TC-AUTH-001 |
| 21 CFR Part 11 §11.300 — Password controls | TC-AUTH-002 |
| ISO 13485 §4.2.3 — Document control | TC-DOC-001 through TC-DOC-004 |
| ISO 13485 §4.2.4 — Control of documents | TC-AUDIT-002 |
| ISO 13485 §4.2.5 — Control of records | TC-AUDIT-003 through TC-AUDIT-006 |
| ISO 13485 §5.5.3 — Internal communication | TC-BC-001, TC-BC-002 |
| ISO 13485 §6.2 — Human resources | TC-AUTH-007 |
| ISO 13485 §7.5.1 — Production control | TC-DATA-001 through TC-DATA-004, TC-SEARCH-002 |
| ISO 13485 §7.5.3 — Traceability | TC-CHAT-002 |
| ISO 13485 §8.2.1 — Customer feedback | TC-FB-001 through TC-FB-003 |
| ISO 13485 §8.2.3 — Process monitoring | TC-SYS-001 through TC-SYS-003 |
| IEC 62304 §5.3 — Architectural design | TC-CHAT-001, TC-SEARCH-001 |
| IEC 62304 §5.5 — Unit verification | TC-SYS-005 |
| IEC 62304 §5.7 — Risk management | TC-SYS-002, TC-SYS-003, TC-SYS-004 |
| ISO 14971 — Risk management | TC-DATA-002, TC-DATA-003, TC-CHAT-003 |

---

## 6. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| QA Engineer | | | |
| Software Developer | | | |
| Regulatory Affairs | | | |
| Project Manager | | | |
