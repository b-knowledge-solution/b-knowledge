"""
Metrics Module for RAG Evaluation

Public API for all evaluation metrics. Import from here, not from sub-modules.

Available functions:
  compute_accuracy(predicted, expected, mode="semantic") -> float
  compute_precision(predicted, expected) -> float
  compute_recall(predicted, expected) -> float
  compute_f1(predicted, expected) -> float
  score_all(predicted, expected) -> dict  ← use this for the report pipeline

@example
    from metrics import score_all
    scores = score_all(predicted="Bearer token is used.", expected="Use Bearer token in Authorization header.")
    # → {"accuracy": 0.57, "precision": 0.75, "recall": 0.5, "f1": 0.6}
"""

from metrics.accuracy import compute_accuracy
from metrics.precision import compute_precision
from metrics.recall import compute_recall
from metrics.f1 import compute_f1
from typing import Dict


def score_all(predicted: str, expected: str) -> Dict[str, float]:
    """
    Compute all four metrics in one call.

    This is the primary entry point used by the evaluation pipeline to
    score each Q&A pair. The result dict maps directly to report columns.

    @param predicted: The answer returned by the RAG system
    @param expected:  The ground-truth expected answer
    @returns: Dict with keys: accuracy, precision, recall, f1 (all float 0-1)
    """
    return {
        "accuracy":  compute_accuracy(predicted, expected, mode="semantic"),
        "precision": compute_precision(predicted, expected),
        "recall":    compute_recall(predicted, expected),
        "f1":        compute_f1(predicted, expected),
    }


__all__ = [
    "compute_accuracy",
    "compute_precision",
    "compute_recall",
    "compute_f1",
    "score_all",
]
