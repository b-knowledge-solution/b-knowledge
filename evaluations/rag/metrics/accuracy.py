"""
Accuracy Metric — Exact and Semantic Match

Computes how "correct" an LLM response is compared to the expected answer.
Two scoring modes:

  exact   — Normalized string equality. Strict, 0 or 1.
  semantic — Token-level F1 overlap (same as SQuAD). Partial credit 0→1.
             Does NOT require a live LLM judge, so it works without an API key.

The semantic mode is the default and is used by the evaluation pipeline.

@description Accuracy metric for RAG evaluation
"""

import re
import string
from collections import Counter
from typing import Literal


def _normalize(text: str) -> str:
    """
    Lowercase, strip punctuation and extra whitespace.

    @param text: Raw string
    @returns: Normalized string
    """
    # Lowercase
    text = text.lower()
    # Remove punctuation
    text = text.translate(str.maketrans("", "", string.punctuation))
    # Collapse whitespace
    text = " ".join(text.split())
    return text


def _token_counts(text: str) -> Counter:
    """
    Return a Counter of tokens after normalization.

    @param text: Input string
    @returns: Counter mapping token → count
    """
    return Counter(_normalize(text).split())


def compute_accuracy(
    predicted: str,
    expected: str,
    mode: Literal["exact", "semantic"] = "semantic",
) -> float:
    """
    Compute accuracy between predicted and expected answer.

    Exact mode:
      Returns 1.0 if normalized strings are identical, 0.0 otherwise.

    Semantic mode (token F1, default):
      Counts shared tokens between predicted and expected.
      Score = 2 * precision * recall / (precision + recall)
      This is the same formula used in SQuAD QA benchmarks.
      It gives partial credit for partially correct answers.

    @param predicted: The answer returned by the RAG system
    @param expected:  The ground-truth expected answer
    @param mode:      "exact" or "semantic" (default: semantic)
    @returns: Float in [0.0, 1.0]
    """
    if not predicted or not expected:
        return 0.0

    if mode == "exact":
        # Strict normalized equality
        return 1.0 if _normalize(predicted) == _normalize(expected) else 0.0

    # Semantic: token-level F1
    pred_counts = _token_counts(predicted)
    exp_counts = _token_counts(expected)

    # Common tokens (intersection with minimum counts)
    common_tokens = sum((pred_counts & exp_counts).values())

    if common_tokens == 0:
        return 0.0

    # Precision: how many predicted tokens are correct
    precision = common_tokens / sum(pred_counts.values())
    # Recall: how many expected tokens were found
    recall = common_tokens / sum(exp_counts.values())

    # F1 harmonic mean
    f1 = 2 * precision * recall / (precision + recall)
    return round(f1, 4)
