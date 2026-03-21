# Admin Dashboard & Analytics Detail Design

## Overview

The Admin Dashboard provides system-level statistics and analytics for monitoring B-Knowledge usage. Basic stats are available to admins and leaders; detailed query and feedback analytics require super-admin access.

## Component Architecture

```mermaid
flowchart TD
    D[Dashboard Page] --> S[Stats Panel]
    D --> Q[Query Analytics]
    D --> F[Feedback Metrics]

    S --> S1[Total Users]
    S --> S2[Total Datasets]
    S --> S3[Total Documents]
    S --> S4[Total Chunks]
    S --> S5[Chat Sessions]
    S --> S6[Search Queries]

    Q --> Q1[Query Volume Over Time]
    Q --> Q2[Top Queries]
    Q --> Q3[Avg Response Time]

    F --> F1[Thumbs Up/Down Ratio]
    F --> F2[Trending Issues]
```

## API Endpoints

### Stats (Admin / Leader)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/dashboard/stats` | Aggregate system statistics |

**Response:**

```json
{
  "users": 142,
  "datasets": 23,
  "documents": 1547,
  "chunks": 89432,
  "chatSessions": 3201,
  "searchQueries": 12044
}
```

### Query Analytics (Super-Admin Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/dashboard/analytics/queries` | Query volume and performance metrics |

**Query Parameters:** `date_from`, `date_to`, `granularity` (hour/day/week)

**Response:**

```json
{
  "volumeOverTime": [
    { "period": "2026-03-20", "count": 234 }
  ],
  "topQueries": [
    { "query": "deployment guide", "count": 45 }
  ],
  "avgResponseTimeMs": 1230
}
```

### Feedback Analytics (Super-Admin Only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/dashboard/analytics/feedback` | User feedback aggregations |

**Response:**

```json
{
  "thumbsUp": 892,
  "thumbsDown": 67,
  "ratio": 0.93,
  "trendingIssues": [
    { "topic": "outdated content", "count": 12 }
  ]
}
```

## Data Flow

```mermaid
sequenceDiagram
    actor Admin
    participant FE as Frontend
    participant API as Dashboard API
    participant DB as PostgreSQL

    Admin->>FE: Open dashboard page
    FE->>API: GET /api/admin/dashboard/stats
    API->>DB: COUNT users, datasets, documents, chunks
    API->>DB: COUNT chat_sessions, query_logs
    DB-->>API: Aggregate counts
    API-->>FE: Stats JSON

    alt Super-Admin
        FE->>API: GET /api/admin/dashboard/analytics/queries?date_from=...
        API->>DB: SELECT FROM query_log GROUP BY period
        API->>DB: SELECT query, COUNT(*) TOP 10
        API->>DB: AVG(response_time_ms) FROM query_log
        DB-->>API: Analytics data
        API-->>FE: Query analytics JSON

        FE->>API: GET /api/admin/dashboard/analytics/feedback
        API->>DB: SELECT FROM answer_feedback GROUP BY type
        DB-->>API: Feedback aggregations
        API-->>FE: Feedback metrics JSON
    end

    FE->>Admin: Render dashboard panels
```

## Role Restrictions

| Endpoint | Required Role |
|----------|--------------|
| `/api/admin/dashboard/stats` | admin, leader |
| `/api/admin/dashboard/analytics/queries` | super-admin |
| `/api/admin/dashboard/analytics/feedback` | super-admin |

Non-authorized users receive `403 Forbidden`.

## Data Sources

| Metric | Source Table | Aggregation |
|--------|-------------|-------------|
| Users | `users` | COUNT |
| Datasets | `knowledgebase` | COUNT |
| Documents | `document` | COUNT |
| Chunks | `document_chunk` | COUNT |
| Chat Sessions | `chat_session` | COUNT |
| Search Queries | `query_log` | COUNT |
| Response Time | `query_log.response_time_ms` | AVG |
| Feedback | `answer_feedback` | COUNT by type |

## Key Files

| File | Purpose |
|------|---------|
| `be/src/modules/dashboard/` | Module root |
| `be/src/modules/dashboard/dashboard.controller.ts` | Route handlers |
| `be/src/modules/dashboard/dashboard.service.ts` | Aggregation queries |
| `fe/src/features/dashboard/` | Frontend feature |
