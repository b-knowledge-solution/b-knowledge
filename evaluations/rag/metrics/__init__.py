"""
Metrics Module for RAG Evaluation

Placeholder for metric implementations used during RAG evaluation.

Metrics available:
- Accuracy: Exact match or semantic similarity
- Precision: Proportion of retrieved documents that are relevant
- Recall: Proportion of relevant documents that are retrieved
- F1: Harmonic mean of precision and recall
- BLEU/ROUGE: String-based similarity metrics

@example
    from metrics import AccuracyMetric
    metric = AccuracyMetric()
    score = metric.compute(predicted="answer text", expected="expected text")
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class BaseMetric(ABC):
    """
    Abstract base class for evaluation metrics.
    
    All metric implementations must inherit from this class.
    """
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Get metric name."""
        pass
    
    @abstractmethod
    def compute(self, **kwargs) -> float:
        """
        Compute the metric score.
        
        @returns: Metric score (typically 0-1 range)
        """
        pass


# Placeholder implementations (to be completed in Phase 3)
class AccuracyMetric(BaseMetric):
    """Accuracy metric - checks exact or semantic match."""
    
    @property
    def name(self) -> str:
        return "accuracy"
    
    def compute(self, predicted: str, expected: str, **kwargs) -> float:
        """Compute accuracy score."""
        # Placeholder: will be implemented in Phase 3
        return 0.0


class PrecisionMetric(BaseMetric):
    """Precision metric - proportion of correct retrievals."""
    
    @property
    def name(self) -> str:
        return "precision"
    
    def compute(self, **kwargs) -> float:
        """Compute precision score."""
        return 0.0


class RecallMetric(BaseMetric):
    """Recall metric - proportion of relevant documents retrieved."""
    
    @property
    def name(self) -> str:
        return "recall"
    
    def compute(self, **kwargs) -> float:
        """Compute recall score."""
        return 0.0


class F1Metric(BaseMetric):
    """F1 metric - harmonic mean of precision and recall."""
    
    @property
    def name(self) -> str:
        return "f1"
    
    def compute(self, precision: float, recall: float, **kwargs) -> float:
        """Compute F1 score."""
        if precision + recall == 0:
            return 0.0
        return 2 * (precision * recall) / (precision + recall)
