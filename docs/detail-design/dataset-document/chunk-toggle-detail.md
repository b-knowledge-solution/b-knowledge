# Chunk Enable/Disable Toggle — Detail Design

> **Feature**: GAP-1 | **Module**: RAG | **Status**: Implemented

## 1. Overview

The chunk toggle feature allows users to enable or disable individual chunks within a dataset. Disabled chunks are excluded from all search and chat retrieval queries but remain visible in the chunk management UI. This enables content curation without data loss.

---

## 2. Use Cases

| Actor | Action | Outcome |
|-------|--------|---------|
| Knowledge Manager | Disables a low-quality chunk | Chunk excluded from search results |
| Content Curator | Bulk-disables outdated chunks | Multiple chunks excluded at once |
| Reviewer | Views chunk list | Sees enabled/disabled status per chunk |
| Knowledge Manager | Re-enables a chunk | Chunk included in search results again |

---

## 3. Design

### 3.1 Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Frontend    │     │  Backend API     │     │   OpenSearch      │
│              │     │                  │     │                  │
│ Toggle switch│────▶│ PUT /chunks/:id  │────▶│ Update doc       │
│ or bulk btn  │     │ { available }    │     │ available_int=0|1│
│              │     │                  │     │                  │
│ Bulk select  │────▶│ POST /chunks/    │────▶│ Bulk update      │
│ + action     │     │ bulk-switch      │     │ by doc IDs       │
└─────────────┘     └──────────────────┘     └──────────────────┘

Search Query Flow:
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  User query  │────▶│ Search service   │────▶│ OpenSearch query  │
│              │     │ adds filter:     │     │ WHERE             │
│              │     │ available_int=1  │     │ available_int = 1 │
└─────────────┘     └──────────────────┘     └──────────────────┘
```

### 3.2 OpenSearch Field

```json
{
  "available_int": {
    "type": "integer"
  }
}
```

- `1` = enabled (default, included in search)
- `0` = disabled (excluded from search)

Integer type is used instead of boolean for compatibility with OpenSearch aggregation and sorting.

### 3.3 API Response Mapping

The backend maps the OpenSearch integer to a boolean in the API response:

```typescript
// In rag-search.service.ts mapHits()
available: hit._source.available_int === 1
```

---

## 4. Business Logic

### 4.1 Single Chunk Toggle

1. Client sends `PUT /datasets/:id/chunks/:chunkId` with `{ available: boolean }`
2. Backend validates request via `updateChunkSchema`
3. Backend updates OpenSearch document: `available_int = available ? 1 : 0`
4. Returns updated chunk

### 4.2 Bulk Switch

1. Client sends `POST /datasets/:id/chunks/bulk-switch` with `{ chunk_ids: string[], available: boolean }`
2. Backend validates chunk IDs belong to the dataset
3. Backend executes OpenSearch bulk update for all chunk IDs
4. Returns count of updated chunks

### 4.3 Search Filtering

All search methods (`fullTextSearch`, `semanticSearch`, `hybridSearch`) include the filter:

```json
{
  "bool": {
    "filter": [
      { "term": { "available_int": 1 } }
    ]
  }
}
```

This filter is applied at the query level (not post-filter) for performance — OpenSearch skips disabled chunks during index scanning.

### 4.4 Chunk List Display

The `listChunks` method includes `available_int` in the `_source` fields and maps it to `available: boolean`. The frontend displays:
- Enabled chunks: normal appearance
- Disabled chunks: muted/grayed appearance with a visual indicator

---

## 5. API Reference

### 5.1 Bulk Switch

```
POST /api/v1/datasets/:id/chunks/bulk-switch
Authorization: Bearer <token>
Content-Type: application/json

{
  "chunk_ids": ["chunk-id-1", "chunk-id-2", "chunk-id-3"],
  "available": false
}

Response 200:
{
  "updated": 3
}
```

### 5.2 Single Toggle (via Update)

```
PUT /api/v1/datasets/:id/chunks/:chunkId
Authorization: Bearer <token>
Content-Type: application/json

{
  "available": true
}

Response 200:
{
  "id": "chunk-id-1",
  "content_with_weight": "...",
  "available": true,
  ...
}
```

---

## 6. Frontend Components

### 6.1 Chunk List

- Each chunk row has a toggle switch for availability
- Bulk action toolbar appears when multiple chunks are selected
- Bulk actions: "Enable Selected", "Disable Selected"

### 6.2 Visual States

| State | Appearance |
|-------|------------|
| Enabled | Normal text, switch ON |
| Disabled | Muted/grayed text, switch OFF, subtle badge "Disabled" |

---

## 7. Error Handling

| Scenario | Response | UI Behavior |
|----------|----------|-------------|
| Chunk not found | 404 | Toast error |
| Chunk belongs to different dataset | 403 | Toast error |
| OpenSearch unavailable | 503 | Toast error + retry option |
| Bulk switch with >1000 IDs | 400 | Validation error |

---

## 8. Related Documents

- [Chunk Management](/detail-design/dataset-document/chunk-management-detail)
- [Chunk Keywords & Questions](/detail-design/dataset-document/chunk-keywords-detail)
