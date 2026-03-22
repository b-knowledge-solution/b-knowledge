# 01 — Corrective RAG Implementation

## Context

### What We Have Now (NOT Corrective RAG)

The current reranker (`search.py:412-505`) performs **scoring and re-sorting** only:

```
Retrieve top-K → Rerank by score → Return sorted list → Send ALL to LLM
```

- **Heuristic rerank** (`rerank()`): `0.3 × token_sim + 0.7 × vector_sim + rank_features`
- **Model rerank** (`rerank_by_model()`): Uses Cohere/Jina relevance scoring
- Both methods **never reject chunks** — low-score chunks still pollute the LLM context
- `similarity_threshold` filter at line 604 only removes chunks below a very low bar (default 0.2)

### What Corrective RAG Actually Is

Corrective RAG (CRAG) adds an **evaluator-decision-action** loop after retrieval:

```
Retrieve → Rerank → [Evaluate each chunk] → [Decide: correct/ambiguous/incorrect]
                         → correct: keep as-is
                         → ambiguous: extract key sentences only
                         → incorrect: discard + trigger knowledge refinement
                     → [If too few correct chunks: expand search]
                     → Generate with cleaned context
```

**Paper reference**: "Corrective Retrieval Augmented Generation" (Yan et al., 2024)

### Why Our Reranker Doesn't Qualify

| Corrective RAG Feature | Our Reranker | Gap |
|------------------------|-------------|-----|
| Classify chunks as correct/ambiguous/incorrect | No — only scores | LLM-based relevance classification needed |
| Discard incorrect chunks | No — all pass through | Add filtering based on classification |
| Extract key info from ambiguous chunks | No | Add sentence-level extraction |
| Trigger alternative retrieval when insufficient | Only `min_match` fallback | Need web search / broader KB expansion |
| Knowledge refinement | No | Need to refine/decompose for better re-retrieval |

### The Closest Thing We Have

`sufficiency_check()` in TSQDR (`tree_structured_query_decomposition_retrieval.py`) evaluates whether retrieved content is sufficient and generates follow-up queries. But this:
- Only runs in deep research mode, not standard retrieval
- Evaluates the **entire set**, not individual chunks
- Doesn't classify or filter individual chunks

---

## Implementation Plan

### Step 1: Create Chunk Relevance Classifier

**New file**: `advance-rag/rag/prompts/chunk_relevance_check.md`

```markdown
Role: You are a retrieval quality evaluator.

Task: Given a user question and a retrieved text chunk, classify the chunk's relevance.

## User Question
{question}

## Retrieved Chunk
{chunk_content}

## Instructions
Classify this chunk into exactly one category:
- **correct**: The chunk contains information directly relevant to answering the question
- **ambiguous**: The chunk contains partially relevant information mixed with irrelevant content
- **incorrect**: The chunk is not relevant to the question at all

For "ambiguous" chunks, extract ONLY the sentences that are relevant.

## Output Format (JSON only)
{
  "classification": "correct" | "ambiguous" | "incorrect",
  "confidence": 0.0-1.0,
  "relevant_sentences": ["only for ambiguous chunks"],
  "reasoning": "one-line explanation"
}
```

### Step 2: Add Corrective RAG Function to Generator

**File**: `advance-rag/rag/prompts/generator.py`

Add function `corrective_rag_filter()`:

```python
async def corrective_rag_filter(
    chat_mdl,
    question: str,
    chunks: list[dict],
    min_correct_chunks: int = 3,
    batch_size: int = 5
) -> tuple[list[dict], list[str]]:
    """Classify and filter retrieved chunks using Corrective RAG.

    Args:
        chat_mdl: Chat model for classification.
        question: User's original question.
        chunks: Retrieved chunks with 'content_with_weight' field.
        min_correct_chunks: Minimum correct chunks before triggering expansion.
        batch_size: Number of chunks to evaluate in parallel.

    Returns:
        Tuple of (filtered_chunks, missing_info_list).
        filtered_chunks contains only correct + refined ambiguous chunks.
        missing_info_list is non-empty if expansion is needed.
    """
    # 1. Batch-classify chunks (parallel LLM calls)
    # 2. Keep "correct" chunks as-is
    # 3. Replace "ambiguous" chunks with extracted relevant_sentences only
    # 4. Discard "incorrect" chunks
    # 5. If len(correct + ambiguous) < min_correct_chunks:
    #    return (filtered, ["insufficient relevant context"])
    # 6. Return (filtered, [])
```

**Optimization**: To avoid N separate LLM calls, batch 3-5 chunks per prompt:

```markdown
Classify each of the following chunks for relevance to the question.

## Question: {question}

## Chunk 1: {chunk_1}
## Chunk 2: {chunk_2}
## Chunk 3: {chunk_3}

Output JSON array with classification for each chunk.
```

### Step 3: Integrate into Retrieval Pipeline

**File**: `advance-rag/rag/nlp/search.py`

Modify `Dealer.retrieval()` method (around line 595):

```python
# CURRENT FLOW (line 595-616):
# sim_np = np.array(sim) → sort → filter by threshold → paginate → return

# NEW FLOW:
# 1. Sort + filter by threshold (existing)
# 2. Take top page_size * 2 chunks (over-fetch for filtering headroom)
# 3. Call corrective_rag_filter() on these chunks
# 4. If missing_info returned → trigger expanded search
# 5. Return filtered chunks
```

**Key changes to `retrieval()` signature**:
```python
async def retrieval(
    self,
    question,
    embd_mdl,
    tenant_ids,
    kb_ids,
    page,
    page_size,
    similarity_threshold=0.2,
    vector_similarity_weight=0.3,
    top=1024,
    doc_ids=None,
    aggs=True,
    rerank_mdl=None,
    highlight=False,
    rank_feature=None,
    chat_mdl=None,              # NEW: for corrective RAG
    corrective_rag=False,       # NEW: enable/disable flag
):
```

### Step 4: Add Expansion Trigger

When corrective RAG determines insufficient correct chunks:

```python
# In retrieval(), after corrective filter:
if missing_info and corrective_rag:
    # Strategy 1: Broaden search with lower similarity threshold
    expanded_req = {**req, "similarity": max(0.05, similarity_threshold - 0.15)}
    expanded_sres = await self.search(expanded_req, ...)

    # Strategy 2: If still insufficient, try other KBs in same tenant
    # (only if doc_ids filter was restricting scope)

    # Re-run corrective filter on expanded results
    # Merge with existing correct chunks (deduplicate by chunk_id)
```

### Step 5: Configuration

**File**: `advance-rag/config.py`

```python
# Corrective RAG settings
CORRECTIVE_RAG_ENABLED = get_bool_env("CORRECTIVE_RAG_ENABLED", False)
CORRECTIVE_RAG_MIN_CORRECT = int(os.environ.get("CORRECTIVE_RAG_MIN_CORRECT", "3"))
CORRECTIVE_RAG_BATCH_SIZE = int(os.environ.get("CORRECTIVE_RAG_BATCH_SIZE", "5"))
```

**File**: `advance-rag/.env.example`

```env
# Corrective RAG — LLM-based chunk relevance filtering
CORRECTIVE_RAG_ENABLED=false
CORRECTIVE_RAG_MIN_CORRECT=3
CORRECTIVE_RAG_BATCH_SIZE=5
```

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `rag/prompts/chunk_relevance_check.md` | Chunk classification prompt template |
| MODIFY | `rag/prompts/generator.py` | Add `corrective_rag_filter()` function |
| MODIFY | `rag/nlp/search.py` | Integrate corrective filter into `Dealer.retrieval()` |
| MODIFY | `config.py` | Add CORRECTIVE_RAG_* env vars |
| MODIFY | `.env.example` | Document new env vars |

---

## Performance Considerations

- **Latency**: Adds 1-2 LLM calls per query (batched classification). ~500ms-1s extra.
- **Cost**: ~200-500 tokens per classification batch. For 10 chunks in batches of 5 = 2 LLM calls.
- **Mitigation**: Gate behind `corrective_rag=True` flag, default OFF. Enable per-KB or per-query.
- **Caching**: Use existing LLM cache (`rag/llm/` cache layer) — same question + same chunks = same classification.

---

## Acceptance Criteria

- [ ] Chunks classified as "incorrect" are never sent to LLM for generation
- [ ] "Ambiguous" chunks are refined to relevant sentences only
- [ ] When < 3 correct chunks remain, expanded search triggers automatically
- [ ] Feature is gated behind config flag (default OFF)
- [ ] Latency increase < 1.5s for typical queries (10 chunks, batch of 5)
- [ ] Works with both heuristic and model-based reranking
- [ ] Evaluation shows measurable fidelity improvement on test set

---

## Testing Plan

1. **Unit test**: Mock LLM responses, verify classification → filtering logic
2. **Integration test**: Real LLM with known-good and known-bad chunks
3. **A/B comparison**: Same queries with corrective_rag=True vs False
4. **Healthcare test set**: Medical Q&A where incorrect chunks cause hallucination
5. **SDLC test set**: Requirements traceability queries
