"""Unit tests for rag.utils.opensearch_conn module.

Tests the OSConnection OpenSearch connector including connection initialization,
index creation/deletion, document indexing, search queries (keyword + vector),
health checks, and error handling. The opensearch-py client is fully mocked.
"""
import os
import sys
import json
import pytest
from unittest.mock import MagicMock, patch, PropertyMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


def _make_os_connection():
    """Create an OSConnection instance with fully mocked OpenSearch client.

    Bypasses the singleton pattern and __init__ constructor to avoid
    real connection attempts.

    Returns:
        OSConnection instance with mocked os client and mapping.
    """
    from rag.utils.opensearch_conn import OSConnection

    # Bypass singleton and __init__
    conn = OSConnection.__new__(OSConnection)
    conn.os = MagicMock()
    conn.info = {"version": {"number": "2.18.0"}}
    conn.mapping = {
        "settings": {"index": {"number_of_shards": 1}},
        "mappings": {"properties": {"content": {"type": "text"}}},
    }
    return conn


class TestOSConnectionDbType:
    """Tests for OSConnection.db_type() identifier."""

    def test_returns_opensearch(self):
        """Verify db_type returns 'opensearch'."""
        conn = _make_os_connection()
        assert conn.db_type() == "opensearch"


class TestOSConnectionHealth:
    """Tests for OSConnection.health() cluster health check."""

    def test_returns_health_with_type(self):
        """Verify health check returns dict with 'type' key."""
        conn = _make_os_connection()
        conn.os.cluster.health.return_value = {
            "status": "green",
            "cluster_name": "test-cluster",
            "number_of_nodes": 1,
        }
        result = conn.health()
        assert result["type"] == "opensearch"
        assert result["status"] == "green"

    def test_includes_cluster_info(self):
        """Verify health includes cluster name and node count."""
        conn = _make_os_connection()
        conn.os.cluster.health.return_value = {
            "status": "yellow",
            "cluster_name": "my-cluster",
            "number_of_nodes": 3,
        }
        result = conn.health()
        assert "cluster_name" in result
        assert "number_of_nodes" in result


class TestOSConnectionCreateIdx:
    """Tests for OSConnection.create_idx() index creation."""

    def test_skips_if_index_exists(self):
        """Verify no creation when index already exists."""
        conn = _make_os_connection()
        conn.index_exist = MagicMock(return_value=True)
        result = conn.create_idx("test_index", "kb1", 768)
        assert result is True
        # IndicesClient.create should not be called
        conn.os.indices.create.assert_not_called()

    def test_creates_index_with_mapping(self):
        """Verify index is created with the loaded mapping when it doesn't exist."""
        conn = _make_os_connection()
        conn.index_exist = MagicMock(return_value=False)

        # Mock IndicesClient used in create_idx
        mock_indices_client = MagicMock()
        mock_indices_client.create.return_value = {"acknowledged": True}
        with patch("opensearchpy.client.IndicesClient", return_value=mock_indices_client):
            conn.create_idx("new_index", "kb1", 768)

        mock_indices_client.create.assert_called_once()


class TestOSConnectionDeleteIdx:
    """Tests for OSConnection.delete_idx() index deletion."""

    def test_skips_when_kb_id_nonempty(self):
        """Verify deletion is skipped when knowledgebaseId is non-empty."""
        conn = _make_os_connection()
        # Non-empty KB ID means this is a KB-level deletion, not tenant-level
        conn.delete_idx("test_index", "kb123")
        conn.os.indices.delete.assert_not_called()

    def test_deletes_when_kb_id_empty(self):
        """Verify index is deleted when knowledgebaseId is empty."""
        conn = _make_os_connection()
        conn.delete_idx("test_index", "")
        conn.os.indices.delete.assert_called_once_with(
            index="test_index", allow_no_indices=True
        )

    def test_handles_not_found_error(self):
        """Verify NotFoundError is silently handled during deletion."""
        conn = _make_os_connection()
        from opensearchpy import NotFoundError
        conn.os.indices.delete.side_effect = NotFoundError("test", "not found", {})
        # Should not raise
        conn.delete_idx("missing_index", "")


class TestOSConnectionIndexExist:
    """Tests for OSConnection.index_exist() existence check."""

    def test_returns_true_when_exists(self):
        """Verify returns True when index exists."""
        conn = _make_os_connection()
        with patch("rag.utils.opensearch_conn.Index") as MockIndex:
            mock_idx = MagicMock()
            mock_idx.exists.return_value = True
            MockIndex.return_value = mock_idx
            assert conn.index_exist("test_index") is True

    def test_returns_false_when_not_exists(self):
        """Verify returns False when index does not exist."""
        conn = _make_os_connection()
        with patch("rag.utils.opensearch_conn.Index") as MockIndex:
            mock_idx = MagicMock()
            mock_idx.exists.return_value = False
            MockIndex.return_value = mock_idx
            assert conn.index_exist("missing_index") is False

    def test_returns_false_on_exception(self):
        """Verify returns False on non-timeout exceptions."""
        conn = _make_os_connection()
        with patch("rag.utils.opensearch_conn.Index") as MockIndex:
            mock_idx = MagicMock()
            mock_idx.exists.side_effect = Exception("Connection refused")
            MockIndex.return_value = mock_idx
            assert conn.index_exist("error_index") is False


class TestOSConnectionConstants:
    """Tests for module-level constants."""

    def test_attempt_time_is_positive(self):
        """Verify ATTEMPT_TIME is a positive integer."""
        from rag.utils.opensearch_conn import ATTEMPT_TIME
        assert ATTEMPT_TIME > 0
        assert isinstance(ATTEMPT_TIME, int)


class TestOSConnectionGet:
    """Tests for OSConnection.get() single document retrieval."""

    def test_get_returns_chunk_with_id(self):
        """Verify get() returns chunk data with 'id' field added."""
        conn = _make_os_connection()
        conn.os.get.return_value = {
            "_source": {"content": "test content", "kb_id": "kb1"},
            "timed_out": False,
        }
        result = conn.get("chunk123", "test_index", ["kb1"])
        assert result is not None
        assert result["id"] == "chunk123"
        assert result["content"] == "test content"

    def test_get_returns_none_on_not_found(self):
        """Verify get() returns None when chunk is not found."""
        from opensearchpy import NotFoundError
        conn = _make_os_connection()
        conn.os.get.side_effect = NotFoundError("test", "not found", {})
        result = conn.get("missing_chunk", "test_index", ["kb1"])
        assert result is None

    def test_get_retries_on_timeout(self):
        """Verify get() retries on timeout errors."""
        conn = _make_os_connection()
        conn.os.get.side_effect = [
            Exception("Es Timeout."),
            {
                "_source": {"content": "data"},
                "timed_out": False,
            }
        ]
        result = conn.get("chunk1", "test_index", ["kb1"])
        assert result is not None
        assert conn.os.get.call_count == 2


class TestOSConnectionInsert:
    """Tests for OSConnection.insert() bulk document indexing."""

    def test_insert_formats_bulk_operations(self):
        """Verify insert() creates correct bulk operation format."""
        conn = _make_os_connection()
        conn.os.bulk.return_value = {"errors": "False", "items": []}

        docs = [
            {"id": "doc1", "content": "hello", "kb_id": "kb1"},
            {"id": "doc2", "content": "world", "kb_id": "kb1"},
        ]
        result = conn.insert(docs, "test_index")
        conn.os.bulk.assert_called_once()
        assert result == []

    def test_insert_returns_errors(self):
        """Verify insert() returns error details when bulk has errors."""
        conn = _make_os_connection()
        conn.os.bulk.return_value = {
            "errors": "True",
            "items": [
                {"index": {"_id": "doc1", "error": {"reason": "mapping error"}}}
            ]
        }

        docs = [{"id": "doc1", "content": "test"}]
        result = conn.insert(docs, "test_index")
        assert len(result) > 0
        assert "doc1" in result[0]


class TestOSConnectionUpdate:
    """Tests for OSConnection.update() document updates."""

    def test_update_single_document_by_id(self):
        """Verify updating a single document by its ID."""
        conn = _make_os_connection()
        condition = {"id": "chunk123"}
        new_value = {"content": "updated content"}
        result = conn.update(condition, new_value, "test_index", "kb1")
        conn.os.update.assert_called_once()
        assert result is True

    def test_update_returns_false_on_error(self):
        """Verify update returns False on non-timeout exceptions."""
        conn = _make_os_connection()
        conn.os.update.side_effect = Exception("Invalid mapping")
        condition = {"id": "chunk123"}
        new_value = {"content": "new"}
        result = conn.update(condition, new_value, "test_index", "kb1")
        assert result is False


class TestOSConnectionDeleteIdx:
    """Tests for additional OSConnection.delete_idx() scenarios."""

    def test_handles_generic_exception(self):
        """Verify generic exceptions during deletion are handled."""
        conn = _make_os_connection()
        conn.os.indices.delete.side_effect = Exception("Unexpected error")
        # Should not raise — exception is caught internally
        conn.delete_idx("test_index", "")


class TestOSConnectionIndexExistRetry:
    """Tests for OSConnection.index_exist() retry behavior."""

    def test_retries_on_timeout(self):
        """Verify index_exist retries on timeout errors."""
        conn = _make_os_connection()
        with patch("rag.utils.opensearch_conn.Index") as MockIndex:
            mock_idx = MagicMock()
            # First call times out, second succeeds
            # Note: the retry check uses find("Timeout") > 0, so the word
            # must not be at position 0 in the string
            mock_idx.exists.side_effect = [Exception("Es Timeout."), True]
            MockIndex.return_value = mock_idx
            result = conn.index_exist("test_index")
            assert result is True
            assert mock_idx.exists.call_count == 2
