# Retrieval Pipeline — Detail Design

> **Module:** RAG Pipeline — Query-Time Retrieval
> **Status:** Draft
> **Last Updated:** 2026-03-27
> **SRS:** `docs/srs/core-platform/fr-retrieval-pipeline.md`
> **Basic Design:** `docs/basic-design/rag-pipeline/rag-step-retrieval.md`
> **Upstream:** RAGFlow `rag/nlp/search.py`, `rag/nlp/query.py`, `rag/nlp/term_weight.py`

---

## Table of Contents

1. [Complete Pipeline Walkthrough](#1-complete-pipeline-walkthrough)
2. [Query Preprocessing — Deep Dive](#2-query-preprocessing--deep-dive)
3. [Tokenization and CJK Handling](#3-tokenization-and-cjk-handling)
4. [Term Weighting Algorithm (IDF + NER + POS)](#4-term-weighting-algorithm-idf--ner--pos)
5. [Synonym Expansion System](#5-synonym-expansion-system)
6. [Full-Text Search Construction](#6-full-text-search-construction)
7. [Semantic Search (Embedding + KNN)](#7-semantic-search-embedding--knn)
8. [Hybrid Fusion — Two Implementations](#8-hybrid-fusion--two-implementations)
9. [OpenSearch Query Building](#9-opensearch-query-building)
10. [Reranking — All Methods](#10-reranking--all-methods)
11. [Score Filtering, Threshold, and Pagination](#11-score-filtering-threshold-and-pagination)
12. [Citation Insertion Algorithm](#12-citation-insertion-algorithm)
13. [OpenSearch Index Mapping Reference](#13-opensearch-index-mapping-reference)
14. [Embedding Model Integration](#14-embedding-model-integration)
15. [Reranker Model Integration](#15-reranker-model-integration)
16. [Special Retrieval Modes](#16-special-retrieval-modes)
17. [RAGFlow Comparison — Line-by-Line](#17-ragflow-comparison--line-by-line)
18. [Troubleshooting Guide](#18-troubleshooting-guide)
19. [Configuration Reference](#19-configuration-reference)

---

## 1. Complete Pipeline Walkthrough

This section traces a single user query through **every** component in the retrieval pipeline. Follow this when debugging or understanding the system end-to-end.

**Critical concept:** The two paths below are **mutually exclusive** — a single user query triggers ONLY ONE path, never both simultaneously. Chat/Search always uses Node.js. Agent retrieval always uses Python. They share the same OpenSearch index (`knowledge_{tenantId}`) but never run concurrently for the same request.

### 1.1 Node.js BE Path (Primary — Chat and Search)

**Files involved in order:**

| Step | File | Function | What Happens |
|------|------|----------|-------------|
| 1 | `be/.../chat-conversation.controller.ts` | `streamChat()` | Receives HTTP POST with user message |
| 2 | `be/.../chat-conversation.service.ts` | `streamChat()` | Orchestrates full RAG pipeline |
| 3 | (same) | Multi-turn refinement | Optional LLM call to synthesize conversation + question |
| 4 | (same) | Cross-language expansion | Optional LLM translation to other languages |
| 5 | (same) | Keyword extraction | Optional LLM keyword extraction (up to 8) |
| 6 | `be/.../rag-search.service.ts` | `search()` | Dispatches to fullText/semantic/hybrid |
| 7 | (same) | `hybridSearch()` | Builds OpenSearch query + KNN, runs search |
| 8 | `be/.../rag-rerank.service.ts` | `rerank()` | Optional model-based reranking |
| 9 | `be/.../chat-conversation.service.ts` | `buildContextPrompt()` | Assembles system prompt with chunks |
| 10 | `be/.../llm-client.service.ts` | `chatCompletionStream()` | Streams LLM response |
| 11 | `be/.../rag-citation.service.ts` | `insertCitations()` | Matches sentences to chunks |

### 1.2 Python Worker Path (Agent Retrieval Node Only)

**Why this path exists:** Agent workflows run node tasks in the Python worker because agents need access to GPU models, the RAGFlow NLP stack (tokenization, term weighting, synonym expansion), and the embedding pipeline -- none of which are available in Node.js.

**Dispatch mechanism:** The Node.js agent orchestrator (`agent-executor.service.ts`) uses XADD to publish a task to the Redis Stream `agent_execution_queue`. The Python consumer (`agent_consumer.py`) picks it up via XREADGROUP, runs the retrieval, and publishes the result back via Redis pub/sub to `agent:run:{run_id}:node:{node_id}:result`.

| Step | File | Function | What Happens |
|------|------|----------|-------------|
| 1 | `be/.../agent-executor.service.ts` | `executeNode()` | Detects "retrieval" node, publishes to Redis |
| 2 | `be/.../agent-redis.service.ts` | `queueNodeExecution()` | XADD to `agent_execution_queue` |
| 3 | `advance-rag/rag/agent/agent_consumer.py` | `consume()` | XREADGROUP picks up task |
| 4 | `advance-rag/rag/agent/node_executor.py` | `handle_retrieval()` | Dispatches to retrieval |
| 5 | `advance-rag/rag/nlp/search.py` | `Dealer.retrieval()` | Full retrieval orchestration |
| 6 | `advance-rag/rag/nlp/query.py` | `FulltextQueryer.question()` | Query parsing + expansion |
| 7 | `advance-rag/rag/nlp/term_weight.py` | `Dealer.weights()` | IDF term weighting |
| 8 | `advance-rag/rag/nlp/synonym.py` | `Dealer.lookup()` | Synonym expansion |
| 9 | `advance-rag/rag/llm/embedding_model.py` | `encode_queries()` | Query embedding |
| 10 | `advance-rag/rag/utils/opensearch_conn.py` | `OSConnection.search()` | OpenSearch query |
| 11 | `advance-rag/rag/nlp/search.py` | `Dealer.rerank()` | Post-retrieval reranking |

**Note:** `retrieval_tool.py` (`RetrievalTool` class) is **dead code** -- it is instantiated but never called. The actual retrieval goes through `handle_retrieval()` in `node_executor.py`, which calls `settings.retriever.retrieval()` directly.

---

## 2. Query Preprocessing — Deep Dive

### 2.1 CJK Normalization Pipeline

**File:** `advance-rag/rag/nlp/query.py` lines 41-60

Every query passes through these transformations in order:

```
Original: "資料庫Ｈｅｌｌｏ世界 https://example.com 测试？"

Step 1 — add_space_between_eng_zh():
  "資料庫 Ｈｅｌｌｏ 世界 https://example.com 测试？"
  (spaces inserted between CJK and non-CJK)

Step 2 — strQ2B():
  "資料庫 Hello 世界 https://example.com 测试？"
  (full-width characters converted to half-width)

Step 3 — tradi2simp():
  "资料库 Hello 世界 https://example.com 测试？"
  (traditional Chinese converted to simplified)

Step 4 — sub_special_char():
  "资料库 Hello 世界 测试"
  (special chars removed, URL stripped by rmWWW)

Step 5 — lowercase:
  "资料库 hello 世界 测试"
```

**Why this order matters:**
- `strQ2B` must happen before tokenization (full-width chars break English tokenizers)
- `tradi2simp` must happen before IDF lookup (frequency table uses simplified Chinese)
- Special char removal must happen after space insertion (to not merge adjacent CJK tokens)

### 2.2 Language Detection

**File:** `advance-rag/common/query_base.py`

```python
def is_chinese(txt):
    arr = re.split(r"[ \t]+", txt)
    if len(arr) <= 3:
        return True    # Short text -> assume Chinese
    eng = sum(1 for t in arr if re.match(r"[a-zA-Z]+$", t))
    return eng / len(arr) < 0.3   # Less than 30% English tokens
```

**Edge Cases to Know:**

| Input | `is_chinese()` | Why |
|-------|----------------|-----|
| `"hello"` | `True` | 1 token <= 3 threshold |
| `"hello world"` | `True` | 2 tokens <= 3 threshold |
| `"hello world test"` | `True` | 3 tokens <= 3 threshold |
| `"hello world test again"` | `False` | 4 tokens, 100% English > 30% |
| `"hello world test ok"` (mixed) | `False` | 4 tokens, 75% English > 30% |
| `"你好 世界"` | `True` | 2 tokens <= 3 threshold |
| `"你好 世界 hello test"` | `True` | 4 tokens, 25% English < 30% |

**Gotcha for Newbies:** Short English queries (1-3 words) are classified as Chinese! This means they get fine-grained tokenization which may not be desired. This is a known RAGFlow behavior preserved for compatibility.

### 2.3 Multi-Turn Question Refinement

**When active:** `prompt_config.refine_multiturn = true`

**File:** `be/src/modules/chat/services/chat-conversation.service.ts`

The system sends conversation history + current question to an LLM:

```
Given this conversation:
User: What is aspirin?
Assistant: Aspirin is an NSAID medication...
User: What about side effects?

Rewrite the last question as a standalone query:
-> "What are the side effects of aspirin?"
```

**Why this matters:** Without refinement, the query `"What about side effects?"` would search for "side effects" without context — missing that the user is asking about aspirin specifically.

### 2.4 Cross-Language Expansion

**When active:** `prompt_config.cross_languages = "English,Vietnamese"`

The system translates the query into each target language and appends translations:

```
Original: "What are the side effects of aspirin?"
+ Vietnamese translation appended

Final query: "What are the side effects of aspirin? Tac dung phu cua aspirin la gi?"
```

**Why this works:** OpenSearch BM25 will match tokens in ANY language present in the query against indexed chunks. If documents are in Vietnamese, the translated portion matches them.

### 2.5 Keyword Extraction

**When active:** `prompt_config.keyword = true`

LLM extracts up to 8 keywords appended to the query:

```
Original: "What are the common complications after knee replacement surgery?"
Keywords: ["knee replacement", "complications", "post-operative", "surgery", "arthroplasty"]

Final query: original + keywords appended
```

**Why this works:** Keywords boost recall — the LLM may extract medical synonyms (e.g., "arthroplasty") that the user did not type but are present in indexed documents.

---

## 3. Tokenization and CJK Handling

### 3.1 RagTokenizer

**File:** `advance-rag/rag/nlp/rag_tokenizer.py`

The tokenizer wraps Infinity's Rust-based `RagTokenizer`:

```python
class RagTokenizer(infinity.rag_tokenizer.RagTokenizer):
    def tokenize(self, line):
        # For OpenSearch: delegates to parent (CJK-aware segmentation)
        # For Infinity DB: returns text as-is (Infinity handles tokenization)
        if settings.DOC_ENGINE_INFINITY:
            return line
        return super().tokenize(line)

    def fine_grained_tokenize(self, tks):
        # For OpenSearch: decomposes multi-char CJK tokens
        # For Infinity DB: returns as-is
        if settings.DOC_ENGINE_INFINITY:
            return tks
        return super().fine_grained_tokenize(tks)
```

### 3.2 Tokenization Examples

**English text:**
```
Input:  "aspirin side effects"
Output: "aspirin side effects"   (whitespace split, no change)
```

**Chinese text:**
```
Input:  "阿司匹林的副作用"
Output: "阿司匹林 的 副作用"     (dictionary-based segmentation)
```

**Mixed text:**
```
Input:  "aspirin的副作用是什么"
Output: "aspirin 的 副作用 是 什么"  (CJK segmented, English preserved)
```

### 3.3 Fine-Grained Tokenization

For CJK tokens with length >= 3, fine-grained tokenization decomposes compound words into sub-tokens:

```
Input token: "阿司匹林" (aspirin in Chinese, 4 chars)
Fine-grained: "阿司 司匹 匹林 阿司匹 司匹林"  (bigrams + trigrams)
```

**Why this matters:**
- Compound CJK words may appear in documents in different forms
- "阿司匹林片" (aspirin tablet) shares sub-tokens with "阿司匹林" (aspirin)
- Fine-grained tokenization enables partial matching of compound words

### 3.4 Key Utility Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `tokenize(text)` | Main tokenization | `"hello world"` -> `"hello world"` |
| `fine_grained_tokenize(tks)` | Sub-word splitting | `"阿司匹林"` -> `"阿司 司匹 匹林..."` |
| `tradi2simp(text)` | Traditional -> Simplified | `"資料"` -> `"资料"` |
| `strQ2B(text)` | Full-width -> Half-width | full-width `A` -> half-width `A` |
| `is_chinese(s)` | Character-level CJK check | `"中"` -> `True` |
| `is_number(s)` | Numeric check | `"123"` -> `True` |
| `is_alphabet(s)` | Latin alphabet check | `"abc"` -> `True` |
| `tag(t)` | POS tagging | `"跑"` -> `"v"` (verb) |
| `freq(t)` | Term frequency lookup | `"的"` -> large number |

---

## 4. Term Weighting Algorithm (IDF + NER + POS)

### 4.1 Overview

**File:** `advance-rag/rag/nlp/term_weight.py`

Every token in a query or chunk gets an importance weight. This weight determines how much each token contributes to matching.

### 4.2 Stop Word Filtering

**61 Chinese stop words** (partial list): 是, 的, 就, 有, 于, 我, 你, 他, 了, 在, 到, 把, 被, 从, 对, 但, 和, 与, 或, 如果, 因为, 所以, 请问, 什么, 怎么, 什么样, 哪里, 谁, 为什么, 如何, 可以, 能, 会, 要, 该, 应该, 必须, etc.

**Filtering rules:**
1. Stop words are removed before IDF calculation
2. Single-digit numbers are removed (unless `num=True`)
3. Special characters are stripped

### 4.3 IDF Formula — Step by Step

For a token `t`:

```
Step 1: Look up frequency
  freq = rag_tokenizer.freq(t)    // From term.freq resource file
  If freq is 0 or not found:
    freq = 3     // Default floor for unknown terms
    If is_number: freq = 3 or 5 (depending on format)
    If is_alphabet: freq = 300

Step 2: Compute IDF from two corpora
  N_all = 10,000,000        // Assumed total documents (large corpus)
  N_df  = 1,000,000,000     // Assumed total collection (very large corpus)

  idf1 = log10(10 + (N_all - freq + 0.5) / (freq + 0.5))
  idf2 = log10(10 + (N_df  - freq + 0.5) / (freq + 0.5))

Step 3: Blend IDF values
  combined_idf = 0.3 * idf1 + 0.7 * idf2

Step 4: Apply NER multiplier (see Section 4.4)

Step 5: Apply POS multiplier (see Section 4.5)

Step 6: Final weight
  weight = combined_idf * ner_mult * pos_mult

Step 7: Normalize across all tokens
  total = sum(weight for all tokens)
  normalized_weight = weight / total
```

### 4.4 NER (Named Entity Recognition) Multipliers

**File:** `advance-rag/rag/nlp/term_weight.py` + `advance-rag/rag/res/ner.json`

| Entity Type | Multiplier | What It Matches |
|-------------|-----------|------------------|
| `toxic` | 2.0 | Toxic/hazardous substance names |
| `corp` | 3.0 | Company/corporation names |
| `loca` | 3.0 | Location/geographic names |
| `sch` | 3.0 | School/university names |
| `stock` | 3.0 | Stock ticker symbols |
| `func` | 1.0 | Function/method names |
| `firstnm` | 1.0 | First names/given names |
| Numbers | 2.0 | Any numeric token |
| Short letters (1-2 chars) | 0.01 | Very short abbreviations (down-weighted) |

**Why NER matters for retrieval:** If a user searches for "Tesla stock price", the NER system recognizes "Tesla" as a company (3x) and "stock" as stock-related (3x), giving them much higher weight than generic words like "price" (1x). This dramatically improves precision.

### 4.5 POS (Part-of-Speech) Multipliers

| POS Tag | Category | Multiplier | Reason |
|---------|----------|-----------|--------|
| `r` | Pronouns | 0.3 | "he", "she", "it" — rarely useful for search |
| `c` | Conjunctions | 0.3 | "and", "but", "or" — structural, not content |
| `d` | Adverbs | 0.3 | "very", "really" — modifiers, not entities |
| `ns` | Place names | 3.0 | Geographic entities are highly specific |
| `nt` | Organization names | 3.0 | Companies, institutions are highly specific |
| `n` | Common nouns | 2.0 | Content-bearing words |
| Others | Default | 1.0 | Neutral weight |

### 4.6 Worked Example

Query: `"Tesla stock price in 2024"`

```
Tokenization: ["Tesla", "stock", "price", "in", "2024"]

After stop word removal: ["Tesla", "stock", "price", "2024"]
  ("in" is a stop word)

IDF computation (hypothetical values):
  Tesla: idf1=7.2, idf2=8.1 -> combined = 0.3*7.2 + 0.7*8.1 = 7.83
  stock: idf1=4.5, idf2=5.2 -> combined = 0.3*4.5 + 0.7*5.2 = 4.99
  price: idf1=4.1, idf2=4.8 -> combined = 0.3*4.1 + 0.7*4.8 = 4.59
  2024:  idf1=5.5, idf2=6.0 -> combined = 0.3*5.5 + 0.7*6.0 = 5.85

NER multipliers:
  Tesla: corp -> 3.0
  stock: stock -> 3.0
  price: default -> 1.0
  2024:  number -> 2.0

POS multipliers:
  Tesla: nt (org) -> 3.0
  stock: n (noun) -> 2.0
  price: n (noun) -> 2.0
  2024:  default -> 1.0

Final weights (before normalization):
  Tesla: 7.83 * 3.0 * 3.0 = 70.47
  stock: 4.99 * 3.0 * 2.0 = 29.94
  price: 4.59 * 1.0 * 2.0 = 9.18
  2024:  5.85 * 2.0 * 1.0 = 11.70

Normalized (sum = 121.29):
  Tesla: 0.581  (58.1% of query weight!)
  stock: 0.247  (24.7%)
  2024:  0.096  (9.6%)
  price: 0.076  (7.6%)
```

**Key insight:** "Tesla" gets 58% of the query weight — the system correctly identifies it as the most important term.

### 4.7 Fine-Grained Fallback

When a token's frequency is not found AND the token length >= 4:

```python
sub_tokens = rag_tokenizer.fine_grained_tokenize(token)
sub_weights = [weights(st) for st in sub_tokens]
fallback_weight = min(sub_weights) / 6
```

**Why:** Unknown compound words (e.g., a new brand name) should still get reasonable weights based on their components.

---

## 5. Synonym Expansion System

### 5.1 Lookup Order

**File:** `advance-rag/rag/nlp/synonym.py`

```
Token: "car"
  |
  v
[1. Custom Dictionary (rag/res/synonym.json)]
  Found? -> Return synonyms (max 8)
  Not found? -> Continue
  |
  v
[2. Redis Cache (kevin_synonyms)]
  Found? -> Return cached synonyms
  Not found? -> Continue
  |
  v
[3. WordNet (English only, pure alphabetic tokens)]
  re.fullmatch(r"[a-z]+", "car") -> True
  wordnet.synsets("car") -> ["automobile", "motorcar", ...]
  Return top 8 unique synonyms
  |
  v
[4. No match -> Return empty list]
```

### 5.2 Synonym Weight Reduction

Synonyms are weighted at **25% (1/4)** of the original token:

```python
syn_weight = original_weight / 4

# Query string becomes:
# (car^0.40 automobile^0.10 vehicle^0.10)
```

**Why 25%?** Synonyms are less reliable than exact matches. A document about "automobiles" is likely relevant to a "car" query, but less certainly than a document that actually says "car".

### 5.3 Custom Dictionary Format

**File:** `advance-rag/rag/res/synonym.json`

```json
{
  "car": ["automobile", "vehicle", "motorcar"],
  "python": ["python programming language", "python lang"],
  "ai": ["artificial intelligence", "machine learning"]
}
```

All keys are lowercased. Lookup is case-insensitive.

---

## 6. Full-Text Search Construction

### 6.1 Query String Building — English Path

**File:** `advance-rag/rag/nlp/query.py` lines 60-90

For English queries, the system builds a Lucene `query_string` query:

```
Query: "machine learning algorithms"

Step 1: Tokenize -> ["machine", "learning", "algorithms"]

Step 2: Weight each token
  machine: 0.35, learning: 0.30, algorithms: 0.35

Step 3: Look up synonyms
  machine:    ["device", "apparatus"]
  learning:   ["training", "education"]
  algorithms: ["procedures", "methods"]

Step 4: Build token groups
  (machine^0.35 device^0.09 apparatus^0.09)
  (learning^0.30 training^0.08 education^0.08)
  (algorithms^0.35 procedures^0.09 methods^0.09)

Step 5: Build phrase groups (consecutive pairs, 2x boost)
  "machine learning"^0.70
  "learning algorithms"^0.70

Step 6: Combine with OR
  "(machine^0.35 device^0.09 apparatus^0.09)"
  " OR (learning^0.30 training^0.08 education^0.08)"
  " OR (algorithms^0.35 procedures^0.09 methods^0.09)"
  " OR \"machine learning\"^0.70"
  " OR \"learning algorithms\"^0.70"
```

### 6.2 Query String Building — Chinese Path

**File:** `advance-rag/rag/nlp/query.py` lines 95-170

For Chinese queries, additional fine-grained processing:

```
Query: "机器学习算法"

Step 1: Tokenize -> ["机器", "学习", "算法"]
Step 2: Weight each token (IDF + NER + POS)
Step 3: For each token with length >= 3, fine-grained split
Step 4: Synonyms + fine-grained alternatives
Step 5: Build query groups (same structure as English)
```

For longer tokens (>= 3 chars):

```
Token: "阿司匹林" (4 chars)
Fine-grained: ["阿司", "司匹", "匹林", "阿司匹", "司匹林"]

Query group: (阿司匹林^0.40 OR 阿司^0.10 OR 司匹^0.10 OR 匹林^0.10 ...)
```

### 6.3 Field Boosting

The query_string is run across multiple fields with different boosts:

```
fields: [
  "important_kwd^30",     // Keywords extracted during indexing (highest signal)
  "important_tks^20",     // Tokenized keywords
  "question_tks^20",      // Auto-generated questions from chunks
  "title_tks^10",         // Document titles
  "title_sm_tks^5",       // Fine-grained title tokens
  "content_ltks^2",       // Main content (moderate boost)
  "content_sm_ltks"       // Fine-grained content (1x default)
]
```

**Why this ordering matters for debugging:**
- If a chunk has the query term in `important_kwd`, it gets 30x boost — it will almost always rank first
- If the term is only in `content_ltks`, it gets 2x — much lower
- A title match (10x) outranks a content match (2x) by 5x
- This means: **keyword enrichment during indexing has massive impact on retrieval quality**

### 6.4 Minimum Should Match

```
minimum_should_match: "30%"
```

This means at least 30% of the OR clauses must match. For a 5-term query, at least 2 terms must match.

**Retry logic:** If 0 results, relax to 10% (essentially match any single term).

---

## 7. Semantic Search (Embedding + KNN)

### 7.1 Query Embedding

**File:** `advance-rag/rag/nlp/search.py` lines 52-60

```python
async def get_vector(self, txt, emb_mdl, topk=10, similarity=0.1):
    qv, _ = await thread_pool_exec(emb_mdl.encode_queries, txt)
    embedding_data = [get_float(v) for v in qv]
    vector_column_name = f"q_{len(embedding_data)}_vec"
    return MatchDenseExpr(
        vector_column_name,     # Which field to search
        embedding_data,         # The query vector
        'float',                # Data type
        'cosine',               # Distance metric
        topk,                   # Max neighbors
        {"similarity": similarity}  # Minimum threshold
    )
```

### 7.2 encode_queries vs encode

| Method | Used For | Behavior |
|--------|----------|----------|
| `encode_queries(text)` | Single query | May apply query-specific prefix (e.g., "query: " for some models) |
| `encode(texts)` | Batch of documents/chunks | Standard encoding without prefix |

**Critical difference:** Some embedding models (e.g., Cohere) use different encoding modes for queries vs documents:
- Cohere: `input_type="search_query"` vs `input_type="search_document"`
- This asymmetry is intentional and improves retrieval quality

### 7.3 Vector Dimension and Field Mapping

The embedding dimension determines which OpenSearch field is searched:

| Embedding Model | Dimension | Field |
|----------------|-----------|-------|
| BAAI/bge-small-en-v1.5 | 384 | `q_384_vec` |
| BAAI/bge-m3 | 768 | `q_768_vec` |
| OpenAI text-embedding-3-small | 1536 | `q_1536_vec` |
| Qwen3-Embedding-0.6B | Variable | `q_{dim}_vec` |

**Gotcha:** If you change the embedding model for a knowledge base, old chunks still have the old dimension vector. New queries will search a different field and get 0 results for old chunks. You MUST re-embed all chunks when changing models.

### 7.4 KNN Query Structure

```json
{
  "knn": {
    "q_1024_vec": {
      "vector": [0.12, -0.34, 0.56, "...more floats..."],
      "k": 10,
      "filter": {
        "bool": {
          "must": [
            { "terms": { "kb_id": ["kb-1", "kb-2"] } },
            { "range": { "available_int": { "gte": 1 } } }
          ]
        }
      },
      "boost": 0.1
    }
  }
}
```

**Key parameter: `k`** — Number of approximate nearest neighbors. OpenSearch KNN uses HNSW (Hierarchical Navigable Small World) graphs for fast approximate search.

---

## 8. Hybrid Fusion — Two Implementations

### 8.1 Python Worker (FusionExpr)

**File:** `advance-rag/rag/nlp/search.py` line 127

```python
fusionExpr = FusionExpr("weighted_sum", topk, {"weights": "0.05,0.95"})
```

This sends **both** queries (text + vector) to OpenSearch in a single request. OpenSearch internally:
1. Runs BM25 query -> gets text scores
2. Runs KNN query -> gets vector scores
3. Normalizes both to [0, 1]
4. Combines: `final = 0.05 * text_norm + 0.95 * vector_norm`

### 8.2 Node.js BE (Application-Level Fusion)

**File:** `be/src/modules/rag/services/rag-search.service.ts`

The BE service runs text and vector searches separately and combines in code:

```typescript
// Normalize scores to [0, 1]
const maxTextScore = Math.max(...textResults.map(r => r.score))
const maxVectorScore = Math.max(...vectorResults.map(r => r.score))

// Merge results
for (const chunk of allChunks) {
  const textScore = (chunk.textScore || 0) / maxTextScore
  const vectorScore = (chunk.vectorScore || 0) / maxVectorScore
  chunk.similarity = textScore * (1 - weight) + vectorScore * weight
}
```

### 8.3 Why They Differ

| Aspect | Python (FusionExpr) | Node.js BE |
|--------|-------------------|------------|
| **Weights** | 5% text / 95% vector (hardcoded) | Configurable (default 30% / 70%) |
| **Where fusion happens** | Inside OpenSearch | Application code |
| **Normalization** | OpenSearch internal | Max-value normalization |
| **Configurability** | None (hardcoded) | Per chat assistant / search app |
| **Used by** | Agent retrieval nodes | Chat, Search, Retrieval Test |

**RAGFlow reasoning:** 95% vector weight assumes embeddings are more reliable than keyword matching. B-Knowledge BE uses configurable defaults (30%/70%) to give admins control per domain.

---

## 9. OpenSearch Query Building

### 9.1 Full Query Construction

**File:** `advance-rag/rag/utils/opensearch_conn.py` lines 192-327

The `search()` method builds the complete OpenSearch query:

1. **Build bool filter** — mandatory conditions (kb_id, available_int)
2. **Process MatchTextExpr** — query_string with field boosts
3. **Process MatchDenseExpr** — KNN vector query
4. **Process FusionExpr** — extract weight parameters
5. **Add rank features** — PageRank and tag relevance
6. **Add highlighting** — `<em>` tag wrapping for matched terms
7. **Apply pagination** — offset and limit
8. **Replace query with KNN** if vector search is active
9. **Send request** with 600s timeout and retry logic

### 9.2 Filter Conditions

| Condition Key | OpenSearch Query | When Used |
|--------------|----------------|-----------|
| `kb_id` | `terms` query | Always (mandatory) |
| `doc_id` | `terms` query | When filtering to specific documents |
| `available_int` | `range` query | Always (`gte: 1` to exclude hidden chunks) |
| `entity_kwd` | `term` query | Knowledge graph entity filter |
| `removed_kwd` | `must_not term` | Exclude removed graph entities |

### 9.3 Highlighting

OpenSearch returns highlighted text with `<em>` tags:

```json
{
  "highlight": {
    "content_ltks": [
      "<em>aspirin</em> may cause <em>side effects</em> including..."
    ]
  }
}
```

**Special handling for English text:**
The `get_highlight()` method manually wraps keywords for English text because OpenSearch's whitespace analyzer does not perform stemming ("effects" will not highlight "effect"). The manual approach does substring matching which is more flexible.

---

## 10. Reranking — All Methods

### 10.1 Method 1: Hybrid Similarity Reranking (Default, No Model)

**File:** `advance-rag/rag/nlp/search.py` lines 296-333

When no reranking model is configured:

```
For each candidate chunk:

Step 1: Build weighted token list
  tokens = content_ltks             (1x weight)
         + title_tks * 2            (title repeated 2x)
         + important_kwd * 5        (keywords repeated 5x)
         + question_tks * 6         (questions repeated 6x)

Step 2: Compute token similarity
  For single tokens:  dict[token] += weight * 0.4
  For bigrams:        dict[token_a + token_b] += max(w_a, w_b) * 0.6
  token_sim = sum(overlap) / sum(query_dict)

Step 3: Compute vector similarity
  vector_sim = cosine_similarity(query_vec, chunk_vec)

Step 4: Combine
  hybrid_sim = vector_sim * 0.7 + token_sim * 0.3

Step 5: Add rank features
  rank_fea = tag_cosine_similarity * 10 + pagerank_score
  final_score = hybrid_sim + rank_fea
```

### 10.2 Method 2: Model-Based Reranking

**File:** `advance-rag/rag/nlp/search.py` lines 335-356 (Python)
**File:** `be/src/modules/rag/services/rag-rerank.service.ts` (Node.js)

When a reranking model is configured:

```
Step 1: Send query + chunk texts to reranker API
Step 2: Get relevance scores
Step 3: Normalize scores to [0, 1]
Step 4: Combine with original search scores
  Python:  final = tkweight * token_sim + vtweight * model_score + rank_fea
  Node.js: final = 0.3 * original_search_score + 0.7 * rerank_score
Step 5: Sort and return top N
```

### 10.3 Reranker API Formats

**Jina:**
```
POST https://api.jina.ai/v1/rerank
{ "model": "jina-reranker-v2-base-multilingual",
  "query": "...", "documents": [...], "top_n": 64 }
Response: { "results": [{ "index": 0, "relevance_score": 0.95 }] }
```

**Cohere:**
```
POST {base_url}/v2/rerank  (fallback to v1)
{ "model": "rerank-multilingual-v3.0",
  "query": "...", "documents": [...], "top_n": 64 }
Response: { "results": [{ "index": 0, "relevance_score": 0.92 }] }
```

**Generic (BAAI, NVIDIA, etc.):**
```
POST {base_url}/rerank
{ "model": "BAAI/bge-reranker-v2-m3",
  "query": "...", "documents": [...], "top_n": 64 }
Scores normalized to [0, 1]
```

### 10.4 Score Normalization

```python
def _normalize_rank(rank):
    min_rank = np.min(rank)
    max_rank = np.max(rank)
    if not np.isclose(min_rank, max_rank, atol=1e-3):
        return (rank - min_rank) / (max_rank - min_rank)
    else:
        return np.zeros_like(rank)  # All scores identical -> all zero
```

### 10.5 Tag-Based Rank Feature Scoring

**File:** `advance-rag/rag/nlp/search.py` lines 269-294

```
Step 1: Compute query tag vector (BM25 query against tag descriptions)
Step 2: For each chunk, compute cosine similarity between query tags and chunk tags
Step 3: tag_sim = dot_product / (query_norm * chunk_norm) * 10  (10x multiplier)
Step 4: rank_fea = tag_sim + pagerank_score
```

---

## 11. Score Filtering, Threshold, and Pagination

### 11.1 RERANK_LIMIT Calculation

**File:** `advance-rag/rag/nlp/search.py` lines 386-387

```python
RERANK_LIMIT = math.ceil(64 / page_size) * page_size if page_size > 1 else 1
RERANK_LIMIT = max(30, RERANK_LIMIT)
```

| page_size | RERANK_LIMIT |
|-----------|-------------|
| 1 | 30 |
| 4 | 64 |
| 6 | 66 |
| 8 | 64 |
| 10 | 70 |
| 20 | 80 |

### 11.2 Similarity Threshold Logic

```python
if vector_similarity_weight == 0:
    post_threshold = 0           # Text-only: BM25 scores not bounded [0,1]
elif doc_ids:
    post_threshold = 0           # User specified docs: show all
else:
    post_threshold = similarity_threshold  # Normal: apply configured threshold
```

**Why threshold = 0 for text-only?** BM25 scores are not bounded to [0, 1] — they can be any positive number. A threshold of 0.2 would be meaningless for raw BM25 scores.

**Why threshold = 0 for explicit doc_ids?** If a user asks for results from specific documents, they want to see everything, even low-relevance chunks.

### 11.3 Pagination

```python
max_pages = max(1, len(valid_chunks) // page_size)
actual_page = page % max_pages
begin = actual_page * page_size
end = begin + page_size
page_chunks = valid_chunks[begin:end]
```

**Page wrapping:** If page 5 is requested but only 3 pages exist, returns page 2 (5 % 3 = 2).

---

## 12. Citation Insertion Algorithm

### 12.1 Overview

**Python:** `advance-rag/rag/nlp/search.py` lines 177-267
**Node.js:** `be/src/modules/rag/services/rag-citation.service.ts`

### 12.2 Sentence Splitting

**Regex pattern handles multiple languages:**
- Chinese: 。 ？ ！ ；
- English: . ? ! ;
- Arabic: ، ؛ ؟ ۔
- Newlines
- Code blocks (``` markers) are excluded

**Filter:** Skip sentences shorter than 5 characters.

### 12.3 Matching Algorithm

```
Step 1: Embed all answer sentences using the embedding model
Step 2: Get chunk vectors from search results

Step 3: For each sentence, find matching chunks
  threshold = 0.63   (start high)

  while no matches found and threshold >= 0.3:
    for each sentence:
      for each chunk:
        sim = 0.9 * cosine(sent_vec, chunk_vec) + 0.1 * jaccard(tokens)
        if sim >= threshold: add to matches

      keep top 4 matches

    if no matches for any sentence:
      threshold = threshold * 0.8   (reduce by 20%)
```

### 12.4 Citation Format

Inserted as `##ID:n$$` where `n` is the 0-based chunk index:

```
Before: "Aspirin may cause stomach bleeding."
After:  "Aspirin may cause stomach bleeding.##ID:0$$"
```

**Alternative formats also recognized:** `[ID:n]`, `(ID:n)` — all normalized to `##ID:n$$`.

---

## 13. OpenSearch Index Mapping Reference

### 13.1 Index Settings

**File:** `advance-rag/conf/os_mapping.json`

| Setting | Value | Purpose |
|---------|-------|---------|
| `number_of_shards` | 2 | Parallel search |
| `number_of_replicas` | 0 | Dev default (increase in production) |
| `refresh_interval` | 1000ms | Near-real-time indexing |
| `knn` | true | Enable KNN plugin |

### 13.2 Custom Scripted Similarity for `*_tks` fields

```
score = sqrt(log((docCount - termFreq + 0.5) / (termFreq + 0.5) + 1))
```

**Why custom IDF?** Chunks are uniform-length segments, not full documents. Standard BM25's document length normalization would penalize shorter chunks unfairly.

### 13.3 Supported Vector Dimensions

512, 768, 1024, 1536, 2048, 4096, 6144, 8192, 10240

Each uses HNSW with:
- `space_type: cosinesimil`
- `ef_construction: 200`
- `m: 16`

---

## 14. Embedding Model Integration

### 14.1 Supported Providers

**File:** `advance-rag/rag/llm/embedding_model.py`

| Class | Provider | Max Tokens | Batch Size |
|-------|----------|------------|------------|
| `BuiltinEmbed` | HuggingFace TEI | 500-30,000 | 16 |
| `OpenAIEmbed` | OpenAI | 8,191 | 16 |
| `LocalAIEmbed` | Ollama/LocalAI | Model-dep | 16 |
| `JinaEmbed` | Jina AI | Model-dep | 16 |
| `JinaMultiVecEmbed` | Jina AI v4 | Model-dep | 16 |
| `CoHereEmbed` | Cohere | Model-dep | 96 |
| `BedrockEmbed` | AWS Bedrock | Model-dep | 16 |
| `GeminiEmbed` | Google Gemini | Model-dep | 16 |
| `HuggingFaceEmbed` | HF TEI Server | Model-dep | 16 |
| `XInferenceEmbed` | Xinference | Model-dep | 16 |
| `NvidiaEmbed` | NVIDIA NIM | Model-dep | 16 |

### 14.2 Built-in Model Token Limits

| Model | Max Tokens |
|-------|-----------|
| Qwen/Qwen3-Embedding-0.6B | 30,000 |
| BAAI/bge-m3 | 8,000 |
| BAAI/bge-small-en-v1.5 | 500 |

**Gotcha:** For bge-small with 500 tokens, queries longer than ~375 words get truncated.

---

## 15. Reranker Model Integration

### 15.1 Supported Providers

| Class | Provider | Notes |
|-------|----------|-------|
| `JinaRerank` | Jina AI | `relevance_score` output |
| `CoHereRerank` | Cohere | v2 preferred, v1 fallback |
| `NvidiaRerank` | NVIDIA NIM | Returns `logit` (normalized) |
| `XInferenceRerank` | Xinference | Local server |
| `LocalAIRerank` | Ollama/LocalAI | OpenAI-compatible |
| `VoyageRerank` | Voyage AI | REST API |

**Edge case:** If all chunks get the same reranker score (max == min), all scores become 0. The reranker found them equally relevant (or irrelevant).

---

## 16. Special Retrieval Modes

### 16.1 TOC-Based Retrieval

**File:** `advance-rag/rag/nlp/search.py` lines 605-667

Config: `prompt_config.toc_enhance = true`

1. Fetch TOC chunk (special chunk with table of contents structure)
2. Send TOC + query to LLM: "Which sections are relevant?"
3. LLM identifies relevant section numbers
4. Add extra chunks from those sections

### 16.2 Hierarchical Chunk Retrieval

**File:** `advance-rag/rag/nlp/search.py` lines 669-715

For parent-child chunk hierarchies (e.g., RAPTOR):

1. Search returns child chunks
2. Group children by `mom_id` (parent chunk ID)
3. Aggregate child similarity scores (mean)
4. Merge parent text with top children
5. Return flattened results

**Note:** Parent chunks have `available_int = 0` (hidden from normal search).

### 16.3 Knowledge Graph Retrieval

Config: `prompt_config.use_kg = true`

1. Extract entities from query
2. Search graph for related entities and relationships
3. Return graph context as additional knowledge
4. Merged with vector search results in the prompt

### 16.4 Deep Research Mode

Config: `prompt_config.reasoning = true`

1. Decompose question into sub-questions
2. Search for each sub-question
3. Check sufficiency
4. If insufficient: generate more sub-questions
5. Budget: max 50K tokens, max 15 LLM calls
6. Streams progress events via SSE

---

## 17. RAGFlow Comparison — Line-by-Line

### 17.1 Identical Code (Ported 1:1)

| Component | File | Notes |
|-----------|------|-------|
| Query parsing | `rag/nlp/query.py` | FulltextQueryer class identical |
| Term weighting | `rag/nlp/term_weight.py` | IDF formula, NER, POS identical |
| Synonym lookup | `rag/nlp/synonym.py` | Dictionary + WordNet identical |
| Tokenizer wrapper | `rag/nlp/rag_tokenizer.py` | Infinity wrapper identical |
| OS mapping | `conf/os_mapping.json` | All field templates identical |
| Search dealer | `rag/nlp/search.py` | Core search/rerank logic identical |
| Embedding models | `rag/llm/embedding_model.py` | All 25+ providers identical |
| Rerank models | `rag/llm/rerank_model.py` | All 15+ providers identical |
| OS connection | `rag/utils/opensearch_conn.py` | Query building identical |

### 17.2 Modified Code

| Change | RAGFlow | B-Knowledge | Reason |
|--------|---------|-------------|--------|
| Index prefix | `ragflow_` | `knowledge_` | Branding |
| BE retrieval | N/A | `rag-search.service.ts` | Node.js primary path |
| BE reranking | N/A | `rag-rerank.service.ts` | HTTP reranker APIs |
| BE citations | N/A | `rag-citation.service.ts` | Ported from Python |
| Fusion weights | Hardcoded 5%/95% | Configurable | Admin control |
| Cross-language | N/A | LLM translation | Multilingual support |
| RBAC filtering | Basic | CASL ABAC | Enterprise auth |
| Metadata filters | Limited | Full condition builder | Power user filtering |

### 17.3 Critical Upstream Merge Note

**IMPORTANT when pulling new code from RAGFlow:**

1. **ALWAYS** change `ragflow_` to `knowledge_` in index naming
2. **ALWAYS** verify `os_mapping.json` changes do not break existing fields
3. **CHECK** if new embedding/rerank providers need BE-side support
4. **CHECK** if search.py changes affect the BE retrieval service behavior
5. **TEST** that CJK tokenization still works (RAGFlow may update the tokenizer)

---

## 18. Troubleshooting Guide

### 18.1 "0 Chunks Found" — Most Common Issues

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| **Wrong index prefix** | Index is `ragflow_*` instead of `knowledge_*` | Re-index or see CLAUDE.md migration note |
| **Embedding dimension mismatch** | Chunks have `q_768_vec` but query uses 1024 | Re-embed all chunks with correct model |
| **No KB IDs in filter** | `kb_ids` is empty or wrong | Verify chat assistant has KBs linked |
| **All chunks available_int = 0** | Chunks hidden (RAPTOR, graph) | Check chunk availability |
| **Similarity threshold too high** | All scores below 0.2 | Lower threshold or check embedding |
| **min_match too strict** | 30% of terms not found | System retries at 10% |
| **Stale index after model change** | Old vectors from previous model | Re-embed all chunks |
| **Index does not exist** | Tenant never created | Re-upload a document |

### 18.2 "Results Are Irrelevant"

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| **Poor keyword extraction** | `important_kwd` empty | Re-process with auto-keyword |
| **No question enrichment** | `question_tks` empty | Enable auto-question generation |
| **Vector weight too high** | Semantic mismatches exact terms | Reduce `vector_similarity_weight` |
| **Vector weight too low** | Keywords miss semantics | Increase `vector_similarity_weight` |
| **Wrong embedding model** | Model does not understand domain | Switch to domain-specific model |
| **Chunks too large** | Mixed topics in one chunk | Reduce chunk size |
| **Chunks too small** | Chunks lack context | Increase size or overlap |
| **Missing synonyms** | Domain terms not in dictionary | Add to `synonym.json` |

### 18.3 "Search Is Slow"

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| **Large topk** | KNN searching 1024 | Reduce to 30-64 |
| **Reranker API latency** | External API adds 300-500ms | Use faster reranker or disable |
| **Embedding API latency** | Remote model is slow | Use local embedding model |
| **Large index** | Millions of chunks | Add replicas, increase shards |

### 18.4 "Citations Are Wrong"

| Cause | Diagnosis | Fix |
|-------|-----------|-----|
| **Threshold too low** | Unrelated chunks cited | Increase citation threshold |
| **Sentence splitting** | Non-standard punctuation | Check regex |
| **Dimension mismatch** | Answer and chunk embedding differ | Ensure same model |
| **Chunk text too short** | Short chunks match many sentences | Increase chunk size |

### 18.5 "Different Results Between Chat and Agent"

| Parameter | Node.js BE | Python Worker |
|-----------|-----------|---------------|
| Fusion weights | Configurable (30%/70%) | Hardcoded (5%/95%) |
| Reranking | BE HTTP API | Python model/hybrid |
| Metadata filters | Full conditions | Basic kb_id/doc_id |

**Fix:** Align weights by setting agent node `vector_similarity_weight` to match BE config.

---

## 19. Configuration Reference

### 19.1 Chat Assistant prompt_config

| Parameter | Default | Description |
|-----------|---------|-------------|
| `top_n` | 6 | Chunks to retrieve |
| `similarity_threshold` | 0.2 | Minimum similarity score |
| `vector_similarity_weight` | 0.3 | Vector vs text balance (0=text, 1=vector) |
| `rerank_id` | null | Reranker model provider UUID |
| `refine_multiturn` | false | LLM multi-turn refinement |
| `cross_languages` | "" | Comma-separated target languages |
| `keyword` | false | LLM keyword extraction |
| `toc_enhance` | false | Table-of-Contents retrieval |
| `use_kg` | false | Knowledge Graph retrieval |
| `reasoning` | false | Deep research mode |
| `allow_rbac_datasets` | false | Expand to RBAC-accessible KBs |
| `empty_response` | "Sorry..." | Response when no results |
| `quote` | true | Enable citations |

### 19.2 Search App search_config

| Parameter | Default | Description |
|-----------|---------|-------------|
| `top_k` | 6 | Chunks to retrieve |
| `search_method` | "hybrid" | full_text, semantic, or hybrid |
| `similarity_threshold` | 0.2 | Minimum score |
| `vector_similarity_weight` | 0.3 | Vector vs text balance |
| `rerank_id` | null | Reranker provider UUID |
| `rerank_top_k` | 64 | Input size for reranking |
| `empty_response` | "No results" | Empty response message |
| `tag_ranking_enabled` | false | Tag-based rank features |

### 19.3 Agent Retrieval Node Config

| Parameter | Default | Description |
|-----------|---------|-------------|
| `kb_ids` | [] | Knowledge base IDs |
| `top_k` | 8 | Chunks to retrieve |
| `similarity` | 0.2 | Threshold |
| `vector_similarity_weight` | 0.5 | Vector vs text balance |

### 19.4 Python Worker Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `PAGERANK_FLD` | `"pagerank_fea"` | PageRank field name |
| `TAG_FLD` | `"tag_feas"` | Tag features field name |
| `TEXT_WEIGHT` | 0.05 | FusionExpr text weight |
| `VECTOR_WEIGHT` | 0.95 | FusionExpr vector weight |
| `TKWEIGHT` | 0.3 | Rerank token weight |
| `VTWEIGHT` | 0.7 | Rerank vector weight |
| `RERANK_LIMIT_MIN` | 30 | Minimum rerank candidates |
| `INITIAL_CITATION_THRESHOLD` | 0.63 | Citation matching start |
| `CITATION_DECAY_RATE` | 0.8 | Threshold decay per iteration |
| `MIN_CITATION_THRESHOLD` | 0.3 | Minimum citation threshold |
| `MAX_CITATIONS_PER_SENTENCE` | 4 | Max citations per sentence |
| `MIN_SENTENCE_LENGTH` | 5 | Skip short sentences |
| `EMBEDDING_BATCH_SIZE` | 16 | Embedding batch size |
| `DOC_BULK_SIZE` | 4 | Chunk insert batch size |
| `OS_TIMEOUT` | 600 | OpenSearch timeout (seconds) |
| `ATTEMPT_TIME` | 3 | OpenSearch retry count |
