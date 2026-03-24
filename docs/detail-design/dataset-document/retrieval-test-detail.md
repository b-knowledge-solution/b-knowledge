# Enhanced Retrieval Test — Detail Design

> **Feature**: GAP-3 | **Module**: RAG | **Status**: Implemented

## 1. Overview

The Enhanced Retrieval Test allows users to evaluate search quality against their dataset with fine-grained control over search parameters. Users configure the search method (hybrid/semantic/full-text), similarity threshold, vector-vs-keyword weight balance, and top-K count. Results display per-chunk score breakdowns (vector similarity, term similarity, overall) and highlighted matching text.

---

## 2. Use Cases

| Actor | Action | Outcome |
|-------|--------|---------|
| Knowledge Engineer | Runs test query "How to deploy?" | Sees ranked chunks with relevance scores |
| Developer | Adjusts vector weight from 0.5 to 0.8 | Observes how results change with more semantic weight |
| QA Tester | Sets threshold to 0.7 | Only sees chunks with ≥70% similarity |
| Content Editor | Reviews highlighted text | Understands why specific chunks matched |

---

## 3. Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  RetrievalTestPanel                          │
│                                                              │
│  ┌────────────────────────────────┐  ┌────────────────────┐ │
│  │ Query Input                    │  │ Parameters         │ │
│  │ [Enter your question...]      │  │                    │ │
│  │                                │  │ Method: [hybrid ▾] │ │
│  │ [Run Test]                     │  │ Threshold: ━━●━━━  │ │
│  │                                │  │ Vec Weight: ━━━●━━ │ │
│  │                                │  │ Top-K: [10]        │ │
│  └────────────────────────────────┘  └────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Results                                                  ││
│  │ ┌──────────────────────────────────────────────────────┐ ││
│  │ │ ChunkResultCard                                      │ ││
│  │ │ Score: 92%  Vector: 95%  Term: 87%  Tokens: 245     │ ││
│  │ │                                                      │ ││
│  │ │ "...the system uses <mark>PostgreSQL</mark> for      │ ││
│  │ │  primary <mark>storage</mark> with JSONB support..." │ ││
│  │ └──────────────────────────────────────────────────────┘ ││
│  │ ┌──────────────────────────────────────────────────────┐ ││
│  │ │ ChunkResultCard #2                                   │ ││
│  │ │ Score: 78%  Vector: 82%  Term: 71%  Tokens: 189     │ ││
│  │ │ "...database <mark>migration</mark> runs on..."      │ ││
│  │ └──────────────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Scoring Model

**Hybrid search score formula:**

```
finalScore = vectorWeight × vectorScore + (1 - vectorWeight) × textScore
```

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `vector_similarity_weight` | 0.5 | 0.0–1.0 | Weight given to vector (semantic) score |
| `similarity_threshold` | 0.0 | 0.0–1.0 | Minimum score to include in results |
| `top_k` | 10 | 1–100 | Maximum number of results |

**Score breakdown per result:**

| Field | Description |
|-------|-------------|
| `similarity` | Final combined score (0.0–1.0) |
| `vector_similarity` | Raw vector cosine similarity (0.0–1.0) |
| `term_similarity` | Raw BM25 text match score (normalized 0.0–1.0) |

---

## 4. Business Logic

### 4.1 Request Processing

1. User enters a query and configures parameters
2. Client sends `POST /datasets/:id/retrieval-test`:
   ```json
   {
     "question": "How to configure database connections?",
     "method": "hybrid",
     "similarity_threshold": 0.3,
     "vector_similarity_weight": 0.6,
     "top_k": 10
   }
   ```

### 4.2 Backend Execution

1. **Validate** request via `retrievalTestSchema` (Zod)
2. **Embed query** using tenant's embedding model (`LLMBundle`)
3. **Execute search** based on `method`:
   - `hybrid`: Both vector + BM25, combined with weight formula
   - `semantic`: Vector search only
   - `full_text`: BM25 keyword search only
4. **Apply highlighting**: OpenSearch `highlight` config on `content_with_weight`:
   ```json
   {
     "highlight": {
       "fields": {
         "content_with_weight": {
           "pre_tags": ["<mark>"],
           "post_tags": ["</mark>"],
           "number_of_fragments": 0
         }
       }
     }
   }
   ```
5. **Filter by threshold**: Remove results where `similarity < similarity_threshold`
6. **Return** chunks with score breakdown, highlight, and token count

### 4.3 Score Normalization

- **Vector similarity**: OpenSearch cosine similarity is already 0.0–1.0
- **Term similarity**: BM25 raw scores are unbounded; normalized by dividing by the max score in the result set
- **Combined**: Linear weighted average produces a 0.0–1.0 final score

### 4.4 Highlight Security

Highlighted text from OpenSearch may contain injected HTML. The frontend sanitizes it:

```typescript
import DOMPurify from 'dompurify'

const sanitized = DOMPurify.sanitize(highlight, {
  ALLOWED_TAGS: ['mark'],
  ALLOWED_ATTR: []
})
```

Only `<mark>` tags are allowed. All other HTML is stripped.

---

## 5. Frontend Components

### 5.1 RetrievalTestPanel

| Element | Type | Details |
|---------|------|---------|
| Query input | Textarea | Multi-line, placeholder: "Enter your test question..." |
| Method selector | Select | Options: Hybrid, Semantic, Full Text |
| Similarity threshold | Slider | Range 0–1, step 0.05, default 0.0 |
| Vector weight | Slider | Range 0–1, step 0.05, default 0.5. Only visible for hybrid method |
| Top-K | Number input | Range 1–100, default 10 |
| Run Test button | Button | Triggers API call, shows loading state |

### 5.2 ChunkResultCard

| Element | Details |
|---------|---------|
| Overall score | Badge: "92%" in primary color |
| Vector score | Badge: "Vector: 95%" in blue |
| Term score | Badge: "Term: 87%" in green |
| Token count | Badge: "245 tokens" in secondary |
| Content | Highlighted text with `<mark>` tags rendered as yellow highlights |
| Source | Document name as subtitle |

### 5.3 Hook: useRetrievalTest

```typescript
const { mutate: runTest, data, isPending } = useMutation({
  mutationFn: (params: RetrievalTestParams) =>
    datasetApi.runRetrievalTest(datasetId, params)
})
```

---

## 6. API Reference

```
POST /api/v1/datasets/:id/retrieval-test
Content-Type: application/json

{
  "question": "How to configure database connections?",
  "method": "hybrid",
  "similarity_threshold": 0.3,
  "vector_similarity_weight": 0.6,
  "top_k": 10
}

Response 200:
{
  "chunks": [
    {
      "id": "chunk-abc",
      "content_with_weight": "Configure the database connection string in config.ts...",
      "highlight": "Configure the <mark>database</mark> <mark>connection</mark> string in config.ts...",
      "similarity": 0.92,
      "vector_similarity": 0.95,
      "term_similarity": 0.87,
      "token_count": 245,
      "docnm_kwd": "setup-guide.pdf"
    }
  ]
}
```

---

## 7. Error Handling

| Scenario | Response | UI Behavior |
|----------|----------|-------------|
| Empty query | 400 | Validation error, input highlighted |
| No embedding model configured | 400 | Toast: "Configure an embedding model first" |
| No results found | 200 (empty) | "No matching chunks found" message |
| OpenSearch timeout | 504 | Toast error + retry option |
| Method is semantic but no embeddings | 400 | Toast: "Embeddings not generated for this dataset" |

---

## 8. Related Documents

- [Search Retrieval Pipeline](/detail-design/search/retrieval-detail)
- [Dataset Overview](/detail-design/dataset-document/dataset-overview)
