# Chat & Search E2E Test Plan

## Overview

End-to-end test scenarios for the AI Chat and AI Search features in b-knowledge. These tests validate full user flows from the frontend through the backend API to external services (RAGFlow, OpenSearch).

---

## 1. Chat Flow

### 1.1 Start a New Chat Session

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to AI Chat page | RagflowIframe loads, URL check passes, iframe renders |
| 2 | Verify iframe URL contains correct params | `locale`, `email`, `theme`, `_t` present in query string |
| 3 | Wait for iframe load event | Loading spinner disappears |

### 1.2 Send Message and Receive Stream

| Step | Action | Expected |
|------|--------|----------|
| 1 | Type message in chat input | Input reflects typed text |
| 2 | Press Enter / click Send | Message appears in chat history as user message |
| 3 | Observe SSE stream response | Assistant message builds up incrementally |
| 4 | Stream completes | Final message displayed, streaming indicator removed |

### 1.3 View References / Citations

| Step | Action | Expected |
|------|--------|----------|
| 1 | After assistant responds with references | Citation badges visible below message |
| 2 | Click a citation badge | Document preview opens or navigates to source |

### 1.4 Send Feedback

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click thumbs-up on assistant message | Feedback recorded (API call succeeds) |
| 2 | Click thumbs-down with text | Feedback with comment recorded |

### 1.5 Reset Session

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click reset session button | Session key updates, iframe reloads |
| 2 | New URL contains fresh `_t` timestamp | Previous conversation cleared |

---

## 2. Search Flow

### 2.1 Load Search Interface

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to AI Search page | Search iframe loads with search source URL |
| 2 | Verify iframe params | `locale`, `email`, `theme` in URL |

### 2.2 Execute Search Query

| Step | Action | Expected |
|------|--------|----------|
| 1 | Enter search query | Query text visible in input |
| 2 | Submit search | POST `/api/rag/datasets/:id/search` called with query body |
| 3 | Results returned | Chunk results displayed with text, scores, and doc names |

### 2.3 Search with Different Methods

| Scenario | Params | Expected |
|----------|--------|----------|
| Full-text | `method: "full_text"` | Text-matched results |
| Semantic | `method: "semantic"`, vector provided | Vector-similarity results above threshold |
| Hybrid | `method: "hybrid"` | Merged full-text + semantic, deduplicated |
| No results | Query matches nothing | Empty state displayed |

### 2.4 Search Parameters

| Scenario | Params | Expected |
|----------|--------|----------|
| Custom top_k | `top_k: 5` | Max 5 results returned |
| High threshold | `similarity_threshold: 0.9` | Only very relevant results |
| Low threshold | `similarity_threshold: 0` | All results pass filter |

---

## 3. Chat History Management

### 3.1 Browse History

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to chat history page | Sessions listed with pagination |
| 2 | Search by keyword | Filtered results (title or message content match) |
| 3 | Filter by date range | Only sessions within range shown |

### 3.2 Delete Sessions

| Step | Action | Expected |
|------|--------|----------|
| 1 | Delete single session | 204 response, session removed from list |
| 2 | Bulk delete by IDs | Specified sessions removed |
| 3 | Delete all sessions | All user sessions removed |

---

## 4. Dataset / Knowledge Base Management

### 4.1 CRUD Operations

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create dataset | 201 response, audit log created |
| 2 | List datasets | Filtered by user access (public, team, user_ids) |
| 3 | Update dataset | Fields updated, audit logged |
| 4 | Delete dataset | Soft-delete (status=deleted), 204 response |

### 4.2 Document Upload and Parse

| Step | Action | Expected |
|------|--------|----------|
| 1 | Upload file to dataset | File stored in MinIO, document record created |
| 2 | Trigger parse | Document status set to parsing, task queued in Redis |
| 3 | Stream progress (SSE) | Progress events received via `/progress` endpoint |

---

## 5. Edge Cases

### 5.1 Network Disconnect During Stream

| Scenario | Expected |
|----------|----------|
| Network drops mid-SSE stream | Error state shown, retry button available |
| Server closes SSE connection | Partial message preserved, user can retry |

### 5.2 Empty Dataset Search

| Scenario | Expected |
|----------|----------|
| Search on dataset with no documents | `{ chunks: [], total: 0 }` returned |
| Search on deleted dataset | 404 response |

### 5.3 Concurrent Operations

| Scenario | Expected |
|----------|----------|
| Multiple chat sessions open in tabs | Each tab maintains independent session |
| Rapid search queries | Latest query results displayed, no race condition |

### 5.4 Authentication Edge Cases

| Scenario | Expected |
|----------|----------|
| Token expires during iframe load | REAUTH_REQUIRED error, forbidden error page shown |
| Unauthenticated user hits protected route | 401 response |

### 5.5 Source Configuration

| Scenario | Expected |
|----------|----------|
| No chat sources configured | Error message: "iframe.noChatSourceConfigured" |
| Invalid source URL | Error message: "iframe.invalidSourceUrl" |
| Source URL timeout | Network error after 10s timeout |

---

## 6. Performance Benchmarks

| Metric | Target |
|--------|--------|
| Iframe initial load | < 3s |
| Search response (full-text) | < 500ms |
| SSE first token latency | < 1s |
| Chat history page load (50 sessions) | < 1s |
