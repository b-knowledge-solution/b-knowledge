# FR: User History Browsing

> Personal browsing history for authenticated users to review and revisit their past chat and search sessions.

## 1. Overview

The User History feature provides authenticated users with access to their personal chat and search session history. Users can browse, search, and review past interactions including conversation details and search results.

### 1.1 Goals

- Allow users to revisit past chat conversations and search sessions
- Support filtering by date range and text search
- Provide detailed session views with full message/result history
- Separate from admin history (which shows all users' history)

### 1.2 Actors

| Actor | Capabilities |
|-------|-------------|
| Authenticated User | Browse own chat and search history, view session details |

## 2. Functional Requirements

### 2.1 Chat History

- **FR-UH-001**: Users shall view a paginated list of their chat sessions.
- **FR-UH-002**: Chat history shall support filtering by text query, date range, and pagination.
- **FR-UH-003**: Users shall view full details of a specific chat session including all messages.

### 2.2 Search History

- **FR-UH-010**: Users shall view a paginated list of their search sessions.
- **FR-UH-011**: Search history shall support filtering by text query, date range, and pagination.
- **FR-UH-012**: Users shall view full details of a specific search session including queries and results.

## 3. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/user/history/chat` | Yes | List user's chat sessions |
| GET | `/api/user/history/chat/:sessionId` | Yes | Get chat session details |
| GET | `/api/user/history/search` | Yes | List user's search sessions |
| GET | `/api/user/history/search/:sessionId` | Yes | Get search session details |

## 4. Feature Flag

The history feature can be toggled via the `VITE_ENABLE_HISTORY` environment variable (default: `true`).

## 5. Dependencies

- [AI Chat](/srs/ai-features/fr-ai-chat) — Chat sessions that generate history records
- [AI Search](/srs/ai-features/fr-ai-search) — Search sessions that generate history records
- [Authentication](/srs/core-platform/fr-authentication) — User identity for session scoping
