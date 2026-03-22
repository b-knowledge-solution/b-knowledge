# 04 — Self-RAG Implementation

## Context

### What Self-RAG Is

Self-RAG adds **self-reflection tokens** to the generation process. The model evaluates its own output at multiple points:

```
Question → Retrieve → [IsRetNeeded?] → Generate segment
    → [IsSupportedByChunks?] → [IsUseful?]
    → If not supported: regenerate with different chunks
    → If not useful: retrieve more and retry
    → Output only verified segments
```

**Paper reference**: "Self-RAG: Learning to Retrieve, Generate, and Critique through Self-Reflection" (Asai et al., 2023)

### What We Have Now

- **No generation quality check at all** in the standard pipeline
- TSQDR has `sufficiency_check()` but it checks **retrieval sufficiency before generation**, not **generation quality after generation**
- Citation insertion (`insert_citations()`) matches sentences to chunks but doesn't verify factual correctness

### Why This Matters for Healthcare/SDLC

- Healthcare: A hallucinated drug dosage or contraindication can be dangerous
- SDLC: A fabricated requirement ID or status breaks traceability
- Both domains require every claim to be grounded in source documents

---

## Implementation Plan

### Step 1: Create Self-Evaluation Prompts

**New file**: `advance-rag/rag/prompts/self_rag_evaluate.md`

```markdown
Role: You are a factual accuracy evaluator for RAG-generated answers.

## Task
Evaluate the generated answer against the source chunks.
For each claim in the answer, verify it is supported by the sources.

## User Question
{question}

## Source Chunks
{chunks}

## Generated Answer
{answer}

## Evaluation Instructions
1. Break the answer into individual claims/statements
2. For each claim, check if it is SUPPORTED, PARTIALLY_SUPPORTED, or NOT_SUPPORTED by the sources
3. Score overall faithfulness, relevance, and completeness

## Output Format (JSON only)
{
  "faithfulness_score": 0.0-1.0,
  "relevance_score": 0.0-1.0,
  "completeness_score": 0.0-1.0,
  "overall_score": 0.0-1.0,
  "claims": [
    {
      "claim": "exact text from answer",
      "status": "SUPPORTED" | "PARTIALLY_SUPPORTED" | "NOT_SUPPORTED",
      "source_chunk_ids": [0, 2],
      "issue": "null or description of problem"
    }
  ],
  "should_regenerate": true/false,
  "improvement_suggestions": ["list of specific fixes"]
}
```

### Step 2: Create Self-RAG Module

**New file**: `advance-rag/rag/advanced_rag/self_rag.py`

```python
"""Self-RAG: Self-reflective retrieval-augmented generation.

Implements post-generation evaluation to ensure answer faithfulness
to source chunks. If faithfulness is below threshold, triggers
regeneration with refined context.
"""

import json
import logging
from rag.prompts import generator


class SelfRAG:
    """Self-reflective RAG that evaluates and corrects generated answers.

    Attributes:
        chat_mdl: Chat model for evaluation.
        faithfulness_threshold: Minimum faithfulness score (default 0.8).
        max_retries: Maximum regeneration attempts (default 2).
    """

    def __init__(self, chat_mdl, faithfulness_threshold=0.8, max_retries=2):
        self.chat_mdl = chat_mdl
        self.faithfulness_threshold = faithfulness_threshold
        self.max_retries = max_retries

    async def generate_and_verify(
        self,
        question: str,
        chunks: list[dict],
        generate_fn,
        callback=None,
    ) -> dict:
        """Generate answer with self-reflection loop.

        Args:
            question: User question.
            chunks: Retrieved source chunks.
            generate_fn: Async function(question, chunks) -> answer string.
            callback: Optional progress callback.

        Returns:
            Dict with 'answer', 'evaluation', 'attempts', 'verified'.
        """
        best_answer = None
        best_score = 0.0
        attempts = 0

        for attempt in range(self.max_retries + 1):
            attempts += 1

            # Generate answer
            if attempt == 0:
                answer = await generate_fn(question, chunks)
            else:
                # Regenerate with improvement hints
                refined_question = self._add_improvement_hints(
                    question, evaluation.get("improvement_suggestions", [])
                )
                answer = await generate_fn(refined_question, chunks)

            # Evaluate faithfulness
            evaluation = await self._evaluate(question, chunks, answer)
            score = evaluation.get("overall_score", 0.0)

            if score > best_score:
                best_answer = answer
                best_score = score

            if callback:
                callback(
                    0.5 + (attempt / (self.max_retries + 1)) * 0.4,
                    f"Self-check attempt {attempt + 1}: score={score:.2f}"
                )

            # Good enough — return
            if score >= self.faithfulness_threshold:
                return {
                    "answer": answer,
                    "evaluation": evaluation,
                    "attempts": attempts,
                    "verified": True,
                }

            # Check if there are unsupported claims to fix
            if not evaluation.get("should_regenerate", False):
                break

        # Return best attempt even if below threshold
        return {
            "answer": best_answer,
            "evaluation": evaluation,
            "attempts": attempts,
            "verified": best_score >= self.faithfulness_threshold,
        }

    async def _evaluate(self, question, chunks, answer):
        """Evaluate generated answer against source chunks.

        Args:
            question: User question.
            chunks: Source chunks.
            answer: Generated answer text.

        Returns:
            Evaluation dict with scores and claim-level analysis.
        """
        chunk_texts = []
        for i, c in enumerate(chunks):
            content = c.get("content_with_weight", c.get("content_ltks", ""))
            chunk_texts.append(f"[Chunk {i}]: {content}")

        prompt = self._load_prompt().format(
            question=question,
            chunks="\n\n".join(chunk_texts),
            answer=answer,
        )

        try:
            result = await generator.chat_with_model(
                self.chat_mdl, prompt, response_format="json"
            )
            return json.loads(result)
        except Exception as e:
            logging.warning(f"Self-RAG evaluation failed: {e}")
            return {"overall_score": 1.0, "should_regenerate": False}

    def _add_improvement_hints(self, question, suggestions):
        """Append improvement hints to the question for regeneration.

        Args:
            question: Original question.
            suggestions: List of improvement suggestions.

        Returns:
            Modified question with hints.
        """
        if not suggestions:
            return question
        hints = "\n".join(f"- {s}" for s in suggestions[:3])
        return f"{question}\n\n[Important: {hints}]"

    def _load_prompt(self):
        """Load the self-RAG evaluation prompt template.

        Returns:
            Prompt template string.
        """
        import os
        prompt_path = os.path.join(
            os.path.dirname(__file__),
            "..", "prompts", "self_rag_evaluate.md"
        )
        with open(prompt_path, "r") as f:
            return f.read()
```

### Step 3: Integrate into Chat/Conversation Pipeline

The Self-RAG check should be called by the backend after LLM generation, before returning the answer to the user.

**Integration point**: The backend API that calls the RAG worker for answer generation.

```python
# In the conversation/chat handler:
if self_rag_enabled:
    from rag.advanced_rag.self_rag import SelfRAG
    self_rag = SelfRAG(
        chat_mdl=chat_model,
        faithfulness_threshold=0.8,
        max_retries=1,  # Keep it fast: 1 retry max
    )
    result = await self_rag.generate_and_verify(
        question=user_question,
        chunks=retrieved_chunks,
        generate_fn=llm_generate,
        callback=progress_callback,
    )
    answer = result["answer"]
    # Optionally surface verification status to frontend
    metadata["self_rag_verified"] = result["verified"]
    metadata["self_rag_score"] = result["evaluation"].get("overall_score")
```

### Step 4: Frontend Indicator

Show a verification badge on answers:
- Green checkmark: "Verified against sources" (score >= 0.8)
- Yellow warning: "Partially verified" (0.5 <= score < 0.8)
- Red warning: "Low confidence — check sources" (score < 0.5)

### Step 5: Configuration

```python
# config.py
SELF_RAG_ENABLED = get_bool_env("SELF_RAG_ENABLED", False)
SELF_RAG_FAITHFULNESS_THRESHOLD = float(os.environ.get("SELF_RAG_FAITHFULNESS_THRESHOLD", "0.8"))
SELF_RAG_MAX_RETRIES = int(os.environ.get("SELF_RAG_MAX_RETRIES", "1"))
```

---

## Files to Create/Modify

| Action | File | Description |
|--------|------|-------------|
| CREATE | `rag/prompts/self_rag_evaluate.md` | Self-evaluation prompt template |
| CREATE | `rag/advanced_rag/self_rag.py` | Self-RAG module with generate-and-verify loop |
| MODIFY | `config.py` | Add SELF_RAG_* env vars |
| MODIFY | `.env.example` | Document new env vars |
| MODIFY | Backend chat handler | Call Self-RAG after generation |
| MODIFY | Frontend chat component | Show verification badge |

---

## Performance Considerations

- **Latency**: Adds 1 LLM evaluation call (~500ms-1s). With 1 retry: up to 2 evaluations + 1 regeneration = ~2-3s total.
- **Cost**: ~500-1000 tokens per evaluation call.
- **Mitigation**: Default OFF. Enable per-KB for high-stakes domains (healthcare, legal).
- **Optimization**: For streaming responses, run evaluation on the complete response after streaming finishes, then surface verification status as a follow-up indicator.

---

## Acceptance Criteria

- [ ] Hallucinated claims are detected with >80% accuracy
- [ ] Regeneration produces higher faithfulness scores than initial generation
- [ ] Feature is gated behind config flag (default OFF)
- [ ] Latency increase < 3s for typical queries with 1 retry
- [ ] Frontend shows verification status to users
- [ ] Healthcare test: drug dosage hallucinations caught before delivery
- [ ] SDLC test: fabricated requirement IDs caught before delivery
