"""Regression tests for rag.llm embedding factory registration."""

import os
import sys

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestEmbeddingRegistry:
    """Tests for embedding model factory auto-registration."""

    def test_sentence_transformers_factory_is_registered(self):
        """Verify the local embedding factory is present in the registry."""
        from rag.llm import EmbeddingModel

        # Local embedding startup depends on this registry key existing.
        assert "SentenceTransformers" in EmbeddingModel
