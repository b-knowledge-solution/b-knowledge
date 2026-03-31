# Chunk Keywords & Questions — Detail Design

> **Feature**: GAP-2 | **Module**: RAG | **Status**: Implemented

## 1. Overview

Users can attach **important keywords** and **expected questions** to individual chunks. Important keywords boost a chunk's relevance during keyword-based search. Expected questions define the queries a chunk is intended to answer, improving retrieval precision for FAQ-style knowledge bases.

---

## 2. Use Cases

| Actor | Action | Outcome |
|-------|--------|---------|
| Content Editor | Adds keywords "PostgreSQL", "migration" to a chunk | Chunk ranks higher for queries containing those terms |
| Knowledge Engineer | Adds question "How to run migrations?" | Chunk retrieved when user asks that question |
| Manager | Views chunk details | Sees attached keywords and questions as tags |
| Editor | Pastes comma-separated keywords | All keywords added at once via TagEditor |

---

## 3. Design

### 3.1 Data Model

Two new array fields in OpenSearch chunks:

| Field | OpenSearch Type | API Name | Purpose |
|-------|----------------|----------|---------|
| `important_kwd` | `keyword[]` | `important_keywords` | Boost terms for relevance |
| `question_kwd` | `keyword[]` | `question_keywords` | Expected questions this chunk answers |

### 3.2 Data Flow

```
┌───────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Frontend         │     │  Backend API     │     │   OpenSearch      │
│                   │     │                  │     │                  │
│  TagEditor        │     │  Zod validation  │     │  important_kwd   │
│  ┌─────────────┐  │     │  - string[]      │     │  question_kwd    │
│  │ [tag1] [tag2]│  │────▶│  - trim each    │────▶│  (keyword type)  │
│  │ [+add]      │  │     │  - deduplicate   │     │                  │
│  └─────────────┘  │     │                  │     │                  │
└───────────────────┘     └──────────────────┘     └──────────────────┘
```

---

## 4. Business Logic

### 4.1 Creating a Chunk with Keywords

1. User opens the "Add Chunk" modal
2. User enters chunk content text
3. User adds keywords via the TagEditor component
4. User adds expected questions via a second TagEditor
5. Client sends `POST /datasets/:id/chunks`:
   ```json
   {
     "content": "PostgreSQL supports JSONB columns...",
     "important_keywords": ["postgresql", "jsonb", "indexing"],
     "question_keywords": ["What databases support JSON?", "How to index JSONB?"]
   }
   ```
6. Backend stores to OpenSearch as `important_kwd` and `question_kwd`

### 4.2 Updating Keywords

1. User opens chunk edit dialog
2. Existing keywords/questions displayed as tags
3. User can add (Enter/comma/paste) or remove (Backspace/click X) tags
4. Client sends `PUT /datasets/:id/chunks/:chunkId` with updated arrays
5. Backend updates OpenSearch document

### 4.3 Validation Rules

| Rule | Details |
|------|---------|
| Type | Array of strings |
| Required | No (both fields optional) |
| Empty allowed | Yes (empty array clears all keywords/questions) |
| Max per tag | No explicit limit |
| Trimming | Each string trimmed of whitespace |

### 4.4 Search Integration

The `important_kwd` and `question_kwd` fields are returned in search results and chunk listings. They are indexed as `keyword` type in OpenSearch, enabling:
- Exact-match filtering: find chunks with a specific keyword
- Aggregation: count chunks by keyword
- Boost: future enhancement to weight these fields in search scoring

---

## 5. Frontend — TagEditor Component

### 5.1 Component: `tag-editor.tsx`

A reusable tag input component used for both keywords and questions:

```typescript
interface TagEditorProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  label?: string
  variant?: 'default' | 'secondary'
  disabled?: boolean
}
```

### 5.2 Interaction Patterns

| Action | Behavior |
|--------|----------|
| Type + Enter | Adds the typed text as a new tag |
| Type + Comma | Adds the text before the comma as a tag |
| Paste text | Splits by comma or newline, adds all as tags |
| Backspace (empty input) | Removes the last tag |
| Click X on tag | Removes that specific tag |

### 5.3 Rendering

- Each tag rendered as a `Badge` component with a remove button (X)
- Tags wrap to multiple lines if they overflow
- Input field appears after all tags for adding new ones
- Supports both `default` and `secondary` badge variants

---

## 6. API Reference

### 6.1 Create Chunk with Keywords

```
POST /api/v1/datasets/:id/chunks
Content-Type: application/json

{
  "content": "PostgreSQL supports JSONB columns for flexible schema storage...",
  "important_keywords": ["postgresql", "jsonb", "schema"],
  "question_keywords": ["What is JSONB?", "How to store JSON in PostgreSQL?"]
}

Response 200:
{
  "id": "chunk-123",
  "content_with_weight": "PostgreSQL supports JSONB columns...",
  "important_kwd": ["postgresql", "jsonb", "schema"],
  "question_kwd": ["What is JSONB?", "How to store JSON in PostgreSQL?"],
  "available": true
}
```

### 6.2 Update Chunk Keywords

```
PUT /api/v1/datasets/:id/chunks/:chunkId
Content-Type: application/json

{
  "important_keywords": ["postgresql", "jsonb", "gin-index"],
  "question_keywords": ["How to create a GIN index on JSONB?"]
}
```

---

## 7. Error Handling

| Scenario | Response | UI Behavior |
|----------|----------|-------------|
| Invalid keyword type (not string[]) | 400 | Validation error |
| Chunk not found | 404 | Toast error |
| OpenSearch write failure | 503 | Toast error + retry |

---

## 8. Related Documents

- [Chunk Management](/detail-design/dataset-document/chunk-management-detail)
- [Chunk Toggle](/detail-design/dataset-document/chunk-toggle-detail)
