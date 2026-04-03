# FR-RETRIEVAL — Retrieval Pipeline Functional Requirements

> **Module:** RAG Pipeline — Retrieval Step
> **Status:** Draft
> **Last Updated:** 2026-03-27
> **Upstream Reference:** RAGFlow `rag/nlp/search.py`, `rag/nlp/query.py`

## 1. Overview

The Retrieval Pipeline is the core search subsystem that transforms a user's natural-language query into a ranked set of relevant document chunks from OpenSearch. It is the bridge between user intent and LLM context — everything the LLM "knows" about the user's data comes from this pipeline.

### 1.1 Scope

This SRS covers the **query-time retrieval flow** — from the moment a user submits a question to the moment ranked chunks are ready for LLM prompt assembly. It does NOT cover:

- Document ingestion, parsing, or chunking (see FR-DOCUMENT-PROCESSING)
- Embedding generation during indexing (see FR-RAG-STRATEGY)
- LLM answer generation or streaming (see FR-CHAT, FR-SEARCH)
- Knowledge Graph retrieval (see FR-AGENTS)

### 1.2 Entry Points

The retrieval pipeline is invoked from five entry points across two **mutually exclusive** execution paths. A single query triggers only ONE path — they never run concurrently for the same request.

**Path A — Node.js BE (Primary):** Handles all chat and search queries directly in the backend.

| Entry Point | Module | Trigger | Response Type |
|-------------|--------|---------|---------------|
| **Chat Completion** | `chat-conversation.service.ts` | User sends message in chat assistant | SSE stream with chunks + LLM answer |
| **Search Ask** | `search.service.ts` | User asks a question in search app | SSE stream with chunks + LLM answer |
| **Search Query** | `search.service.ts` | User executes keyword/semantic search | JSON with ranked chunks (no LLM) |
| **Retrieval Test** | `search.service.ts` | Admin tests retrieval config | JSON with ranked chunks + scores |

**Path B — Python Worker (Agent Only):** Handles retrieval nodes within agent workflows. The Node.js orchestrator dispatches to Python via Redis Streams because agents need access to the RAGFlow NLP stack (tokenization, term weighting, synonym expansion, embedding models).

| Entry Point | Module | Trigger | Response Type |
|-------------|--------|---------|---------------|
| **Agent Retrieval Node** | `node_executor.py` | Agent workflow retrieval step | Chunks returned to agent graph via Redis pub/sub |

Both paths query the **same OpenSearch index** (`knowledge_{tenantId}`).

### 1.3 Actors

| Actor | Role |
|-------|------|
| **End User** | Submits questions via chat or search UI |
| **Data Studio Admin** | Configures retrieval parameters (top-k, threshold, method, reranker) |
| **Agent Builder** | Configures retrieval nodes in agent canvas |
| **System (LLM)** | Consumes retrieved chunks as context for answer generation |

---

## 2. Functional Requirements

### FR-RET-001: Search Method Selection

**Description:** The system SHALL support three retrieval methods that can be configured per chat assistant or search app.

| Method | ID | Description |
|--------|----|-------------|
| **Full-Text Search** | `full_text` | BM25 keyword matching on tokenized content fields. No embedding model required. |
| **Semantic Search** | `semantic` | Dense vector similarity search using embedding model. Requires embedding model. |
| **Hybrid Search** | `hybrid` | Combines full-text and semantic search with configurable weight ratio. Default method. |

**Acceptance Criteria:**
- AC-001.1: When `search_method = 'full_text'`, the system MUST NOT call the embedding model
- AC-001.2: When `search_method = 'semantic'`, the system MUST embed the query before searching
- AC-001.3: When `search_method = 'hybrid'`, the system MUST execute both full-text and semantic searches and combine results using the configured `vector_similarity_weight`
- AC-001.4: If no search method is explicitly configured, the system MUST default to `hybrid`

**RAGFlow Comparison:**
- RAGFlow uses identical three methods. B-Knowledge preserves this 1:1.
- RAGFlow's hybrid fusion weights are hardcoded (`0.05` text / `0.95` vector) in the Python worker. B-Knowledge's BE service uses configurable `vector_similarity_weight` (default `0.3`) applied differently — see FR-RET-008.

---

### FR-RET-002: Query Preprocessing

**Description:** The system SHALL preprocess user queries before search execution to maximize recall across languages.

**Sub-requirements:**

#### FR-RET-002a: CJK Text Normalization

| Step | Operation | Example |
|------|-----------|---------|
| 1 | Full-width → Half-width conversion (`strQ2B`) | `Ｈｅｌｌｏ` → `Hello` |
| 2 | Traditional → Simplified Chinese (`tradi2simp`) | `資料庫` → `资料库` |
| 3 | Insert spaces between English and CJK characters | `hello世界` → `hello 世界` |
| 4 | Remove special characters | `[ :|\r\n\t,，。？?/!！&^%%(){}〈〉]+` stripped |
| 5 | URL removal (`rmWWW`) | `https://example.com` → removed |

**Acceptance Criteria:**
- AC-002a.1: Queries containing Traditional Chinese MUST be converted to Simplified before tokenization
- AC-002a.2: Full-width characters (common in Japanese/Chinese input) MUST be normalized to half-width
- AC-002a.3: Mixed English-CJK text MUST have spaces inserted at language boundaries for correct tokenization

#### FR-RET-002b: Language Detection

**Description:** The system SHALL detect the query language to apply appropriate processing paths.

| Detection Rule | Result |
|---------------|--------|
| Tokens split by space ≤ 3 | Classified as Chinese |
| English tokens < 30% of total | Classified as Chinese |
| English tokens ≥ 30% of total | Classified as English |

**Acceptance Criteria:**
- AC-002b.1: Short queries (≤3 tokens) MUST be treated as Chinese to ensure fine-grained tokenization
- AC-002b.2: The detection function `is_chinese()` MUST be used consistently across query processing and reranking

#### FR-RET-002c: Multi-Turn Question Refinement (Optional)

**Description:** When enabled (`refine_multiturn = true` in prompt_config), the system SHALL use an LLM to synthesize conversation history + current question into a single coherent search query.

**Acceptance Criteria:**
- AC-002c.1: Refinement MUST only trigger when `refine_multiturn` is enabled AND conversation has ≥1 prior turn
- AC-002c.2: The refined query MUST be used for retrieval instead of the raw user message
- AC-002c.3: The original user message MUST still be stored in chat history unchanged

#### FR-RET-002d: Cross-Language Query Expansion (Optional)

**Description:** When enabled (`cross_languages` is set, e.g., `"English,Vietnamese,Japanese"`), the system SHALL translate the query into specified languages and append translations to the search query.

**Acceptance Criteria:**
- AC-002d.1: Each target language MUST receive a separate LLM translation call
- AC-002d.2: All translations MUST be appended to the original query (not replace it)
- AC-002d.3: Cross-language expansion MUST happen BEFORE retrieval, not after

#### FR-RET-002e: Keyword Extraction (Optional)

**Description:** When enabled (`keyword = true` in prompt_config), the system SHALL extract up to 8 keywords from the query using an LLM and append them to improve keyword search recall.

**Acceptance Criteria:**
- AC-002e.1: Extracted keywords MUST be appended to the query string for retrieval
- AC-002e.2: Maximum of 8 keywords MUST be extracted per query

---

### FR-RET-003: Tokenization and Term Weighting

**Description:** The system SHALL tokenize queries and compute term importance weights for full-text and hybrid search.

#### FR-RET-003a: Tokenization

| Language | Tokenizer | Behavior |
|----------|-----------|----------|
| Chinese/Japanese/Korean | `rag_tokenizer` (Infinity-based) | Character-level + dictionary-based segmentation |
| English | `rag_tokenizer` | Whitespace + punctuation splitting |
| Fine-grained | `fine_grained_tokenize()` | Decomposes CJK multi-char tokens (≥3 chars) into character-level sub-tokens |

**Acceptance Criteria:**
- AC-003a.1: CJK text MUST be tokenized using the specialized `rag_tokenizer`, NOT simple whitespace splitting
- AC-003a.2: CJK tokens with length ≥ 3 MUST undergo fine-grained tokenization for sub-word matching
- AC-003a.3: English text MUST be tokenized by whitespace after normalization

#### FR-RET-003b: Term Weight Computation (IDF-Based)

**Description:** Each token MUST be assigned an importance weight using a composite IDF formula.

**Formula:**
```
idf1 = log10(10 + (10,000,000 - freq + 0.5) / (freq + 0.5))
idf2 = log10(10 + (1,000,000,000 - df + 0.5) / (df + 0.5))
combined_idf = 0.3 × idf1 + 0.7 × idf2
final_weight = combined_idf × ner_multiplier × pos_multiplier
```

**NER Multipliers:**

| Entity Type | Multiplier | Examples |
|-------------|-----------|----------|
| `toxic` | 2.0 | Toxic substances |
| `corp`, `loca`, `sch`, `stock` | 3.0 | Companies, locations, schools, stock codes |
| `func` | 1.0 | Function names |
| `firstnm` | 1.0 | First names |
| Numbers | 2.0 | Numeric values |
| Short letters (1-2 chars) | 0.01 | Abbreviations |

**POS (Part-of-Speech) Multipliers:**

| POS Tag | Multiplier | Category |
|---------|-----------|----------|
| `r`, `c`, `d` | 0.3 | Pronouns, conjunctions, adverbs |
| `ns`, `nt` | 3.0 | Place names, organization names |
| `n` | 2.0 | Common nouns |
| Others | 1.0 | Default |

**Acceptance Criteria:**
- AC-003b.1: Term weights MUST be normalized (sum to 1.0) across all tokens in a query
- AC-003b.2: Stop words (61 Chinese stop words + common words) MUST be filtered before weighting
- AC-003b.3: Named entities (locations, organizations, stock codes) MUST receive 3× weight boost
- AC-003b.4: Function words (pronouns, conjunctions) MUST be down-weighted to 0.3×

#### FR-RET-003c: Synonym Expansion

**Description:** Each query token SHALL be expanded with synonyms from multiple sources.

| Source | Priority | Max Results |
|--------|----------|-------------|
| Custom dictionary (`rag/res/synonym.json`) | 1 (highest) | 8 |
| Redis cache (`kevin_synonyms`) | 2 | Dynamic |
| WordNet (English only) | 3 (fallback) | 8 |

**Acceptance Criteria:**
- AC-003c.1: Synonym weights MUST be reduced to 25% of the original token weight (divided by 4)
- AC-003c.2: Maximum 8 synonyms per token
- AC-003c.3: WordNet lookup MUST only apply to pure alphabetical tokens

---

### FR-RET-004: Full-Text Search (BM25)

**Description:** The system SHALL execute full-text queries against OpenSearch using query_string syntax with field-level boosting.

#### FR-RET-004a: Field Boosting Configuration

| Field | Boost Factor | Purpose |
|-------|-------------|---------|
| `important_kwd` | 30× | Manually assigned important keywords |
| `important_tks` | 20× | Tokenized important keywords |
| `question_tks` | 20× | Auto-generated question tokens |
| `title_tks` | 10× | Document title tokens |
| `title_sm_tks` | 5× | Fine-grained title tokens |
| `content_ltks` | 2× | Main content tokens |
| `content_sm_ltks` | 1× (default) | Fine-grained content tokens |

**Acceptance Criteria:**
- AC-004a.1: Important keywords MUST receive the highest boost (30×)
- AC-004a.2: Title fields MUST be boosted 5-10× above content
- AC-004a.3: All boost values MUST match the RAGFlow field weights listed above

#### FR-RET-004b: Query String Construction

**Description:** The system SHALL construct OpenSearch `query_string` queries with:

| Feature | Implementation |
|---------|---------------|
| Token weighting | `token^weight` syntax |
| Synonym inclusion | `(token^weight synonym1 synonym2)` grouping |
| Proximity matching | `"token1 token2"~2` for adjacent terms |
| Phrase boosting | Adjacent tokens get 2× weight as phrase |
| Minimum should match | Default 30%, relaxed to 10% on zero results |

**Acceptance Criteria:**
- AC-004b.1: Query string MUST use Lucene `query_string` syntax (NOT `match` or `multi_match`)
- AC-004b.2: Consecutive tokens MUST be combined into proximity phrases with 2× boost
- AC-004b.3: `minimum_should_match` MUST start at 30% and relax to 10% on retry

#### FR-RET-004c: OpenSearch Text Similarity

**Description:** The OpenSearch index MUST use a custom scripted similarity for `*_tks` fields:

```
score = sqrt(log((1 + docCount - termFreq + 0.5) / (termFreq + 0.5)))
```

**Acceptance Criteria:**
- AC-004c.1: The scripted similarity MUST be configured in `conf/os_mapping.json`
- AC-004c.2: Only `*_tks` fields (NOT `*_ltks` or `*_kwd`) MUST use the scripted similarity

---

### FR-RET-005: Semantic Search (Vector/KNN)

**Description:** The system SHALL execute dense vector similarity search using OpenSearch's KNN plugin.

#### FR-RET-005a: Query Embedding

| Parameter | Value |
|-----------|-------|
| Method | `emb_mdl.encode_queries(query_text)` |
| Output | Single vector (float array) |
| Dimension | Dynamic (384, 768, 1024, 1536, 2048, 4096, 6144, 8192, 10240) |
| Field naming | `q_{dimension}_vec` (e.g., `q_1024_vec`) |

**Supported Embedding Models:**

| Provider | Class | Max Tokens | Batch Size |
|----------|-------|------------|------------|
| HuggingFace TEI (built-in) | `BuiltinEmbed` | 500-30,000 | 16 |
| OpenAI | `OpenAIEmbed` | 8,191 | 16 |
| Ollama/LocalAI | `LocalAIEmbed` | Model-dependent | 16 |
| Jina | `JinaEmbed` | Model-dependent | 16 |
| Cohere | `CoHereEmbed` | Model-dependent | 96 |
| AWS Bedrock | `BedrockEmbed` | Model-dependent | 16 |
| Google Gemini | `GeminiEmbed` | Model-dependent | 16 |

**Acceptance Criteria:**
- AC-005a.1: Query embedding MUST use `encode_queries()` (NOT `encode()`) for query-specific optimizations
- AC-005a.2: The vector field name MUST match the embedding dimension: `q_{dim}_vec`
- AC-005a.3: All knowledge bases searched together MUST use the same embedding model

#### FR-RET-005b: KNN Search Execution

| Parameter | Value |
|-----------|-------|
| Distance metric | Cosine similarity |
| k (neighbors) | Configurable `topk` (default 1024 in Python, configurable in BE) |
| Filter | Bool query (kb_id, doc_id, available_int, entity filters) |
| Similarity threshold | Configurable (default 0.1 in Python search, 0.2 in BE config) |

**Acceptance Criteria:**
- AC-005b.1: KNN search MUST apply the same bool filters as full-text search
- AC-005b.2: Results below the similarity threshold MUST be excluded
- AC-005b.3: KNN MUST use `cosinesimil` space type (configured in index mapping)

---

### FR-RET-006: Hybrid Search Fusion

**Description:** The system SHALL combine full-text and semantic search results using weighted fusion.

#### FR-RET-006a: Python Worker Fusion (advance-rag)

| Component | Weight | Description |
|-----------|--------|-------------|
| Text score (BM25) | 5% (`0.05`) | OpenSearch BM25 score |
| Vector score (cosine) | 95% (`0.95`) | Dense embedding similarity |
| Fusion method | `weighted_sum` | OpenSearch `FusionExpr` |

**Note:** These weights are **hardcoded** in `search.py:127` and NOT configurable per-request.

#### FR-RET-006b: Backend Service Fusion (BE)

| Component | Weight | Description |
|-----------|--------|-------------|
| Text score | `1 - vector_similarity_weight` | Normalized BM25 score |
| Vector score | `vector_similarity_weight` (default 0.3) | Normalized cosine similarity |
| Fusion method | Score normalization + weighted sum | Custom in `rag-search.service.ts` |

**Acceptance Criteria:**
- AC-006.1: Both text and vector scores MUST be normalized to [0, 1] before combining
- AC-006.2: The `vector_similarity_weight` parameter MUST be configurable per chat assistant and per search app
- AC-006.3: When `vector_similarity_weight = 0`, the system MUST behave as pure full-text search
- AC-006.4: When `vector_similarity_weight = 1`, the system MUST behave as pure semantic search

**RAGFlow Comparison:**
- RAGFlow hardcodes fusion at 5%/95% (heavily vector-biased) in `FusionExpr`
- B-Knowledge BE uses a configurable default of 30%/70% (less vector-biased) applied in the Node.js layer
- This is a **deliberate divergence** — B-Knowledge gives admins more control over the text-vs-vector balance

---

### FR-RET-007: Filtering and Access Control

**Description:** The system SHALL enforce mandatory filters on every search query.

#### FR-RET-007a: Mandatory Filters

| Filter | Field | Type | Description |
|--------|-------|------|-------------|
| Tenant isolation | Index name | Index-level | `knowledge_{tenantId}` — each tenant gets a separate OpenSearch index |
| Knowledge base | `kb_id` | `terms` | Restricts to configured KB IDs |
| Availability | `available_int` | `range` | Excludes hidden chunks (TOC, RAPTOR mothers, graph entities) with `available_int < 1` |

#### FR-RET-007b: Optional Filters

| Filter | Field | Type | Description |
|--------|-------|------|-------------|
| Document filter | `doc_id` | `terms` | Restrict to specific documents |
| Entity filter | `entity_kwd` | `term` | Knowledge graph entity matching |
| Removed filter | `removed_kwd` | `must_not` | Exclude removed entities |
| Metadata filter | Dynamic | `term`/`range`/`terms` | User-defined metadata conditions |

#### FR-RET-007c: RBAC/ABAC Dataset Expansion

**Description:** When `allow_rbac_datasets = true`, the system SHALL expand retrieval to all knowledge bases the user has permission to access (via CASL ability checks), not just the explicitly linked KBs.

**Acceptance Criteria:**
- AC-007c.1: ABAC filters MUST be applied per-user, per-request using `buildOpenSearchAbacFilters()`
- AC-007c.2: Even with RBAC expansion, tenant isolation (index-level) MUST still be enforced
- AC-007c.3: Maximum 20 knowledge bases per multi-dataset search query

#### FR-RET-007d: Metadata Filtering

**Description:** Users MAY define metadata filter conditions with boolean logic.

```typescript
{
  logic: 'and' | 'or',
  conditions: [
    { name: 'author', comparison_operator: 'is', value: 'John' },
    { name: 'year', comparison_operator: 'gt', value: 2020 },
    { name: 'category', comparison_operator: 'contains', value: 'AI' }
  ]
}
```

**Supported Operators:** `is`, `is_not`, `contains`, `gt`, `lt`, `range`

**Acceptance Criteria:**
- AC-007d.1: All operators MUST be translated to valid OpenSearch query clauses
- AC-007d.2: `and` logic MUST use `must` clause; `or` logic MUST use `should` clause
- AC-007d.3: Metadata filters MUST be applied BEFORE scoring (as filter context, not query context)

---

### FR-RET-008: Reranking

**Description:** The system SHALL support optional post-retrieval reranking to improve result quality.

#### FR-RET-008a: Hybrid Similarity Reranking (Default)

**Description:** When no dedicated reranking model is configured, the system SHALL rerank results using a hybrid of token similarity and vector similarity.

**Formula:**
```
hybrid_score = vector_sim × vtweight + token_sim × tkweight
```

**Token Similarity Construction:**
- Each chunk's token list is weighted by field importance:
  - `content_ltks` × 1 (base weight)
  - `title_tks` × 2
  - `important_kwd` × 5
  - `question_tks` × 6
- Token overlap computed using IDF-weighted Jaccard-like similarity
- Bigram matching (consecutive tokens) weighted at 60%, unigrams at 40%

**Default Weights:** `tkweight = 0.3`, `vtweight = 0.7`

#### FR-RET-008b: Model-Based Reranking (Optional)

**Description:** When a reranking model is configured (`rerank_id` in prompt_config), the system SHALL use a dedicated cross-encoder model.

**Supported Reranking Providers:**

| Provider | API Format | Score Type |
|----------|-----------|------------|
| Jina | `POST /v1/rerank` | `relevance_score` |
| Cohere | `POST /v2/rerank` (fallback v1) | `relevance_score` |
| NVIDIA | `POST /rerank` | `logit` |
| XInference | `POST /rerank` | `relevance_score` |
| Generic (BAAI, etc.) | OpenAI-compatible | Normalized score |

**Score Combination with Original:**
```
final_score = tkweight × original_score + vtweight × rerank_score
Default: tkweight = 0.3, vtweight = 0.7
```

**Acceptance Criteria:**
- AC-008b.1: All reranker scores MUST be normalized to [0, 1] before combination
- AC-008b.2: Reranking MUST only process the top RERANK_LIMIT results (30-64), NOT all results
- AC-008b.3: If reranker API fails, the system MUST fall back to hybrid similarity reranking

#### FR-RET-008c: Rank Feature Boosting

**Description:** The system SHALL support additional scoring features beyond text/vector similarity.

| Feature | Field | Boost | Description |
|---------|-------|-------|-------------|
| PageRank | `pagerank_fea` | 10× | Document version recency / importance score |
| Tag relevance | `tag_feas.*` | 1-10× | Cosine similarity between query tags and chunk tags |

**Tag Feature Formula:**
```
tag_score = dot(query_tags, doc_tags) / (√(doc_tag_norm) × √(query_tag_norm)) × 10
final_score = hybrid_score + tag_score + pagerank_score
```

**Acceptance Criteria:**
- AC-008c.1: PageRank MUST use OpenSearch `rank_feature` query with `linear` function
- AC-008c.2: Tag features MUST be computed as cosine similarity with 10× multiplier
- AC-008c.3: Rank features MUST be additive (not multiplicative) with the base similarity score

---

### FR-RET-009: Score Filtering and Pagination

**Description:** The system SHALL filter results by similarity threshold and support pagination.

#### FR-RET-009a: Similarity Threshold

| Scenario | Threshold Behavior |
|----------|-------------------|
| Normal retrieval | Apply configured threshold (default 0.2) |
| `vector_similarity_weight = 0` (text-only) | Threshold = 0 (token scores not comparable) |
| Explicit `doc_ids` filter | Threshold = 0 (user explicitly requested these docs) |
| Python worker search | Initial threshold 0.1, relaxed to 0.17 on retry |

**Acceptance Criteria:**
- AC-009a.1: Results below the similarity threshold MUST be excluded from the final result set
- AC-009a.2: When doc_ids are explicitly provided, threshold MUST be bypassed (set to 0)
- AC-009a.3: When using pure text search (weight=0), threshold MUST be bypassed

#### FR-RET-009b: Pagination

| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | 1-based page number |
| `page_size` | 8 | Results per page |
| `RERANK_LIMIT` | 30-64 | Total results fetched for reranking before pagination |
| `topk` | 1024 | Maximum total results from OpenSearch |

**RERANK_LIMIT Calculation:**
```
RERANK_LIMIT = ceil(64 / page_size) × page_size
RERANK_LIMIT = max(30, RERANK_LIMIT)
```

**Acceptance Criteria:**
- AC-009b.1: RERANK_LIMIT MUST always be a multiple of page_size
- AC-009b.2: RERANK_LIMIT MUST be at least 30
- AC-009b.3: Page numbers MUST wrap (modulo) if they exceed available pages

---

### FR-RET-010: Result Assembly and Output

**Description:** The system SHALL return structured chunk results with all fields required by downstream consumers.

#### FR-RET-010a: Chunk Result Fields

| Field | Type | Description |
|-------|------|-------------|
| `chunk_id` | string | Unique chunk identifier |
| `content_with_weight` | string | Readable text content (used in LLM prompt) |
| `content_ltks` | string | Pre-tokenized content (used for token similarity) |
| `doc_id` | string | Parent document ID |
| `docnm_kwd` | string | Parent document name |
| `kb_id` | string | Knowledge base ID |
| `similarity` | float | Final combined score |
| `vector_similarity` | float | Vector-only score component |
| `term_similarity` | float | Keyword-only score component |
| `vector` | float[] | Chunk embedding (used for citation matching) |
| `important_kwd` | string[] | Important keywords |
| `question_kwd` | string[] | Associated questions |
| `position_int` | int[][] | Page positions `[[page, x1, x2, y1, y2], ...]` |
| `page_num_int` | int[] | Page numbers |
| `img_id` | string | Associated image ID |
| `highlight` | string | Highlighted snippet with `<em>` tags |
| `doc_type_kwd` | string | Document type |
| `mom_id` | string | Parent chunk ID (hierarchical) |

#### FR-RET-010b: Document Aggregation

**Description:** The system SHALL aggregate results by document name, counting chunks per document and sorting by count descending.

**Acceptance Criteria:**
- AC-010b.1: Aggregation MUST use OpenSearch `terms` aggregation on `docnm_kwd`
- AC-010b.2: Results MUST be sorted by chunk count descending
- AC-010b.3: Aggregation MUST be returned alongside chunk results for the sources panel

#### FR-RET-010c: Agent Retrieval Output

**Description:** When retrieval is invoked from an agent node, the system SHALL strip internal fields before returning.

**Stripped Fields:** `vector`, `content_ltks` (not needed by downstream agent nodes)

**Acceptance Criteria:**
- AC-010c.1: Agent retrieval MUST NOT include embedding vectors in output
- AC-010c.2: Agent retrieval MUST format chunks as numbered list: `[1] chunk_text...`

---

### FR-RET-011: Citation Insertion (Post-LLM)

**Description:** After the LLM generates an answer, the system SHALL match answer sentences to source chunks and insert citation markers.

#### FR-RET-011a: Sentence Splitting

**Description:** The LLM answer MUST be split into sentences using multi-language-aware rules.

**Supported sentence terminators:** `. ? ! ; 。 ？ ！ ； ، ؛ ؟ ۔` + newlines

**Acceptance Criteria:**
- AC-011a.1: Code blocks (``` markers) MUST be excluded from sentence splitting
- AC-011a.2: Sentences shorter than 5 characters MUST be skipped
- AC-011a.3: Arabic, Chinese, English, and Vietnamese punctuation MUST all be recognized

#### FR-RET-011b: Citation Matching

**Description:** Each answer sentence MUST be matched to source chunks using hybrid similarity.

**Algorithm:**
1. Embed all answer sentences using the same embedding model
2. Compute `hybrid_similarity = 0.9 × cosine_sim + 0.1 × jaccard_sim`
3. Apply adaptive threshold: start at 0.63, decay by 20% until matches found (min 0.3)
4. Assign up to 4 chunk matches per sentence

**Citation Format:** `##ID:n$$` (where n = chunk index)

**Acceptance Criteria:**
- AC-011b.1: Citation format MUST be `##ID:n$$` for consistent frontend parsing
- AC-011b.2: The system MUST try progressively lower thresholds if no matches found
- AC-011b.3: Maximum 4 citations per sentence
- AC-011b.4: Vector dimension mismatch between answer and chunk embeddings MUST be handled gracefully (log warning, use zero vector)

---

### FR-RET-012: Fallback and Error Handling

**Description:** The system SHALL implement graceful fallbacks when retrieval returns poor or empty results.

#### FR-RET-012a: Zero Results Retry

| Retry Step | Action |
|------------|--------|
| 1 | Relax `minimum_should_match` from 30% → 10% |
| 2 | Lower similarity threshold from configured → 0.17 |
| 3 | Retry search with relaxed parameters |
| 4 | If still empty AND no doc_id filter: return empty result |
| 5 | If doc_id filter active: execute vector-only search without text |

#### FR-RET-012b: Empty Response Configuration

**Description:** When retrieval returns no results, the system SHALL respond with a configurable empty response message.

**Acceptance Criteria:**
- AC-012b.1: The `empty_response` field MUST support string or i18n map format
- AC-012b.2: If `empty_response` is not configured, the system MUST use the default: "Sorry, no relevant information found."
- AC-012b.3: Empty response MUST be streamed via SSE just like a normal answer

#### FR-RET-012c: Embedding Model Mismatch

**Acceptance Criteria:**
- AC-012c.1: If multiple KBs use different embedding models, the system MUST return an error (not silently mix incompatible vectors)
- AC-012c.2: Vector dimension mismatches at citation time MUST be logged and handled with zero vectors (not crash)

---

### FR-RET-013: OpenSearch Index Configuration

**Description:** The system SHALL maintain a specific index mapping for retrieval to function correctly.

#### FR-RET-013a: Index Settings

| Setting | Value | Purpose |
|---------|-------|---------|
| `number_of_shards` | 2 | Parallel search execution |
| `number_of_replicas` | 0 | Development default (should be ≥1 in production) |
| `refresh_interval` | 1000ms | Near-real-time indexing |
| `knn` | true | Enable KNN plugin for vector search |
| `scripted_sim` | Custom IDF formula | Better term scoring than default BM25 |

#### FR-RET-013b: Dynamic Field Templates

| Pattern | Type | Purpose |
|---------|------|---------|
| `*_tks` | text (scripted_sim) | Tokenized fields with custom IDF |
| `*_ltks` | text (whitespace) | Lightweight tokenized fields |
| `*_kwd` | keyword (boolean) | Exact match fields |
| `*_int`, `*_flt` | numeric | Numeric fields |
| `*_fea` | rank_feature | Single rank feature score |
| `*_feas` | rank_features | Multiple rank feature scores |
| `*_{dim}_vec` | knn_vector (cosinesimil) | Vector fields by dimension |
| `*_with_weight` | text (standard) | Readable content with standard analyzer |

**Acceptance Criteria:**
- AC-013b.1: Vector fields MUST support dimensions: 512, 768, 1024, 1536, 2048, 4096, 6144, 8192, 10240
- AC-013b.2: The `knowledge_` prefix MUST be used (NOT `ragflow_`) for all index names
- AC-013b.3: `*_tks` fields MUST use the custom scripted similarity, NOT default BM25

---

### FR-RET-014: Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Search latency (P95) | < 500ms | For hybrid search with reranking |
| Embedding latency | < 200ms | Single query embedding |
| Reranking latency | < 300ms | Model-based reranking of 64 chunks |
| OpenSearch timeout | 600s | Maximum per-query timeout |
| OpenSearch retries | 3 | Retry on timeout/connection error |
| Concurrent searches | 5 | Per-worker semaphore limit |
| Max KB per query | 20 | Multi-dataset search cap |

---

## 3. Glossary

| Term | Definition |
|------|-----------|
| **BM25** | Best Matching 25 — probabilistic text relevance scoring algorithm |
| **KNN** | K-Nearest Neighbors — vector similarity search |
| **CJK** | Chinese, Japanese, Korean — languages requiring special tokenization |
| **IDF** | Inverse Document Frequency — measure of term rarity |
| **NER** | Named Entity Recognition — identifying entities in text |
| **POS** | Part-of-Speech — grammatical category tagging |
| **Cosine Similarity** | Dot product of normalized vectors — measures directional similarity |
| **RERANK_LIMIT** | Number of top candidates fetched for reranking before pagination |
| **FusionExpr** | OpenSearch expression for combining text + vector search scores |
| **Rank Feature** | OpenSearch scoring boost based on document-level numeric attributes |
| **ABAC** | Attribute-Based Access Control — per-user filtering |
| **Chunk** | A segment of a document stored as a searchable unit in OpenSearch |
| **Embedding** | Dense vector representation of text from a neural model |
| **Reranker** | Cross-encoder model that re-scores query-document pairs |

---

## 4. Traceability Matrix

| Requirement | BE Service | Python Module | OpenSearch Feature | Test |
|-------------|-----------|---------------|-------------------|------|
| FR-RET-001 | `rag-search.service.ts` | `search.py` | query_string + knn | Method selection |
| FR-RET-002 | `chat-conversation.service.ts` | `query.py` | — | Query preprocessing |
| FR-RET-003 | — | `term_weight.py`, `rag_tokenizer.py`, `synonym.py` | — | Tokenization |
| FR-RET-004 | `rag-search.service.ts` | `query.py`, `search.py` | query_string | Full-text search |
| FR-RET-005 | `rag-search.service.ts` | `search.py`, `embedding_model.py` | knn | Vector search |
| FR-RET-006 | `rag-search.service.ts` | `search.py` | FusionExpr | Hybrid fusion |
| FR-RET-007 | `rag-search.service.ts` | `opensearch_conn.py` | bool query | Filters |
| FR-RET-008 | `rag-rerank.service.ts` | `search.py`, `rerank_model.py` | rank_feature | Reranking |
| FR-RET-009 | `rag-search.service.ts` | `search.py` | — | Pagination |
| FR-RET-010 | `rag-search.service.ts` | `search.py` | terms agg | Results |
| FR-RET-011 | `rag-citation.service.ts` | `search.py` | — | Citations |
| FR-RET-012 | `rag-search.service.ts` | `search.py` | — | Fallbacks |
| FR-RET-013 | — | `os_mapping.json` | Index settings | Config |
