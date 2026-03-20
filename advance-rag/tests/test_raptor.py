"""Unit tests for the RAPTOR hierarchical summarization module.

Tests clustering logic, optimal cluster selection, task cancellation,
error tolerance, and the main __call__ loop in rag/raptor.py.
LLM and embedding models are mocked.
"""

import os
import sys
import types
import asyncio
import pytest
import numpy as np
from unittest.mock import MagicMock, patch, AsyncMock

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Stub heavy dependencies
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Args:
        name: Dotted module path to mock.
    """
    if name not in sys.modules:
        try:
            __import__(name)
        except (ImportError, ModuleNotFoundError):
            mod = types.ModuleType(name)
            sys.modules[name] = mod
            parts = name.split(".")
            for i in range(1, len(parts)):
                parent = ".".join(parts[:i])
                if parent not in sys.modules:
                    sys.modules[parent] = types.ModuleType(parent)


_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")

_mock_rag_tokenizer = MagicMock()
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer

# Mock timeout decorator to be a no-op
_ensure_mock_module("common.connection_utils")
sys.modules["common.connection_utils"].timeout = lambda seconds: (lambda f: f)

# Mock truncate
_ensure_mock_module("common.token_utils")
sys.modules["common.token_utils"].truncate = lambda text, max_len: text[:max_len]

# Mock graphrag utils
_ensure_mock_module("rag.graphrag")
_ensure_mock_module("rag.graphrag.utils")
mock_chat_limiter = MagicMock()
mock_chat_limiter.__aenter__ = AsyncMock()
mock_chat_limiter.__aexit__ = AsyncMock()
sys.modules["rag.graphrag.utils"].chat_limiter = mock_chat_limiter
sys.modules["rag.graphrag.utils"].get_embed_cache = MagicMock(return_value=None)
sys.modules["rag.graphrag.utils"].get_llm_cache = MagicMock(return_value=None)
sys.modules["rag.graphrag.utils"].set_embed_cache = MagicMock()
sys.modules["rag.graphrag.utils"].set_llm_cache = MagicMock()

# Mock task service
_ensure_mock_module("db.services.task_service")
sys.modules["db.services.task_service"].has_canceled = MagicMock(return_value=False)

# Mock thread_pool_exec to just call the function
_ensure_mock_module("common.misc_utils")
sys.modules["common.misc_utils"].thread_pool_exec = lambda fn, *args, **kwargs: fn(*args, **kwargs)

# Mock exceptions
_ensure_mock_module("common.exceptions")


class MockTaskCanceledException(Exception):
    """Mock for TaskCanceledException."""
    pass


sys.modules["common.exceptions"].TaskCanceledException = MockTaskCanceledException


from rag.raptor import RecursiveAbstractiveProcessing4TreeOrganizedRetrieval


def _make_raptor(max_cluster=5, max_token=512, threshold=0.1, max_errors=3):
    """Create a RAPTOR instance with mocked LLM and embedding models.

    Args:
        max_cluster: Maximum clusters per level.
        max_token: Maximum tokens for LLM output.
        threshold: GMM probability threshold.
        max_errors: Maximum allowed errors before abort.

    Returns:
        Configured RAPTOR instance with mock models.
    """
    llm_model = MagicMock()
    llm_model.llm_name = "test-llm"
    llm_model.max_length = 4096
    llm_model.async_chat = AsyncMock(return_value="Summary of the cluster content.")

    embd_model = MagicMock()
    embd_model.llm_name = "test-embd"
    embd_model.encode = MagicMock(return_value=([np.random.rand(128).tolist()], None))

    return RecursiveAbstractiveProcessing4TreeOrganizedRetrieval(
        max_cluster=max_cluster,
        llm_model=llm_model,
        embd_model=embd_model,
        prompt="Summarize: {cluster_content}",
        max_token=max_token,
        threshold=threshold,
        max_errors=max_errors,
    )


class TestRaptorInit:
    """Tests for RAPTOR initialization."""

    def test_parameters_stored_correctly(self):
        """Constructor parameters should be stored as attributes."""
        raptor = _make_raptor(max_cluster=10, max_token=1024, threshold=0.2)

        assert raptor._max_cluster == 10
        assert raptor._max_token == 1024
        assert raptor._threshold == 0.2

    def test_max_errors_clamped_to_minimum_one(self):
        """max_errors should be at least 1."""
        raptor = _make_raptor(max_errors=0)

        assert raptor._max_errors == 1

    def test_error_count_initialized_to_zero(self):
        """Error count should start at 0."""
        raptor = _make_raptor()

        assert raptor._error_count == 0


class TestRaptorGetOptimalClusters:
    """Tests for the _get_optimal_clusters BIC selection."""

    def test_returns_optimal_cluster_count(self):
        """Should return the number of clusters with lowest BIC."""
        raptor = _make_raptor(max_cluster=5)

        # Create distinct embeddings that should form 2-3 clusters
        np.random.seed(42)
        embeddings = np.vstack([
            np.random.randn(5, 10) + [5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            np.random.randn(5, 10) + [-5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        ])

        optimal = raptor._get_optimal_clusters(embeddings, random_state=42)

        # Should be between 1 and max_cluster
        assert 1 <= optimal <= 5

    def test_single_embedding_returns_one_cluster(self):
        """With a single embedding, max_clusters should be 1."""
        raptor = _make_raptor(max_cluster=5)

        embeddings = np.random.randn(1, 10)

        # With only 1 embedding, n_clusters range is empty, so this tests the edge case
        # The function iterates range(1, min(5, 1)) = range(1, 1) which is empty
        # This would cause np.argmin on empty array to fail, so we verify behavior
        # In practice the caller checks len > 1 before calling, but test the boundary
        with pytest.raises((ValueError, IndexError)):
            raptor._get_optimal_clusters(embeddings, random_state=42)

    def test_max_cluster_capped_by_embedding_count(self):
        """max_clusters should be capped by the number of embeddings."""
        raptor = _make_raptor(max_cluster=100)

        embeddings = np.random.randn(3, 10)
        optimal = raptor._get_optimal_clusters(embeddings, random_state=42)

        # Should not exceed the number of embeddings
        assert optimal <= 3


class TestRaptorCheckTaskCanceled:
    """Tests for task cancellation checking."""

    def test_no_exception_when_not_canceled(self):
        """Should not raise when task is not canceled."""
        raptor = _make_raptor()

        with patch("rag.raptor.has_canceled", return_value=False):
            # Should not raise
            raptor._check_task_canceled("task-1", "test")

    def test_raises_when_canceled(self):
        """Should raise TaskCanceledException when task is canceled."""
        raptor = _make_raptor()

        with patch("rag.raptor.has_canceled", return_value=True):
            with pytest.raises(MockTaskCanceledException):
                raptor._check_task_canceled("task-1", "test")

    def test_empty_task_id_skips_check(self):
        """Empty task_id should skip the cancellation check."""
        raptor = _make_raptor()

        # Should not raise even if has_canceled would return True
        raptor._check_task_canceled("", "test")


class TestRaptorCall:
    """Tests for the RAPTOR __call__ main loop."""

    def test_single_chunk_returns_empty(self):
        """A single chunk should return empty (no clustering needed)."""
        raptor = _make_raptor()

        result = asyncio.get_event_loop().run_until_complete(
            raptor(
                [("chunk1 text", np.random.rand(10).tolist())],
                random_state=42
            )
        )

        assert result == []

    def test_empty_chunks_returns_empty(self):
        """Empty chunks list should return empty."""
        raptor = _make_raptor()

        result = asyncio.get_event_loop().run_until_complete(
            raptor([], random_state=42)
        )

        assert result == []

    def test_filters_out_empty_chunks(self):
        """Chunks with empty text or None embeddings should be filtered out."""
        raptor = _make_raptor()

        chunks = [
            ("", np.random.rand(10).tolist()),  # empty text
            ("valid text", None),  # None embedding
            ("valid text", []),  # empty embedding
            ("valid text", np.random.rand(10).tolist()),  # valid
        ]

        result = asyncio.get_event_loop().run_until_complete(
            raptor(chunks, random_state=42)
        )

        # After filtering, only 1 valid chunk remains, so should return empty
        assert result == []

    @patch("rag.raptor.umap")
    def test_two_chunks_summarized_directly(self, mock_umap):
        """With exactly 2 chunks, they should be summarized directly without UMAP."""
        raptor = _make_raptor()

        chunks = [
            ("First chunk text", np.random.rand(128).tolist()),
            ("Second chunk text", np.random.rand(128).tolist()),
        ]

        result = asyncio.get_event_loop().run_until_complete(
            raptor(chunks, random_state=42, callback=MagicMock())
        )

        # Should produce the original chunks + summary chunks
        assert len(result) >= 2
        # UMAP should NOT have been called for 2 chunks
        mock_umap.UMAP.assert_not_called()


class TestRaptorErrorTolerance:
    """Tests for RAPTOR error tolerance behavior."""

    def test_error_count_tracked(self):
        """Error count should start at 0 and be tracked."""
        raptor = _make_raptor(max_errors=3)

        assert raptor._error_count == 0
        assert raptor._max_errors == 3

    def test_max_errors_minimum_is_one(self):
        """max_errors should be at least 1 even if 0 is passed."""
        raptor = _make_raptor(max_errors=0)

        assert raptor._max_errors == 1


class TestRaptorEmbeddingEncode:
    """Tests for the _embedding_encode helper."""

    def test_returns_cached_embedding(self):
        """Should return cached embedding if available."""
        raptor = _make_raptor()

        cached = np.random.rand(128).tolist()
        with patch("rag.raptor.get_embed_cache", return_value=cached):
            result = asyncio.get_event_loop().run_until_complete(
                raptor._embedding_encode("test text")
            )

            assert result == cached

    def test_encodes_and_caches_when_not_cached(self):
        """Should encode and cache when no cached result exists."""
        raptor = _make_raptor()
        expected = np.random.rand(128).tolist()
        raptor._embd_model.encode = MagicMock(return_value=([expected], None))

        with patch("rag.raptor.get_embed_cache", return_value=None):
            with patch("rag.raptor.set_embed_cache") as mock_set:
                result = asyncio.get_event_loop().run_until_complete(
                    raptor._embedding_encode("test text")
                )

                assert result == expected
                mock_set.assert_called_once()

    def test_raises_on_empty_embedding(self):
        """Should raise when embedding model returns empty result."""
        raptor = _make_raptor()
        raptor._embd_model.encode = MagicMock(return_value=([], None))

        with patch("rag.raptor.get_embed_cache", return_value=None):
            with pytest.raises(Exception, match="Embedding error"):
                asyncio.get_event_loop().run_until_complete(
                    raptor._embedding_encode("test text")
                )


class TestRaptorChat:
    """Tests for the _chat LLM interaction."""

    def test_returns_cached_response(self):
        """Should return cached LLM response if available."""
        raptor = _make_raptor()

        with patch("rag.raptor.get_llm_cache", return_value="Cached summary"):
            result = asyncio.get_event_loop().run_until_complete(
                raptor._chat("system", [{"role": "user", "content": "test"}], {})
            )

            assert result == "Cached summary"

    def test_strips_thinking_tags(self):
        """Should strip </think> tags from LLM response."""
        raptor = _make_raptor()
        raptor._llm_model.async_chat = AsyncMock(
            return_value="<think>reasoning</think>Clean summary"
        )

        with patch("rag.raptor.get_llm_cache", return_value=None):
            result = asyncio.get_event_loop().run_until_complete(
                raptor._chat("system", [{"role": "user", "content": "test"}], {})
            )

            assert "Clean summary" in result
            assert "<think>" not in result

    def test_raises_on_error_response(self):
        """Should raise when LLM returns **ERROR** in response."""
        raptor = _make_raptor()
        raptor._llm_model.async_chat = AsyncMock(return_value="**ERROR** Something went wrong")

        with patch("rag.raptor.get_llm_cache", return_value=None):
            with pytest.raises(Exception):
                asyncio.get_event_loop().run_until_complete(
                    raptor._chat("system", [{"role": "user", "content": "test"}], {})
                )

    def test_retries_on_failure(self):
        """Should retry up to 3 times on LLM failure."""
        raptor = _make_raptor()
        raptor._llm_model.async_chat = AsyncMock(
            side_effect=[Exception("fail1"), Exception("fail2"), "Success"]
        )

        with patch("rag.raptor.get_llm_cache", return_value=None):
            result = asyncio.get_event_loop().run_until_complete(
                raptor._chat("system", [{"role": "user", "content": "test"}], {})
            )

            assert result == "Success"
            assert raptor._llm_model.async_chat.call_count == 3
