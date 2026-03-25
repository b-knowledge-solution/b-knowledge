"""
Precision Metric — Relevance of Retrieved Tokens

Measures what fraction of words in the predicted answer also appear in the
expected answer. High precision means the system did not hallucinate extra
unrelated information.

Formula: precision = |shared tokens| / |predicted tokens|

A predicted answer that says less but says it correctly scores higher than one
that adds lots of irrelevant content. Complement with recall to get the full
picture.

@description Precision metric for RAG evaluation
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


def compute_precision(predicted: str, expected: str) -> float:
    """
    Compute token-level precision of the predicted answer against expected.

    @param predicted: The answer returned by the RAG system
    @param expected:  The ground-truth expected answer
    @returns: Float in [0.0, 1.0]
                1.0 = every word in predicted also appears in expected
                0.0 = no overlap at all
    """
    if not predicted or not expected:
        return 0.0

    pred_tokens = Counter(_normalize(predicted).split())
    exp_tokens = Counter(_normalize(expected).split())

    # Intersection: tokens shared between predicted and expected
    shared = sum((pred_tokens & exp_tokens).values())
    total_predicted = sum(pred_tokens.values())

    if total_predicted == 0:
        return 0.0

    return round(shared / total_predicted, 4)
