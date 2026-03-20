"""Unit tests for rag.llm.rerank_model module.

Tests reranking model providers including OpenAI-API-Compatible, Cohere, and
RAGcon rerankers. Covers relevance scoring, batch reranking with result ordering,
normalization, provider selection, and error handling. All API calls are mocked.
"""
import os
import sys
import numpy as np
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestRerankBase:
    """Tests for the Base rerank class interface and utilities."""

    def test_similarity_raises_not_implemented(self):
        """Verify Base.similarity() raises NotImplementedError."""
        from rag.llm.rerank_model import Base
        base = Base.__new__(Base)
        with pytest.raises(NotImplementedError):
            base.similarity("query", ["doc1"])

    def test_normalize_rank_basic(self):
        """Verify min-max normalization produces [0, 1] range."""
        from rag.llm.rerank_model import Base
        rank = np.array([1.0, 3.0, 5.0])
        normalized = Base._normalize_rank(rank)
        assert abs(normalized[0] - 0.0) < 1e-6
        assert abs(normalized[1] - 0.5) < 1e-6
        assert abs(normalized[2] - 1.0) < 1e-6

    def test_normalize_rank_all_equal(self):
        """Verify all-equal scores produce zero vector (avoid division by zero)."""
        from rag.llm.rerank_model import Base
        rank = np.array([2.0, 2.0, 2.0])
        normalized = Base._normalize_rank(rank)
        # All values should be 0 when all scores are equal
        for v in normalized:
            assert abs(v) < 1e-6

    def test_normalize_rank_single_element(self):
        """Verify single-element array returns zero."""
        from rag.llm.rerank_model import Base
        rank = np.array([5.0])
        normalized = Base._normalize_rank(rank)
        assert abs(normalized[0]) < 1e-6

    def test_normalize_rank_preserves_order(self):
        """Verify normalization preserves relative ordering."""
        from rag.llm.rerank_model import Base
        rank = np.array([0.2, 0.8, 0.5])
        normalized = Base._normalize_rank(rank)
        # Ordering should be preserved: 0.2 < 0.5 < 0.8
        assert normalized[0] < normalized[2] < normalized[1]


class TestOpenAIAPIRerank:
    """Tests for OpenAI-API-Compatible reranking provider."""

    def _make_reranker(self):
        """Create an OpenAI_APIRerank instance with mocked HTTP.

        Returns:
            OpenAI_APIRerank instance with mocked requests.
        """
        from rag.llm.rerank_model import OpenAI_APIRerank
        reranker = OpenAI_APIRerank(
            key="test-key",
            model_name="rerank-v1",
            base_url="http://localhost:8080/v1"
        )
        return reranker

    def test_base_url_normalization_with_rerank(self):
        """Verify URL with /rerank is preserved as-is."""
        from rag.llm.rerank_model import OpenAI_APIRerank
        reranker = OpenAI_APIRerank(
            key="key", model_name="model",
            base_url="http://host/v1/rerank"
        )
        assert "/rerank" in reranker.base_url

    def test_base_url_normalization_without_rerank(self):
        """Verify /rerank is appended when not present in URL."""
        from rag.llm.rerank_model import OpenAI_APIRerank
        reranker = OpenAI_APIRerank(
            key="key", model_name="model",
            base_url="http://host/v1"
        )
        assert reranker.base_url.endswith("/rerank")

    def test_model_name_strips_triple_underscore(self):
        """Verify triple-underscore suffixes are stripped from model name."""
        from rag.llm.rerank_model import OpenAI_APIRerank
        reranker = OpenAI_APIRerank(
            key="key", model_name="rerank-v1___variant",
            base_url="http://host/v1"
        )
        assert reranker.model_name == "rerank-v1"

    def test_similarity_returns_scores_and_tokens(self):
        """Verify similarity returns normalized scores and token count."""
        reranker = self._make_reranker()
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "results": [
                {"index": 0, "relevance_score": 0.9},
                {"index": 1, "relevance_score": 0.3},
                {"index": 2, "relevance_score": 0.6},
            ]
        }
        with patch("rag.llm.rerank_model.requests") as mock_requests:
            mock_requests.post.return_value = mock_response
            scores, token_count = reranker.similarity("query", ["doc1", "doc2", "doc3"])

        assert len(scores) == 3
        # Token count should be positive
        assert token_count > 0

    def test_similarity_handles_api_error(self):
        """Verify graceful handling when API response lacks results."""
        reranker = self._make_reranker()
        mock_response = MagicMock()
        mock_response.json.return_value = {"error": "bad request"}
        with patch("rag.llm.rerank_model.requests") as mock_requests:
            mock_requests.post.return_value = mock_response
            scores, token_count = reranker.similarity("query", ["doc1", "doc2"])

        # Should return zero scores when API errors
        assert len(scores) == 2


class TestCoHereRerank:
    """Tests for Cohere reranking provider."""

    def _make_reranker(self):
        """Create a CoHereRerank instance with mocked Cohere client.

        Returns:
            CoHereRerank instance with mocked client.
        """
        from rag.llm.rerank_model import CoHereRerank
        with patch("rag.llm.rerank_model.Client") as MockClient:
            mock_client = MagicMock()
            MockClient.return_value = mock_client
            reranker = CoHereRerank(key="co-test-key", model_name="rerank-v3.5")
            reranker.client = mock_client
            return reranker

    def test_similarity_uses_rerank_api(self):
        """Verify Cohere reranker calls the rerank API method."""
        reranker = self._make_reranker()
        mock_result1 = MagicMock(index=0, relevance_score=0.95)
        mock_result2 = MagicMock(index=1, relevance_score=0.45)
        mock_response = MagicMock()
        mock_response.results = [mock_result1, mock_result2]
        reranker.client.rerank.return_value = mock_response

        scores, tokens = reranker.similarity("test query", ["doc1", "doc2"])
        reranker.client.rerank.assert_called_once()
        assert len(scores) == 2

    def test_model_name_strips_suffix(self):
        """Verify triple-underscore suffixes are stripped from Cohere model name."""
        from rag.llm.rerank_model import CoHereRerank
        with patch("rag.llm.rerank_model.Client"):
            reranker = CoHereRerank(key="key", model_name="rerank-v3.5___custom")
        assert reranker.model_name == "rerank-v3.5"

    def test_cohere_without_base_url(self):
        """Verify Cohere uses default endpoint when no base_url provided."""
        from rag.llm.rerank_model import CoHereRerank
        with patch("rag.llm.rerank_model.Client") as MockClient:
            reranker = CoHereRerank(key="key", model_name="model")
            # base_url should not be in kwargs when not provided
            call_kwargs = MockClient.call_args[1]
            assert "base_url" not in call_kwargs

    def test_cohere_with_custom_base_url(self):
        """Verify custom base_url is passed to Cohere client."""
        from rag.llm.rerank_model import CoHereRerank
        with patch("rag.llm.rerank_model.Client") as MockClient:
            reranker = CoHereRerank(key="key", model_name="model", base_url="http://custom:8080")
            call_kwargs = MockClient.call_args[1]
            assert call_kwargs["base_url"] == "http://custom:8080"


class TestRAGconRerank:
    """Tests for RAGcon reranking provider."""

    def test_default_base_url(self):
        """Verify default RAGcon base URL when not provided."""
        from rag.llm.rerank_model import RAGconRerank
        reranker = RAGconRerank(key="rk-test", model_name="model")
        assert "ragcon" in reranker._base_url.lower()

    def test_custom_base_url(self):
        """Verify custom base URL is used when provided."""
        from rag.llm.rerank_model import RAGconRerank
        reranker = RAGconRerank(key="rk-test", model_name="model", base_url="http://custom:9090")
        assert reranker._base_url == "http://custom:9090"

    def test_similarity_calls_rerank_endpoint(self):
        """Verify RAGcon calls the /rerank endpoint."""
        from rag.llm.rerank_model import RAGconRerank
        reranker = RAGconRerank(key="rk-test", model_name="model", base_url="http://host")
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "results": [
                {"index": 0, "relevance_score": 0.8},
            ]
        }
        with patch("rag.llm.rerank_model.requests") as mock_requests:
            mock_requests.post.return_value = mock_response
            scores, tokens = reranker.similarity("query", ["doc1"])

        # Verify the URL includes /rerank
        call_args = mock_requests.post.call_args
        assert "/rerank" in call_args[0][0]
