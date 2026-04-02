# RAG Pipeline — Retrieval Step: Basic Design

> **Module:** RAG Pipeline — Step 6: Query-Time Retrieval
> **Status:** Draft
> **Last Updated:** 2026-03-27
> **SRS Reference:** `docs/srs/core-platform/fr-retrieval-pipeline.md`
> **Upstream Reference:** RAGFlow `rag/nlp/search.py`, `rag/nlp/query.py`

## 1. Architecture Overview

The retrieval step is the **query-time** counterpart to the indexing pipeline. While indexing (Steps 1-5) prepares documents for search, retrieval transforms a user's natural-language question into ranked, relevant document chunks.

### 1.1 Where Retrieval Fits in the RAG Pipeline

```
 INDEXING TIME (Steps 1-5)
  Document -> Parse -> Chunk -> Embed -> Index (OpenSearch)

                         | OpenSearch |

 QUERY TIME (Step 6)
  User Query -> Preprocess -> Search -> Rerank -> Filter -> Assemble

 GENERATION TIME (Step 7)
  Context + Query -> LLM -> Answer -> Citation Insertion -> Response
```

### 1.2 Two Mutually Exclusive Execution Paths

B-Knowledge has **two retrieval implementations** — one in the Node.js backend and one in the Python worker. These paths are **mutually exclusive**: a single user query triggers ONLY ONE of them, never both simultaneously.

```
                        USER QUERY
                           |
            +--------------+--------------+
            |                             |
            v                             v
  Via Chat / Search UI           Via Agent Workflow
            |                             |
            v                             v
  +-------------------+        +---------------------+
  |  Node.js BE       |        |  Node.js Orchestrator|
  |  ragSearchService |        |  (agent-executor)    |
  |  queries OpenSearch|        |  topological sort    |
  |  DIRECTLY         |        +----------+----------+
  +---------+---------+                   |
            |                    Redis XADD to
            |                    "agent_execution_queue"
            |                             |
            |                             v
            |                   +---------------------+
            |                   |  Python Worker       |
            |                   |  agent_consumer.py   |
            |                   |  handle_retrieval()  |
            |                   |  settings.retriever  |
            |                   |  .retrieval()        |
            |                   +----------+----------+
            |                              |
            +---------------+--------------+
                            v
                 +--------------------+
                 |    OpenSearch      |
                 |  knowledge_{tid}   |
                 +--------------------+
```

| Path | When Used | Implementation | Key File |
|------|-----------|----------------|----------|
| **Node.js BE (Primary)** | Chat completion, Search Ask, Search Query, Retrieval Test | `rag-search.service.ts` | `be/src/modules/rag/services/rag-search.service.ts` |
| **Python Worker (Agent Only)** | Agent workflow retrieval nodes | `search.Dealer` | `advance-rag/rag/nlp/search.py` |

**Key facts:**
- **They never run concurrently for the same query.** Chat/Search always uses Node.js. Agent retrieval always uses Python.
- **Both query the same OpenSearch index** (`knowledge_{tenantId}`), but with different fusion weights and reranking logic (see Section 5).
- **Why Python exists for agents:** The Node.js orchestrator dispatches retrieval nodes to the Python worker via Redis Streams because agents need access to GPU models, the RAGFlow NLP stack (tokenization, term weighting, synonym expansion), and the embedding pipeline that runs in Python.
- **`retrieval_tool.py` is dead code.** The `RetrievalTool` class exists but is never called. The actual agent retrieval goes through `handle_retrieval()` in `node_executor.py`, which calls `settings.retriever.retrieval()` directly.

---

## 2. Component Architecture

### 2.1 Component Diagram

```
                     RETRIEVAL PIPELINE

  +------------------------------------------------------------+
  |                 1. QUERY PREPROCESSING                      |
  |                                                             |
  |  [CJK Normalize] [Language Detect] [Keyword Extract]       |
  |  [Multi-Turn Refine (LLM)] [Cross-Language Expand (LLM)]  |
  |  [Query String Construction: tokenize -> weight -> synonyms]|
  +-----------------------------+------------------------------+
                                |
                                v
  +------------------------------------------------------------+
  |                 2. SEARCH EXECUTION                         |
  |                                                             |
  |  [Full-Text (BM25+IDF)]   [Semantic (KNN+Cosine)]         |
  |  query_string with boosts   knn { q_N_vec } with filters  |
  |           |     Hybrid Fusion     |                        |
  |           +----------+------------+                        |
  |                      v                                     |
  |              [FusionExpr weighted_sum]                      |
  +-----------------------------+------------------------------+
                                |
                                v
  +------------------------------------------------------------+
  |                 3. POST-RETRIEVAL                            |
  |                                                             |
  |  [Reranking (Model or Hybrid)]                             |
  |  [Score Filtering and Threshold]                           |
  |  [Rank Features (PageRank + Tags)]                         |
  |  [Pagination] [Document Aggregation] [Highlight Extraction]|
  +-----------------------------+------------------------------+
                                |
                                v
  +------------------------------------------------------------+
  |                 4. CONTEXT ASSEMBLY                          |
  |                                                             |
  |  [Chunk Formatting] [Prompt Building] [Citation Insertion] |
  +------------------------------------------------------------+
```

### 2.2 Key Components and Responsibilities

| Component | Location | Responsibility |
|-----------|----------|----------------|
| **FulltextQueryer** | `advance-rag/rag/nlp/query.py` | Query parsing, tokenization, synonym expansion, query string construction |
| **Dealer (search)** | `advance-rag/rag/nlp/search.py` | Search orchestration, reranking, pagination, citation insertion |
| **RagTokenizer** | `advance-rag/rag/nlp/rag_tokenizer.py` | CJK-aware tokenization, fine-grained sub-word splitting |
| **TermWeight Dealer** | `advance-rag/rag/nlp/term_weight.py` | IDF computation, NER/POS multipliers, stop word filtering |
| **Synonym Dealer** | `advance-rag/rag/nlp/synonym.py` | Dictionary + WordNet synonym lookup |
| **OSConnection** | `advance-rag/rag/utils/opensearch_conn.py` | OpenSearch query execution, index management |
| **ragSearchService** | `be/src/modules/rag/services/rag-search.service.ts` | BE-side search orchestration (hybrid, text, semantic) |
| **ragRerankService** | `be/src/modules/rag/services/rag-rerank.service.ts` | BE-side reranking via external APIs |
| **ragCitationService** | `be/src/modules/rag/services/rag-citation.service.ts` | Post-LLM citation matching and insertion |
| **Embedding Models** | `advance-rag/rag/llm/embedding_model.py` | 25+ embedding providers (query encoding) |
| **Rerank Models** | `advance-rag/rag/llm/rerank_model.py` | 15+ reranking providers |

---

## 3. Data Flow

### 3.1 End-to-End Retrieval Flow (Chat Completion)

This is the **most complete** flow, used when a user sends a message in a chat assistant:

```
User Message: "What are the side effects of aspirin?"

--- STEP 1: Store and Load ---
  - Store user message to PostgreSQL (chat_messages)
  - Load ChatAssistant config (prompt_config, kb_ids)
  - Load last 20 conversation messages

--- STEP 2: Query Enhancement (Optional) ---
  IF refine_multiturn:
    LLM synthesizes conversation + question into coherent query
  IF cross_languages = "English,Vietnamese":
    LLM translates query, appended to original
  IF keyword = true:
    LLM extracts up to 8 keywords, appended to query

--- STEP 3: Search Execution ---
  ragSearchService.search({
    query: enhanced_query,
    method: 'hybrid',
    top_k: 6,
    similarity_threshold: 0.2,
    vector_similarity_weight: 0.3
  })
  Internally:
    1. Embed query -> float[1024]
    2. Build OpenSearch query (bool filter + query_string + knn)
    3. Execute against knowledge_{tenantId}
    4. Combine: textScore * 0.7 + vectorScore * 0.3

--- STEP 4: Reranking (Optional) ---
  IF rerank_id configured:
    ragRerankService.rerank() via Jina/Cohere/Generic API
    Hybrid: 0.3 * original + 0.7 * rerankScore
  ELSE:
    Use search scores as-is
  THEN add rank features:
    + PageRank boost (10x)
    + Tag relevance (cosine * 10)

--- STEP 5: Filter and Assemble ---
  1. Remove chunks below threshold (0.2)
  2. Return top 6 chunks
  3. Aggregate by document name
  4. Format as [ID:0][doc_name](p.1)\n chunk_text
  5. Build system prompt with language instruction + knowledge + citations

--- STEP 6: LLM Generation ---
  Stream LLM response via SSE (token deltas)
  After completion:
    ragCitationService.insertCitations()
      - Split answer into sentences
      - Embed sentences, match to chunks (threshold 0.63 -> 0.3)
      - Insert ##ID:n$$ markers
  Store assistant message
  Fire-and-forget memory extraction
```

### 3.2 Data Structures at Each Stage

#### Input: User Query
```typescript
{
  content: "What are the side effects of aspirin?",
  dialog_id: "uuid-of-chat-assistant",
  variables: {},
  metadata_condition: null,
  doc_ids: null
}
```

#### OpenSearch Query (Hybrid)
```json
{
  "query": {
    "knn": {
      "q_1024_vec": {
        "vector": [0.12, -0.34, 0.56, "...1024 floats..."],
        "k": 6,
        "filter": {
          "bool": {
            "must": [
              { "terms": { "kb_id": ["kb-uuid-1", "kb-uuid-2"] } },
              { "range": { "available_int": { "gte": 1 } } }
            ]
          }
        }
      }
    }
  },
  "highlight": {
    "fields": {
      "content_ltks": { "fragment_size": 200 },
      "title_tks": { "fragment_size": 100 }
    }
  },
  "_source": ["docnm_kwd", "content_ltks", "kb_id", "...15 more fields..."],
  "size": 6
}
```

#### Search Result (Per Chunk)
```typescript
{
  chunk_id: "xxh64-hash",
  content_with_weight: "Aspirin (acetylsalicylic acid) may cause...",
  doc_id: "doc-uuid",
  docnm_kwd: "Medication Guide 2024.pdf",
  kb_id: "kb-uuid-1",
  similarity: 0.87,           // Final combined score
  vector_similarity: 0.92,    // Cosine similarity only
  term_similarity: 0.76,      // BM25 text score only
  vector: [0.08, -0.21, ...], // Chunk embedding (for citations)
  important_kwd: ["aspirin", "side effects"],
  position_int: [[3, 120, 450, 200, 280]],
  page_num_int: [3],
  highlight: "<em>Aspirin</em> may cause stomach bleeding..."
}
```

#### LLM System Prompt (Assembled)
```
You MUST respond in English.

Role: You're a smart assistant...

### Information from knowledge bases

[ID:0][Medication Guide 2024.pdf](p.3)
Aspirin (acetylsalicylic acid) may cause stomach irritation,
bleeding, and allergic reactions in some patients...

[ID:1][Drug Safety Report.pdf](p.12)
Common side effects include nausea, heartburn, and...

When citing, use ##ID:n$$ format.

Remember: You MUST respond in English.
```

---

## 4. OpenSearch Index Design

### 4.1 Index Naming Convention

```
knowledge_{tenant_id}
```

Each tenant gets a dedicated OpenSearch index. This provides:
- **Hard isolation**: No cross-tenant data leakage possible
- **Independent scaling**: Hot tenants can have more shards
- **Clean deletion**: Drop index = remove all tenant data

**RAGFlow vs B-Knowledge:**

| Aspect | RAGFlow | B-Knowledge |
|--------|---------|-------------|
| Index prefix | `ragflow_` | `knowledge_` |
| Isolation level | Per-tenant | Per-tenant |
| Naming function | `index_name(uid)` in `search.py:33` | Same function, different prefix |

### 4.2 Field Categories

The OpenSearch index uses **dynamic templates** — fields are created automatically based on their suffix. This is how RAGFlow avoids explicit field declarations:

| Pattern | OpenSearch Type | Purpose |
|---------|----------------|---------|
| `*_tks` | text (scripted_sim) | Tokenized fields with custom IDF scoring |
| `*_ltks` | text (whitespace) | Lightweight tokenized fields (stored) |
| `*_with_weight` | text (standard) | Readable content with standard analyzer |
| `*_kwd`, `*_id` | keyword (boolean) | Exact match fields |
| `*_int`, `*_flt` | numeric | Integer and float fields |
| `*_fea` | rank_feature | Single rank feature score |
| `*_feas` | rank_features | Multiple rank feature scores (dict) |
| `*_{dim}_vec` | knn_vector (cosinesimil) | Vector fields by dimension |
| `*_dt`, `*_time`, `*_at` | date | Date/time fields |
| `*_nst` | nested | Nested objects |
| `*_obj` | object (dynamic) | Dynamic objects |
| `lat_lon` | geo_point | Geographic coordinates |

### 4.3 Key Chunk Fields

| Field | Type | Written By | Read By | Purpose |
|-------|------|-----------|---------|---------|
| `content_ltks` | `*_ltks` | Python indexer | Reranking, token similarity | Pre-tokenized content (whitespace-separated) |
| `content_with_weight` | `*_with_weight` | Python indexer | LLM prompt assembly | Human-readable text with standard analyzer |
| `content_sm_ltks` | `*_ltks` | Python indexer | Fine-grained text search | Fine-grained tokenized content |
| `title_tks` | `*_tks` | Python indexer | Full-text search (10x boost) | Document title tokens |
| `title_sm_tks` | `*_tks` | Python indexer | Full-text search (5x boost) | Fine-grained title tokens |
| `important_kwd` | `*_kwd` | Python indexer | Full-text search (30x boost) | Important extracted keywords |
| `important_tks` | `*_tks` | Python indexer | Full-text search (20x boost) | Tokenized important keywords |
| `question_tks` | `*_tks` | Python indexer | Full-text search (20x boost) | Auto-generated question tokens |
| `question_kwd` | `*_kwd` | Python indexer | Metadata display | Question keywords |
| `q_{dim}_vec` | `*_vec` | Python indexer | KNN vector search | Dense embedding vector |
| `doc_id` | `*_kwd` | Python indexer | Filtering | Parent document ID |
| `kb_id` | `*_kwd` | Python indexer | Filtering (mandatory) | Knowledge base ID |
| `available_int` | `*_int` | Python indexer + BE | Filtering (mandatory) | 1=visible, 0=hidden (TOC, RAPTOR, graph) |
| `pagerank_fea` | `*_fea` | Python indexer | Rank feature boost | Document importance score |
| `tag_feas` | `*_feas` | Python indexer | Rank feature boost | Tag relevance scores dict |
| `position_int` | `*_int` | Python indexer | PDF page highlighting | `[page, x1, x2, y1, y2]` |
| `mom_id` | `*_kwd` | Python indexer | Hierarchical retrieval | Parent chunk ID |
| `docnm_kwd` | `*_kwd` | Python indexer | Document aggregation | Document file name |

---

## 5. Search Method Design

### 5.1 Full-Text Search (BM25)

```
User Query: "aspirin side effects"
    |
    v
[Tokenize] -> ["aspirin", "side", "effects"]
    |
    v
[Weight (IDF)]
  aspirin -> 0.42, side -> 0.18, effects -> 0.22
    |
    v
[Expand Synonyms]
  aspirin -> [acetylsalicylic acid, ASA]
  effects -> [reactions, consequences]
    |
    v
[Build Query String]
  (aspirin^0.42 "acetylsalicylic acid" ASA)
  OR (side^0.18)
  OR (effects^0.22 reactions consequences)
  OR ("aspirin side"^0.84 "side effects"^0.44)   <-- 2x phrase boost
    |
    v
[OpenSearch query_string Query]
  fields: [important_kwd^30, question_tks^20,
           title_tks^10, content_ltks^2, ...]
  minimum_should_match: "30%"
```

### 5.2 Semantic Search (KNN)

```
User Query: "aspirin side effects"
    |
    v
[Embedding Model (encode_queries)]
  -> [0.12, -0.34, 0.56, ...] (1024 floats)
    |
    v
[OpenSearch KNN Query]
  field: q_1024_vec
  k: topk
  space_type: cosinesimil
  filter: { kb_id IN [...], available_int >= 1 }
```

### 5.3 Hybrid Search

```
  [Full-Text BM25 Score]    [Semantic Cosine Score]
           |                          |
           v                          v
                    FUSION

  Python (FusionExpr):
    score = 0.05 * text + 0.95 * vector
    (Hardcoded, OpenSearch-level fusion)

  Node.js (rag-search.service.ts):
    score = (1-w) * text + w * vector
    where w = vector_similarity_weight
    (Configurable, application-level)
```

**Design Decision: Why Two Different Fusion Implementations?**

The Python worker's hardcoded 5%/95% split is a RAGFlow design choice — heavily biased toward vector search because modern embeddings are generally more effective than keyword matching. The BE service uses a configurable default (30%/70%) to give admins more control, especially for domains where keyword matching is important (e.g., legal documents, medical terminology).

---

## 6. Reranking Architecture

### 6.1 Reranking Pipeline

```
Top-K Results from Search (30-64 chunks)
    |
    v
[Has Rerank Model?]
    |
    +--- YES: Model Reranking ---+--- NO: Hybrid Reranking ---+
    |                             |                             |
    | 1. Send query + chunks      | 1. Get token weights        |
    |    to external API          | 2. Get stored vectors       |
    | 2. Get relevance scores     | 3. Combine:                 |
    | 3. Combine:                 |    0.7*vec + 0.3*token      |
    |    0.3*orig + 0.7*rerank   |                              |
    +-----------------------------+-----------------------------+
                        |
                        v
              [Add Rank Features]
              + PageRank (10x boost)
              + Tag Similarity (10x)
                        |
                        v
              [Sort -> Filter -> Paginate]
```

### 6.2 Token Similarity Algorithm

Token similarity is the keyword-based component of hybrid reranking. It uses IDF-weighted term overlap:

```
Query tokens: ["aspirin", "side", "effects"]
Query weights (IDF): {aspirin: 0.42, side: 0.18, effects: 0.22}

For each chunk, build weighted token dict:
  Single tokens: weight * 0.4
  Bigrams:       max(weight_a, weight_b) * 0.6

  chunk_dict = {
    "aspirin":       0.42 * 0.4 = 0.168,
    "aspirin side":  max(0.42, 0.18) * 0.6 = 0.252,
    "side":          0.18 * 0.4 = 0.072,
    "side effects":  max(0.18, 0.22) * 0.6 = 0.132,
    "effects":       0.22 * 0.4 = 0.088
  }

Similarity = sum(overlapping_weights) / sum(query_weights)
```

---

## 7. Configuration Parameters

### 7.1 Retrieval Configuration Hierarchy

Configuration can be set at multiple levels. Lower levels override higher:

```
Level 1: Knowledge Base (knowledgebase table)
  similarity_threshold, vector_similarity_weight, embd_id, pagerank

Level 2: Chat Assistant (chat_assistants.prompt_config)
  top_n, similarity_threshold, vector_similarity_weight
  rerank_id, refine_multiturn, cross_languages, keyword
  toc_enhance, empty_response, use_kg, reasoning, allow_rbac_datasets

Level 3: Search App (search_apps.search_config)
  top_k, search_method, similarity_threshold
  vector_similarity_weight, rerank_id, rerank_top_k
  empty_response, tag_ranking_enabled

Level 4: Agent Node (node config)
  kb_ids, top_k, similarity, vector_similarity_weight

Level 5: Per-Request (API request body)
  doc_ids, metadata_condition
```

### 7.2 Default Values

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `search_method` | `hybrid` | `full_text`, `semantic`, `hybrid` | Search strategy |
| `top_n` / `top_k` | 6 (chat), 8 (agent) | 1-100 | Chunks returned to LLM |
| `similarity_threshold` | 0.2 | 0.0-1.0 | Minimum score to include |
| `vector_similarity_weight` | 0.3 (BE), 0.7 (Python rerank) | 0.0-1.0 | Vector vs text balance |
| `RERANK_LIMIT` | 30-64 | >=30 | Candidates for reranking |
| `minimum_should_match` | 30% | 10%-100% | BM25 minimum match percentage |
| `EMBEDDING_BATCH_SIZE` | 16 | 1-96 | Batch size for embedding |
| `DOC_BULK_SIZE` | 4 | 1-100 | Chunks per bulk insert |

---

## 8. RAGFlow vs B-Knowledge Comparison

### 8.1 Architecture Differences

| Aspect | RAGFlow | B-Knowledge |
|--------|---------|-------------|
| **Retrieval location** | Python worker only | Node.js BE (primary) + Python (agent path) |
| **Index prefix** | `ragflow_` | `knowledge_` |
| **Fusion weights** | Hardcoded 5%/95% | Configurable (default 30%/70% in BE) |
| **Reranking** | Python-side hybrid or model | BE-side API call or Python-side |
| **Citation** | Python `insert_citations()` | Node.js `ragCitationService` (ported) |
| **Multi-turn refinement** | Dialog-level | Configurable per assistant |
| **Cross-language** | Not available | LLM-based translation expansion |
| **RBAC filtering** | Basic tenant isolation | CASL ABAC + tenant isolation |
| **Metadata filtering** | Limited | Full condition builder (is, contains, gt, lt, range) |

### 8.2 Preserved from RAGFlow (1:1 Port)

These components are ported **exactly** from RAGFlow with minimal changes:

1. **Query processing** — `FulltextQueryer.question()` method
2. **Term weighting** — IDF formula, NER/POS multipliers, stop words
3. **Synonym expansion** — Dictionary + WordNet fallback
4. **Tokenization** — `rag_tokenizer` (Infinity-based)
5. **OpenSearch mapping** — `os_mapping.json` field templates
6. **Field boosting** — Same boost values (30x, 20x, 10x, etc.)
7. **Hybrid similarity** — `hybrid_similarity()` and `token_similarity()` functions
8. **Citation insertion** — Sentence splitting + adaptive threshold algorithm
9. **Chunk deduplication** — `xxhash` based chunk IDs

### 8.3 Modified from RAGFlow

| Component | RAGFlow Behavior | B-Knowledge Change | Reason |
|-----------|-----------------|-------------------|--------|
| Index prefix | `ragflow_` | `knowledge_` | Brand consistency |
| Fusion in BE | N/A (Python only) | Configurable weight | Admin control |
| Multi-dataset | Single tenant | RBAC expansion | Enterprise features |
| Metadata filter | Basic | Full condition builder | Power users |
| Reranking API | Python rerank models | Node.js HTTP to providers | Service separation |
| Cross-language | Not supported | LLM translation expansion | Multilingual users |

---

## 9. Error Handling Strategy

### 9.1 Retry Chain

```
Search Request
    |
    v
Execute hybrid search (min_match=30%, threshold=configured)
    |
    +--- 0 results? ---+--- Has results -> Return results
    |                   |
    v                   |
Has doc_ids?            |
    |                   |
    +--- YES: Return empty (user asked for specific docs)
    |
    +--- NO: Retry with min_match=10%, threshold=0.17
              |
              +--- 0 results? -> Return empty
              |
              +--- Has results -> Return results
```

### 9.2 OpenSearch Connection Resilience

| Error | Handling |
|-------|----------|
| Connection timeout | Retry up to 3 times with 600s timeout |
| Timed out response | Raise exception (logged) |
| Index not found | Return empty results |
| Embedding dimension mismatch | Log warning, use zero vector |
| Reranker API failure | Fall back to hybrid similarity reranking |

---

## 10. Performance Considerations

### 10.1 Concurrency Controls (Python Worker)

| Semaphore | Limit | Purpose |
|-----------|-------|---------|
| `task_limiter` | 5 | Concurrent document processing tasks |
| `chunk_limiter` | 1 | Chunk building (CPU-bound) |
| `embed_limiter` | 1 | Embedding generation (GPU/API-bound) |
| `minio_limiter` | 10 | MinIO file operations |
| `kg_limiter` | 2 | Knowledge graph tasks |

### 10.2 Batch Processing

| Operation | Batch Size | Note |
|-----------|-----------|------|
| Embedding generation | 16 | OpenAI limit; configurable for local models |
| OpenSearch bulk insert | 4 | `DOC_BULK_SIZE` constant |
| Citation embedding | All sentences at once | Single batch call |
| Reranking | All candidates at once | RERANK_LIMIT (30-64) |

### 10.3 Caching

| Cache | Storage | TTL | Purpose |
|-------|---------|-----|---------|
| LLM results (keywords, questions) | Redis | Persistent | Avoid re-generating chunk metadata |
| Tag features | Redis | Session-based | Pre-computed tag vectors |
| Pipeline logs | Redis | 30 min | Component execution traces |
| Synonym dictionary | Memory | Process lifetime | Static dictionary loaded once |
| Term frequency data | Memory | Process lifetime | IDF computation |

---

## 11. Monitoring and Observability

### 11.1 Key Metrics to Monitor

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Search latency P95 | OpenSearch slow log | > 500ms |
| Zero-result rate | Query logs | > 20% of queries |
| Embedding latency | LLM provider metrics | > 200ms |
| Reranker latency | API response time | > 300ms |
| OpenSearch cluster health | `_cluster/health` | Yellow/Red |
| Index size per tenant | `_cat/indices` | > 10GB per index |

### 11.2 Query Logging

Every search query is logged to the `query_logs` table (fire-and-forget):

| Field | Description |
|-------|-------------|
| `source` | `chat` or `search` |
| `source_id` | Assistant or search app ID |
| `user_id` | Who searched |
| `query` | The search text |
| `dataset_ids` | Which KBs were searched |
| `result_count` | How many chunks returned |
| `confidence_score` | Average similarity score |
| `response_time_ms` | Total retrieval time |
| `failed_retrieval` | Boolean failure flag |
