# 03 — Semantic Chunking Implementation

## Context

### What We Have Now (Naive Chunking Only)

Current chunking (`rag/nlp/__init__.py:1070-1126`) is purely **delimiter-based**:

```python
# naive_merge: split on delimiters, merge until token budget exceeded
delimiters = "\n。；！？"
chunk_token_num = 512
```

**How it works:**
1. Split text by delimiters (`\n`, `。`, etc.)
2. Merge consecutive pieces until `chunk_token_num` exceeded
3. Start new chunk
4. Optional: overlap by `overlapped_percent`

**No semantic awareness at all:**
- Two unrelated paragraphs on the same page get merged into one chunk
- A coherent section gets split mid-sentence when hitting 512 tokens
- Cross-references break ("As described in Section 3.2..." but Section 3.2 is in another chunk)

### We Also Have Hierarchical Merger (Underused)

`rag/flow/hierarchical_merger/hierarchical_merger.py` exists and can:
- Detect heading levels via regex
- Build a tree of sections
- Merge at configurable hierarchy depth

**But:**
- Only available in the custom pipeline (dataflow) path
- Not used in the default naive parser path
- Doesn't handle documents without clear heading structure (e.g., clinical narratives)
- Still uses token-count-based merging within each section

### What Semantic Chunking Is

Semantic chunking uses **embedding similarity** between consecutive text segments to find natural break points:

```
Sentence 1: "The patient presents with chest pain."     ─┐
Sentence 2: "ECG shows ST elevation in leads V1-V4."    ─┤ High similarity → same chunk
Sentence 3: "Troponin levels are elevated at 2.5 ng/mL." ┘
Sentence 4: "Patient medications include aspirin 81mg."   ─┐ Low similarity → new chunk
Sentence 5: "Allergies: penicillin, sulfa drugs."         ─┘
```

**Key idea:** Split where semantic similarity drops below a threshold, rather than at arbitrary token boundaries.

---

## Implementation Plan

### Step 1: Create Semantic Splitter Component

**New file**: `advance-rag/rag/flow/splitter/semantic_splitter.py`

```python
"""Semantic chunking splitter that uses embedding similarity.

Splits text at semantic boundaries by computing embedding similarity
between consecutive sentences. When similarity drops below a
percentile-based threshold, a new chunk boundary is created.
"""

import numpy as np
import re
from common.token_utils import num_tokens_from_string


class SemanticSplitter:
    """Split text into semantically coherent chunks.

    Uses embedding model to compute inter-sentence similarity and
    splits at points where similarity drops significantly.

    Attributes:
        emb_model: Embedding model for encoding sentences.
        breakpoint_percentile: Percentile threshold for split decisions.
        min_chunk_tokens: Minimum tokens per chunk.
        max_chunk_tokens: Maximum tokens per chunk.
        sentence_overlap: Number of sentences to overlap between chunks.
    """

    def __init__(
        self,
        emb_model,
        breakpoint_percentile: float = 75.0,
        min_chunk_tokens: int = 100,
        max_chunk_tokens: int = 800,
        sentence_overlap: int = 1,
    ):
        self.emb_model = emb_model
        self.breakpoint_percentile = breakpoint_percentile
        self.min_chunk_tokens = min_chunk_tokens
        self.max_chunk_tokens = max_chunk_tokens
        self.sentence_overlap = sentence_overlap

    def split(self, text: str) -> list[str]:
        """Split text into semantically coherent chunks.

        Args:
            text: Input text to split.

        Returns:
            List of chunk strings.
        """
        # 1. Split into sentences
        sentences = self._split_sentences(text)
        if len(sentences) <= 1:
            return [text] if text.strip() else []

        # 2. Create sentence groups (window of 3 for context)
        groups = self._create_sentence_groups(sentences, window_size=3)

        # 3. Embed all groups
        embeddings = self._embed_groups(groups)

        # 4. Compute inter-group similarities
        similarities = self._compute_similarities(embeddings)

        # 5. Find breakpoints where similarity drops
        breakpoints = self._find_breakpoints(similarities)

        # 6. Create chunks from breakpoints
        chunks = self._create_chunks(sentences, breakpoints)

        # 7. Enforce token limits (split oversized, merge undersized)
        chunks = self._enforce_token_limits(chunks)

        return chunks

    def _split_sentences(self, text: str) -> list[str]:
        """Split text into sentences with multi-language support.

        Args:
            text: Input text.

        Returns:
            List of sentence strings.
        """
        # Handle CJK and Western sentence boundaries
        pattern = r'(?<=[.!?。！？；\n])\s+'
        sentences = re.split(pattern, text)
        # Filter empty and merge very short fragments
        return [s.strip() for s in sentences if s.strip() and len(s.strip()) > 5]

    def _create_sentence_groups(self, sentences: list[str], window_size: int = 3) -> list[str]:
        """Create overlapping sentence groups for embedding.

        Each group contains `window_size` consecutive sentences to
        provide context for more meaningful embeddings.

        Args:
            sentences: List of sentences.
            window_size: Number of sentences per group.

        Returns:
            List of concatenated sentence group strings.
        """
        groups = []
        for i in range(len(sentences)):
            start = max(0, i - window_size // 2)
            end = min(len(sentences), i + window_size // 2 + 1)
            group = " ".join(sentences[start:end])
            groups.append(group)
        return groups

    def _embed_groups(self, groups: list[str]) -> np.ndarray:
        """Encode sentence groups into embeddings.

        Args:
            groups: List of sentence group strings.

        Returns:
            2D numpy array of shape (n_groups, embedding_dim).
        """
        embeddings, _ = self.emb_model.encode(groups)
        return np.array(embeddings)

    def _compute_similarities(self, embeddings: np.ndarray) -> list[float]:
        """Compute cosine similarity between consecutive embeddings.

        Args:
            embeddings: 2D array of embeddings.

        Returns:
            List of similarity scores (length = n_embeddings - 1).
        """
        similarities = []
        for i in range(len(embeddings) - 1):
            a = embeddings[i]
            b = embeddings[i + 1]
            # Cosine similarity
            cos_sim = np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8)
            similarities.append(float(cos_sim))
        return similarities

    def _find_breakpoints(self, similarities: list[float]) -> list[int]:
        """Find indices where semantic similarity drops below threshold.

        Uses percentile-based threshold: breakpoints occur where
        similarity is in the bottom (100 - percentile)% of all values.

        Args:
            similarities: List of inter-sentence similarity scores.

        Returns:
            Sorted list of breakpoint indices.
        """
        if not similarities:
            return []

        threshold = np.percentile(similarities, 100 - self.breakpoint_percentile)
        breakpoints = [i for i, sim in enumerate(similarities) if sim < threshold]
        return sorted(breakpoints)

    def _create_chunks(self, sentences: list[str], breakpoints: list[int]) -> list[str]:
        """Group sentences into chunks based on breakpoints.

        Args:
            sentences: List of sentences.
            breakpoints: Indices where chunks should split.

        Returns:
            List of chunk strings.
        """
        chunks = []
        start = 0

        for bp in breakpoints:
            chunk_idx = bp + 1  # breakpoint is between bp and bp+1
            chunk_text = " ".join(sentences[start:chunk_idx])
            if chunk_text.strip():
                chunks.append(chunk_text.strip())
            start = max(0, chunk_idx - self.sentence_overlap)

        # Last chunk
        if start < len(sentences):
            chunk_text = " ".join(sentences[start:])
            if chunk_text.strip():
                chunks.append(chunk_text.strip())

        return chunks

    def _enforce_token_limits(self, chunks: list[str]) -> list[str]:
        """Split oversized chunks and merge undersized ones.

        Args:
            chunks: List of chunk strings.

        Returns:
            List of chunk strings within token limits.
        """
        result = []
        buffer = ""
        buffer_tokens = 0

        for chunk in chunks:
            chunk_tokens = num_tokens_from_string(chunk)

            # Oversized: split by sentences
            if chunk_tokens > self.max_chunk_tokens:
                if buffer:
                    result.append(buffer.strip())
                    buffer = ""
                    buffer_tokens = 0
                # Fallback to naive split for oversized chunks
                sentences = self._split_sentences(chunk)
                sub_chunk = ""
                sub_tokens = 0
                for sent in sentences:
                    sent_tokens = num_tokens_from_string(sent)
                    if sub_tokens + sent_tokens > self.max_chunk_tokens and sub_chunk:
                        result.append(sub_chunk.strip())
                        sub_chunk = ""
                        sub_tokens = 0
                    sub_chunk += " " + sent
                    sub_tokens += sent_tokens
                if sub_chunk.strip():
                    result.append(sub_chunk.strip())
                continue

            # Undersized: accumulate in buffer
            if buffer_tokens + chunk_tokens < self.min_chunk_tokens:
                buffer += " " + chunk
                buffer_tokens += chunk_tokens
            else:
                if buffer:
                    combined = buffer + " " + chunk
                    combined_tokens = num_tokens_from_string(combined)
                    if combined_tokens <= self.max_chunk_tokens:
                        result.append(combined.strip())
                        buffer = ""
                        buffer_tokens = 0
                    else:
                        result.append(buffer.strip())
                        buffer = chunk
                        buffer_tokens = chunk_tokens
                else:
                    result.append(chunk.strip())

        if buffer.strip():
            result.append(buffer.strip())

        return result
```

### Step 2: Integrate into Splitter Component

**File**: `advance-rag/rag/flow/splitter/splitter.py`

Add `semantic` as a chunking method option in `SplitterParam`:

```python
class SplitterParam(ProcessParamBase):
    def __init__(self):
        super().__init__()
        self.chunk_token_size = 512
        self.delimiters = ["\n"]
        self.overlapped_percent = 0
        self.children_delimiters = []
        self.table_context_size = 0
        self.image_context_size = 0
        self.chunking_method = "naive"  # NEW: "naive" | "semantic"
        self.breakpoint_percentile = 75.0  # NEW: for semantic chunking
```

In `Splitter._invoke()`, add semantic path:

```python
if self._param.chunking_method == "semantic" and emb_mdl:
    from rag.flow.splitter.semantic_splitter import SemanticSplitter
    splitter = SemanticSplitter(
        emb_model=emb_mdl,
        breakpoint_percentile=self._param.breakpoint_percentile,
        min_chunk_tokens=100,
        max_chunk_tokens=self._param.chunk_token_size,
    )
    cks = splitter.split(payload)
    self.set_output("chunks", [{"text": c} for c in cks if c.strip()])
    self.callback(1, "Done (semantic).")
    return
```

### Step 3: Add to Naive Parser Path

**File**: `advance-rag/rag/app/naive.py`

Add semantic chunking option alongside existing `naive_merge`:

```python
# In the chunk() function, after parsing:
if parser_config.get("chunking_method") == "semantic" and emb_mdl:
    from rag.flow.splitter.semantic_splitter import SemanticSplitter
    splitter = SemanticSplitter(
        emb_model=emb_mdl,
        max_chunk_tokens=parser_config.get("chunk_token_num", 512),
    )
    chunks = splitter.split(full_text)
    # Convert to standard chunk format with metadata
else:
    # Existing naive_merge path (unchanged)
    chunks = naive_merge(sections, chunk_token_num, delimiter)
```

### Step 4: Add to Task Executor

**File**: `advance-rag/rag/svr/task_executor.py`

Pass embedding model to the chunking step when semantic mode is enabled:

```python
# During document processing, check parser_config for chunking_method
chunking_method = task.get("parser_config", {}).get("chunking_method", "naive")
if chunking_method == "semantic":
    # Ensure embedding model is loaded before chunking
    # Pass emb_mdl to the parser/splitter
```

### Step 5: KB Configuration

**Backend change** (`be/`): Add `chunking_method` to knowledge base parser config schema.

**Frontend change** (`fe/`): Add dropdown in KB settings:
- "Naive (delimiter-based)" — default
- "Semantic (embedding-based)" — recommended for narrative/unstructured docs

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `rag/flow/splitter/semantic_splitter.py` | Semantic chunking implementation |
| MODIFY | `rag/flow/splitter/splitter.py` | Add `chunking_method` param and semantic path |
| MODIFY | `rag/app/naive.py` | Add semantic chunking option to chunk() |
| MODIFY | `rag/svr/task_executor.py` | Pass emb_mdl for semantic chunking |
| MODIFY | `config.py` | Add SEMANTIC_CHUNKING defaults |

---

## Performance Considerations

- **Embedding cost**: ~N sentences × embedding_dim computation. For a 10-page doc with 200 sentences, this is ~200 embedding calls.
- **Mitigation**: Use batch encoding (`emb_model.encode()` already supports batching with `EMBEDDING_BATCH_SIZE`)
- **Latency**: ~2-5s extra per document during ingestion (not query-time)
- **When to use**: Enable for narrative documents (healthcare reports, SDLC specs). Disable for structured data (tables, code, Q&A).

---

## Acceptance Criteria

- [ ] Semantic splitter produces chunks where content within each chunk is thematically coherent
- [ ] No chunk exceeds `max_chunk_tokens`
- [ ] No chunk is below `min_chunk_tokens` (unless document is very short)
- [ ] Works with all supported embedding models (OpenAI, Ollama, Gemini, etc.)
- [ ] Configurable per KB via `parser_config.chunking_method`
- [ ] Default remains "naive" for backward compatibility
- [ ] Evaluation: semantic chunks produce 10-15% higher retrieval precision than naive on narrative docs
