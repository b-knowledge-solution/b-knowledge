# FR: Feedback System

> Collect, aggregate, and export user feedback (thumbs up/down) on AI-generated answers across chat, search, and agent sources, enabling quality monitoring and retrieval pipeline improvement.

## 1. Overview

The Feedback System captures user reactions to AI-generated responses across all answer sources (chat conversations, search results, and agent runs). It provides aggregated analytics, filtering, and export capabilities for administrators and team leaders to monitor answer quality and identify areas for improvement.

### 1.1 Goals

- Capture thumbs-up/thumbs-down feedback on individual AI answers
- Support feedback across three sources: chat, search, and agent
- Provide aggregated statistics with source breakdown
- Enable filtered listing and export of feedback records
- Track feedback trends over time for quality monitoring

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| Authenticated User | Submit feedback (thumbs up/down) on any AI answer |
| Admin / Leader | View feedback list, statistics, and export records |

## 2. Functional Requirements

### 2.1 Feedback Submission

- **FR-FB-001**: Users shall submit feedback with a thumbs-up or thumbs-down indicator on any AI-generated answer.
- **FR-FB-002**: Feedback shall capture the source type (`chat`, `search`, or `agent`), the session/conversation ID, and the specific answer reference.
- **FR-FB-003**: Users may optionally include a text comment with their feedback.

### 2.2 Feedback Listing

- **FR-FB-010**: Admins and leaders shall view a paginated list of feedback records.
- **FR-FB-011**: The list shall support filtering by:
  - Source type (chat / search / agent)
  - Thumbs-up / thumbs-down
  - Date range (start date, end date)
- **FR-FB-012**: Default pagination: 20 items per page.

### 2.3 Feedback Statistics

- **FR-FB-020**: The system shall provide aggregated statistics including:
  - Total feedback count by source (chat, search, agent)
  - Positive vs. negative ratio per source
  - Top flagged sessions (most negative feedback)
- **FR-FB-021**: Statistics shall support date range filtering.

### 2.4 Feedback Export

- **FR-FB-030**: Admins and leaders shall export feedback records as a JSON array.
- **FR-FB-031**: Export shall support the same filters as listing (source, thumbs, date range).
- **FR-FB-032**: Maximum export size: 10,000 records per request.

## 3. API Endpoints

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/feedback` | Yes | Any | Submit answer feedback |
| GET | `/api/feedback` | Yes | Admin, Leader | List feedback (paginated) |
| GET | `/api/feedback/stats` | Yes | Admin, Leader | Aggregated statistics |
| GET | `/api/feedback/export` | Yes | Admin, Leader | Export feedback (JSON) |

## 4. Data Model

### answer_feedback table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | VARCHAR(32) | Tenant scope |
| source | ENUM | `'chat'`, `'search'`, or `'agent'` |
| session_id | VARCHAR(32) | Conversation/search/run session ID |
| answer_id | VARCHAR(32) | Specific answer reference |
| thumbup | BOOLEAN | True = positive, False = negative |
| comment | TEXT | Optional user comment |
| user_id | VARCHAR(32) | Feedback submitter |
| created_at | TIMESTAMP | Submission timestamp |

## 5. Access Control

- Submission: Any authenticated user
- Viewing/export: Admin and Leader roles only (enforced via `requireRole('admin', 'leader')`)
- All endpoints require tenant context (`requireTenant` middleware)

## 6. Dependencies

- [AI Chat](/srs/ai-features/fr-ai-chat) — Chat source for feedback
- [AI Search](/srs/ai-features/fr-ai-search) — Search source for feedback
- [Agents](/srs/ai-features/fr-agents) — Agent source for feedback
- [Admin Operations](/srs/management/fr-admin-operations) — Dashboard integration for feedback metrics
