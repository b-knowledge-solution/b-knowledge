"""
F1 Metric — Harmonic Mean of Precision and Recall

Balances precision and recall into a single score. A high F1 score requires
*both* high precision (not hallucinating) and high recall (not missing info).

Formula: F1 = 2 * precision * recall / (precision + recall)

This is the primary metric used in the evaluation summary report.

@description F1 metric for RAG evaluation
"""

import string
from collections import Counter

from metrics.precision import compute_precision
from metrics.recall import compute_recall


def compute_f1(predicted: str, expected: str) -> float:
    """
    Compute token-level F1 score between predicted and expected answer.

    @param predicted: The answer returned by the RAG system
    @param expected:  The ground-truth expected answer
    @returns: Float in [0.0, 1.0]
                1.0 = perfect match
                0.0 = no overlap at all
    """
    if not predicted or not expected:
        return 0.0

    precision = compute_precision(predicted, expected)
    recall = compute_recall(predicted, expected)

    # Avoid divide-by-zero when both are 0
    if precision + recall == 0:
        return 0.0

    f1 = 2 * precision * recall / (precision + recall)
    return round(f1, 4)
