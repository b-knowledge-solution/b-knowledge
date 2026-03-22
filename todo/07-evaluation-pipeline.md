# 07 — RAG Evaluation Pipeline (RAGAS Metrics)

## Context

### Why Evaluation is Critical

Without automated evaluation, we cannot:
- Measure if changes actually improve quality
- Set a baseline to compare against
- Detect regressions when modifying the pipeline
- Prove the >90% fidelity target is met
- Compare different RAG configurations objectively

### Current State

No automated evaluation exists. Quality assessment is manual and subjective.

### RAGAS Framework

RAGAS (Retrieval Augmented Generation Assessment) provides standardized metrics:

| Metric | What It Measures | How |
|--------|-----------------|-----|
| **Faithfulness** | Is every claim in the answer grounded in context? | LLM checks each claim against chunks |
| **Answer Relevancy** | Does the answer address the question? | Generate questions from answer, compare to original |
| **Context Precision** | Are retrieved chunks actually relevant? | LLM scores each chunk's relevance |
| **Context Recall** | Did we retrieve all needed information? | Compare retrieved context to ground truth answer |

**Target scores for >90% fidelity:**
- Faithfulness: ≥ 0.90
- Answer Relevancy: ≥ 0.85
- Context Precision: ≥ 0.80
- Context Recall: ≥ 0.85

---

## Implementation Plan

### Step 1: Create Evaluation Dataset

**New file**: `advance-rag/evaluation/datasets/sdlc_eval.json`
**New file**: `advance-rag/evaluation/datasets/healthcare_eval.json`

Each dataset contains Q&A pairs with ground truth:

```json
[
  {
    "question": "What are the functional requirements for user authentication?",
    "ground_truth_answer": "The system shall support SSO via SAML 2.0 (REQ-AUTH-001), multi-factor authentication (REQ-AUTH-002), and session timeout after 30 minutes of inactivity (REQ-AUTH-003).",
    "ground_truth_contexts": [
      "REQ-AUTH-001: The system shall support Single Sign-On via SAML 2.0 protocol...",
      "REQ-AUTH-002: The system shall implement multi-factor authentication..."
    ],
    "metadata": {
      "domain": "sdlc",
      "complexity": "moderate",
      "document_type": "SRS"
    }
  }
]
```

**Minimum dataset sizes:**
- SDLC: 50 Q&A pairs covering requirements, design, testing, traceability
- Healthcare: 50 Q&A pairs covering clinical protocols, drug info, regulatory, lab results

### Step 2: Create Evaluation Module

**New file**: `advance-rag/evaluation/evaluator.py`

```python
"""RAG evaluation pipeline using RAGAS-inspired metrics.

Computes faithfulness, answer relevancy, context precision,
and context recall for RAG pipeline quality assessment.
"""

import json
import logging
import numpy as np
from dataclasses import dataclass, field


@dataclass
class EvaluationResult:
    """Container for evaluation metrics.

    Attributes:
        faithfulness: Score 0-1 indicating answer grounding in context.
        answer_relevancy: Score 0-1 indicating answer addresses question.
        context_precision: Score 0-1 indicating retrieved chunks relevance.
        context_recall: Score 0-1 indicating retrieval completeness.
        overall: Weighted average of all metrics.
        details: Per-question breakdown.
    """
    faithfulness: float = 0.0
    answer_relevancy: float = 0.0
    context_precision: float = 0.0
    context_recall: float = 0.0
    overall: float = 0.0
    details: list = field(default_factory=list)


class RAGEvaluator:
    """Evaluate RAG pipeline quality with RAGAS-style metrics.

    Attributes:
        chat_mdl: Chat model for LLM-based evaluation.
        emb_mdl: Embedding model for similarity computation.
    """

    def __init__(self, chat_mdl, emb_mdl):
        self.chat_mdl = chat_mdl
        self.emb_mdl = emb_mdl

    async def evaluate_dataset(
        self,
        dataset: list[dict],
        retrieval_fn,
        generation_fn,
        callback=None,
    ) -> EvaluationResult:
        """Run full evaluation on a dataset.

        Args:
            dataset: List of evaluation items with question/ground_truth.
            retrieval_fn: async fn(question) -> list[chunk_dicts].
            generation_fn: async fn(question, chunks) -> answer_string.
            callback: Optional progress callback.

        Returns:
            EvaluationResult with aggregated and per-question metrics.
        """
        results = []

        for i, item in enumerate(dataset):
            question = item["question"]
            ground_truth = item["ground_truth_answer"]
            gt_contexts = item.get("ground_truth_contexts", [])

            # Run retrieval
            chunks = await retrieval_fn(question)
            chunk_texts = [c.get("content_with_weight", "") for c in chunks]

            # Run generation
            answer = await generation_fn(question, chunks)

            # Compute metrics
            faith = await self._faithfulness(answer, chunk_texts)
            relevancy = await self._answer_relevancy(question, answer)
            precision = await self._context_precision(question, chunk_texts)
            recall = await self._context_recall(gt_contexts, chunk_texts)

            results.append({
                "question": question,
                "faithfulness": faith,
                "answer_relevancy": relevancy,
                "context_precision": precision,
                "context_recall": recall,
                "answer": answer,
                "num_chunks": len(chunks),
            })

            if callback:
                callback((i + 1) / len(dataset), f"Evaluated {i + 1}/{len(dataset)}")

        # Aggregate
        avg = lambda key: np.mean([r[key] for r in results])
        return EvaluationResult(
            faithfulness=float(avg("faithfulness")),
            answer_relevancy=float(avg("answer_relevancy")),
            context_precision=float(avg("context_precision")),
            context_recall=float(avg("context_recall")),
            overall=float(np.mean([
                avg("faithfulness") * 0.35,
                avg("answer_relevancy") * 0.25,
                avg("context_precision") * 0.20,
                avg("context_recall") * 0.20,
            ]) / 0.25),  # Normalize to 0-1
            details=results,
        )

    async def _faithfulness(self, answer: str, contexts: list[str]) -> float:
        """Evaluate if answer claims are supported by context.

        Args:
            answer: Generated answer.
            contexts: Retrieved context chunks.

        Returns:
            Faithfulness score 0-1.
        """
        prompt = f"""Extract all factual claims from the answer.
For each claim, check if it is supported by the provided context.

Answer: {answer}

Context:
{chr(10).join(f'[{i}] {c[:500]}' for i, c in enumerate(contexts))}

Return JSON:
{{
  "claims": [
    {{"claim": "...", "supported": true/false}}
  ]
}}"""

        try:
            result = await self._llm_call(prompt)
            data = json.loads(result)
            claims = data.get("claims", [])
            if not claims:
                return 1.0
            supported = sum(1 for c in claims if c.get("supported", False))
            return supported / len(claims)
        except Exception:
            return 0.5  # Unknown

    async def _answer_relevancy(self, question: str, answer: str) -> float:
        """Evaluate if answer addresses the question.

        Generates synthetic questions from the answer and measures
        similarity to the original question.

        Args:
            question: Original question.
            answer: Generated answer.

        Returns:
            Relevancy score 0-1.
        """
        prompt = f"""Given this answer, generate 3 questions that this answer would address.

Answer: {answer}

Return JSON: {{"questions": ["q1", "q2", "q3"]}}"""

        try:
            result = await self._llm_call(prompt)
            data = json.loads(result)
            gen_questions = data.get("questions", [])
            if not gen_questions:
                return 0.5

            # Compute embedding similarity between original and generated questions
            q_emb, _ = self.emb_mdl.encode([question])
            gen_embs, _ = self.emb_mdl.encode(gen_questions)

            similarities = []
            for ge in gen_embs:
                cos_sim = np.dot(q_emb[0], ge) / (np.linalg.norm(q_emb[0]) * np.linalg.norm(ge) + 1e-8)
                similarities.append(float(cos_sim))

            return float(np.mean(similarities))
        except Exception:
            return 0.5

    async def _context_precision(self, question: str, contexts: list[str]) -> float:
        """Evaluate if retrieved chunks are relevant to the question.

        Args:
            question: User question.
            contexts: Retrieved context chunks.

        Returns:
            Precision score 0-1.
        """
        if not contexts:
            return 0.0

        prompt = f"""For each context chunk, rate its relevance to the question (0 or 1).

Question: {question}

Chunks:
{chr(10).join(f'[{i}] {c[:300]}' for i, c in enumerate(contexts[:10]))}

Return JSON: {{"relevance": [0 or 1 for each chunk]}}"""

        try:
            result = await self._llm_call(prompt)
            data = json.loads(result)
            relevance = data.get("relevance", [])
            if not relevance:
                return 0.5
            return sum(relevance) / len(relevance)
        except Exception:
            return 0.5

    async def _context_recall(self, ground_truth_contexts: list[str], retrieved_contexts: list[str]) -> float:
        """Evaluate if retrieval captured all needed information.

        Args:
            ground_truth_contexts: Expected context passages.
            retrieved_contexts: Actually retrieved passages.

        Returns:
            Recall score 0-1.
        """
        if not ground_truth_contexts:
            return 1.0
        if not retrieved_contexts:
            return 0.0

        # Embedding-based: check if each GT context has a close match in retrieved
        gt_embs, _ = self.emb_mdl.encode(ground_truth_contexts)
        ret_embs, _ = self.emb_mdl.encode(retrieved_contexts[:20])

        recalled = 0
        for gt_emb in gt_embs:
            max_sim = max(
                np.dot(gt_emb, re) / (np.linalg.norm(gt_emb) * np.linalg.norm(re) + 1e-8)
                for re in ret_embs
            )
            if max_sim >= 0.7:  # Threshold for "recalled"
                recalled += 1

        return recalled / len(gt_embs)

    async def _llm_call(self, prompt: str) -> str:
        """Make an LLM call for evaluation.

        Args:
            prompt: Evaluation prompt.

        Returns:
            LLM response string.
        """
        from rag.prompts import generator
        return await generator.chat_with_model(
            self.chat_mdl, prompt, response_format="json"
        )
```

### Step 3: Create CLI Runner

**New file**: `advance-rag/evaluation/run_eval.py`

```python
"""CLI tool to run RAG evaluation against a dataset.

Usage:
    python -m evaluation.run_eval \
        --dataset evaluation/datasets/sdlc_eval.json \
        --kb-id <knowledge-base-id> \
        --output evaluation/results/sdlc_results.json
"""

import argparse
import asyncio
import json
import sys


async def main():
    parser = argparse.ArgumentParser(description="Run RAG evaluation")
    parser.add_argument("--dataset", required=True, help="Path to evaluation dataset JSON")
    parser.add_argument("--kb-id", required=True, help="Knowledge base ID to evaluate")
    parser.add_argument("--output", default="evaluation/results/eval_results.json")
    parser.add_argument("--tenant-id", default="00000000-0000-0000-0000-000000000001")
    args = parser.parse_args()

    # Load dataset
    with open(args.dataset) as f:
        dataset = json.load(f)

    print(f"Loaded {len(dataset)} evaluation items")
    print(f"Target KB: {args.kb_id}")

    # Initialize models and evaluator
    # ... (setup code using existing model loading from config)

    # Run evaluation
    # ... (call evaluator.evaluate_dataset)

    # Output results
    # ... (save to JSON, print summary table)


if __name__ == "__main__":
    asyncio.run(main())
```

### Step 4: Integration with CI

Create a script that can run as part of CI/CD:

```bash
#!/bin/bash
# evaluation/run_ci_eval.sh
# Run evaluation and fail if below thresholds

python -m evaluation.run_eval \
    --dataset evaluation/datasets/sdlc_eval.json \
    --kb-id $EVAL_KB_ID \
    --output evaluation/results/latest.json

# Check thresholds
python -c "
import json, sys
r = json.load(open('evaluation/results/latest.json'))
thresholds = {'faithfulness': 0.90, 'answer_relevancy': 0.85, 'context_precision': 0.80, 'context_recall': 0.85}
failed = {k: v for k, v in thresholds.items() if r.get(k, 0) < v}
if failed:
    print(f'FAIL: Below threshold: {failed}')
    sys.exit(1)
print(f'PASS: All metrics above threshold. Overall: {r[\"overall\"]:.2%}')
"
```

---

## Files to Create

| Action | File | Description |
|--------|------|-------------|
| CREATE | `evaluation/__init__.py` | Package init |
| CREATE | `evaluation/evaluator.py` | RAGAS-style evaluation engine |
| CREATE | `evaluation/run_eval.py` | CLI evaluation runner |
| CREATE | `evaluation/run_ci_eval.sh` | CI/CD evaluation script |
| CREATE | `evaluation/datasets/sdlc_eval.json` | SDLC evaluation dataset (50+ Q&A) |
| CREATE | `evaluation/datasets/healthcare_eval.json` | Healthcare evaluation dataset (50+ Q&A) |
| CREATE | `evaluation/results/.gitkeep` | Results directory |

---

## Dataset Creation Guidelines

### SDLC Dataset (50 items minimum)

Cover these query types:
- **Requirement lookup** (10): "What is REQ-042?", "List all authentication requirements"
- **Traceability** (10): "What tests cover FR-3.2?", "Which requirements map to Module X?"
- **Status queries** (5): "Which requirements are still in Draft?", "Show approved design decisions"
- **Cross-reference** (10): "How does Section 3.2 relate to Section 5.1?"
- **Comparative** (5): "What changed between v1.0 and v2.0 SRS?"
- **Procedural** (5): "What is the deployment process?", "Steps for code review"
- **Multi-hop** (5): "Which test cases verify requirements that depend on Module Auth?"

### Healthcare Dataset (50 items minimum)

Cover these query types:
- **Clinical lookup** (10): "What is the protocol for hypertension management?"
- **Drug information** (10): "What are contraindications for metformin?", "Dosage for amoxicillin pediatric"
- **Regulatory** (10): "What does 21 CFR 820 require for CAPA?", "HIPAA requirements for PHI access logs"
- **Lab results** (5): "Normal range for TSH?", "What does elevated CRP indicate?"
- **Evidence-based** (5): "What is the Level I evidence for statin therapy?"
- **Cross-reference** (5): "How does ICD M54.5 map to CPT codes?"
- **Procedural** (5): "Pre-operative checklist for cardiac surgery"

---

## Acceptance Criteria

- [ ] Evaluation framework runs end-to-end on sample dataset
- [ ] All 4 RAGAS metrics computed correctly
- [ ] Results saved as JSON with per-question breakdown
- [ ] CI script exits non-zero when metrics below threshold
- [ ] Baseline measurement established before any enhancement
- [ ] Each enhancement (01-06) shows measurable improvement
- [ ] Final metrics: faithfulness ≥ 0.90, overall ≥ 0.85
