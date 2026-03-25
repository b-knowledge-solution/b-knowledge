"""
Recall Metric — Coverage of Expected Answer

Measures what fraction of words in the expected answer also appear in the
predicted answer. High recall means the system did not miss important
information from the ground truth.

Formula: recall = |shared tokens| / |expected tokens|

A predicted answer that covers all key points of the expected answer scores
higher than one that only addresses part of it. Complement with precision to
get the full picture.

@description Recall metric for RAG evaluation
"""

import string
from collections import Counter


def _normalize(text: str) -> str:
    """
    Lowercase, strip punctuation and extra whitespace.

    @param text: Raw string
    @returns: Normalized string
    """
    text = text.lower()
    text = text.translate(str.maketrans("", "", string.punctuation))
    return " ".join(text.split())


def compute_recall(predicted: str, expected: str) -> float:
    """
    Compute token-level recall of the predicted answer against expected.

    @param predicted: The answer returned by the RAG system
    @param expected:  The ground-truth expected answer
    @returns: Float in [0.0, 1.0]
                1.0 = every word in expected also appears in predicted
                0.0 = no overlap at all
    """
    if not predicted or not expected:
        return 0.0

    pred_tokens = Counter(_normalize(predicted).split())
    exp_tokens = Counter(_normalize(expected).split())

    # Intersection: tokens shared between predicted and expected
    shared = sum((pred_tokens & exp_tokens).values())
    total_expected = sum(exp_tokens.values())

    if total_expected == 0:
        return 0.0

    return round(shared / total_expected, 4)
