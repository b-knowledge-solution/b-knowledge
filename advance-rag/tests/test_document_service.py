"""Unit tests for the DocumentService database service.

Tests document CRUD operations, chunk increment/decrement, health
checks, progress syncing, parser config updates, and access control
in db/services/document_service.py. All database and external
dependencies are mocked.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from datetime import datetime

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Stub heavy dependencies before importing
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
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer
sys.modules["rag.nlp"].search = MagicMock()

# Mock the DB connection context to be a no-op decorator
_ensure_mock_module("db.db_models")
mock_DB = MagicMock()
mock_DB.connection_context.return_value = lambda f: f
mock_DB.atomic.return_value.__enter__ = MagicMock()
mock_DB.atomic.return_value.__exit__ = MagicMock()
sys.modules["db.db_models"].DB = mock_DB


from rag.app.qa import rmPrefix
# Pre-import document_service so @patch decorators can resolve the module path
import db.services.document_service


class TestGetQueueLength:
    """Tests for the get_queue_length utility function."""

    @patch("db.services.document_service.REDIS_CONN")
    @patch("db.services.document_service.settings")
    def test_returns_zero_when_no_group_info(self, mock_settings, mock_redis):
        """Should return 0 when Redis returns no group info."""
        from db.services.document_service import get_queue_length

        mock_redis.queue_info.return_value = None
        mock_settings.get_svr_queue_name.return_value = "queue_0"

        result = get_queue_length(0)

        assert result == 0

    @patch("db.services.document_service.REDIS_CONN")
    @patch("db.services.document_service.settings")
    def test_returns_lag_value_from_group_info(self, mock_settings, mock_redis):
        """Should return the 'lag' value from Redis group info."""
        from db.services.document_service import get_queue_length

        mock_redis.queue_info.return_value = {"lag": 5}
        mock_settings.get_svr_queue_name.return_value = "queue_0"

        result = get_queue_length(0)

        assert result == 5

    @patch("db.services.document_service.REDIS_CONN")
    @patch("db.services.document_service.settings")
    def test_handles_none_lag_value(self, mock_settings, mock_redis):
        """Should handle None lag value gracefully."""
        from db.services.document_service import get_queue_length

        mock_redis.queue_info.return_value = {"lag": None}
        mock_settings.get_svr_queue_name.return_value = "queue_0"

        result = get_queue_length(0)

        assert result == 0

    @patch("db.services.document_service.REDIS_CONN")
    @patch("db.services.document_service.settings")
    def test_handles_zero_lag(self, mock_settings, mock_redis):
        """Should return 0 when lag is explicitly 0."""
        from db.services.document_service import get_queue_length

        mock_redis.queue_info.return_value = {"lag": 0}
        mock_settings.get_svr_queue_name.return_value = "queue_0"

        result = get_queue_length(0)

        assert result == 0


class TestDocumentServiceCheckDocHealth:
    """Tests for DocumentService.check_doc_health static validation."""

    def test_filename_too_long_raises_runtime_error(self):
        """Filenames exceeding 256 bytes should be rejected."""
        from db.services.document_service import DocumentService, FILE_NAME_LEN_LIMIT

        # Create a filename longer than the limit
        long_name = "a" * 300 + ".pdf"

        with patch.object(DocumentService, "get_doc_count", return_value=0):
            with patch.dict(os.environ, {"MAX_FILE_NUM_PER_USER": "0"}):
                with pytest.raises(RuntimeError, match="Exceed the maximum length"):
                    DocumentService.check_doc_health("tenant-1", long_name)

    def test_valid_filename_passes(self):
        """A valid filename should pass the health check."""
        from db.services.document_service import DocumentService

        with patch.object(DocumentService, "get_doc_count", return_value=0):
            with patch.dict(os.environ, {"MAX_FILE_NUM_PER_USER": "0"}):
                result = DocumentService.check_doc_health("tenant-1", "valid_file.pdf")
                assert result is True

    def test_max_file_num_exceeded_raises_runtime_error(self):
        """Exceeding the max file number per user should be rejected."""
        from db.services.document_service import DocumentService

        with patch.object(DocumentService, "get_doc_count", return_value=100):
            with patch.dict(os.environ, {"MAX_FILE_NUM_PER_USER": "50"}):
                with pytest.raises(RuntimeError, match="Exceed the maximum file number"):
                    DocumentService.check_doc_health("tenant-1", "file.pdf")


class TestDocumentServiceParserConfigUpdate:
    """Tests for DocumentService.update_parser_config deep merge logic."""

    def test_dfs_update_merges_nested_dicts(self):
        """The dfs_update helper should merge nested dicts recursively."""
        from db.services.document_service import DocumentService

        # Mock get_by_id to return a doc with existing parser_config
        mock_doc = MagicMock()
        mock_doc.parser_config = {"chunk_token_num": 512, "nested": {"a": 1, "b": 2}}

        with patch.object(DocumentService, "get_by_id", return_value=(True, mock_doc)):
            with patch.object(DocumentService, "update_by_id") as mock_update:
                DocumentService.update_parser_config("doc-1", {"nested": {"b": 99, "c": 3}})

                # The nested dict should be merged
                updated_config = mock_doc.parser_config
                assert updated_config["nested"]["a"] == 1
                assert updated_config["nested"]["b"] == 99
                assert updated_config["nested"]["c"] == 3

    def test_raptor_config_removed_when_not_in_update(self):
        """If 'raptor' is not in the new config, it should be removed from existing."""
        from db.services.document_service import DocumentService

        mock_doc = MagicMock()
        mock_doc.parser_config = {"chunk_token_num": 512, "raptor": {"enabled": True}}

        with patch.object(DocumentService, "get_by_id", return_value=(True, mock_doc)):
            with patch.object(DocumentService, "update_by_id"):
                DocumentService.update_parser_config("doc-1", {"chunk_token_num": 256})

                # raptor should be removed
                assert "raptor" not in mock_doc.parser_config

    def test_empty_config_is_noop(self):
        """Passing empty/falsy config should be a no-op."""
        from db.services.document_service import DocumentService

        with patch.object(DocumentService, "get_by_id") as mock_get:
            DocumentService.update_parser_config("doc-1", {})
            # get_by_id should not be called for empty config
            mock_get.assert_not_called()

    def test_not_found_raises_lookup_error(self):
        """If the document is not found, LookupError should be raised."""
        from db.services.document_service import DocumentService

        with patch.object(DocumentService, "get_by_id", return_value=(False, None)):
            with pytest.raises(LookupError, match="not found"):
                DocumentService.update_parser_config("nonexistent", {"key": "value"})


class TestDocumentServiceDoCancel:
    """Tests for DocumentService.do_cancel cancellation check."""

    def test_returns_true_when_cancelled(self):
        """Should return True when document run status is CANCEL."""
        from db.services.document_service import DocumentService
        from common.constants import TaskStatus

        mock_doc = MagicMock()
        mock_doc.run = TaskStatus.CANCEL.value
        mock_doc.progress = 0.5

        with patch.object(DocumentService, "get_by_id", return_value=(True, mock_doc)):
            assert DocumentService.do_cancel("doc-1") is True

    def test_returns_true_when_progress_negative(self):
        """Should return True when progress is negative (failed)."""
        from db.services.document_service import DocumentService
        from common.constants import TaskStatus

        mock_doc = MagicMock()
        mock_doc.run = TaskStatus.RUNNING.value
        mock_doc.progress = -1

        with patch.object(DocumentService, "get_by_id", return_value=(True, mock_doc)):
            assert DocumentService.do_cancel("doc-1") is True

    def test_returns_false_when_running(self):
        """Should return False when document is running normally."""
        from db.services.document_service import DocumentService
        from common.constants import TaskStatus

        mock_doc = MagicMock()
        mock_doc.run = TaskStatus.RUNNING.value
        mock_doc.progress = 0.5

        with patch.object(DocumentService, "get_by_id", return_value=(True, mock_doc)):
            assert DocumentService.do_cancel("doc-1") is False

    def test_returns_false_on_exception(self):
        """Should return False when get_by_id raises an exception."""
        from db.services.document_service import DocumentService

        with patch.object(DocumentService, "get_by_id", side_effect=Exception("DB error")):
            assert DocumentService.do_cancel("doc-1") is False


class TestQueueRaptorOGraphragTasks:
    """Tests for queue_raptor_o_graphrag_tasks utility."""

    def test_invalid_type_raises_assertion(self):
        """Invalid task type should raise AssertionError."""
        from db.services.document_service import queue_raptor_o_graphrag_tasks

        with pytest.raises(AssertionError, match="type should be"):
            queue_raptor_o_graphrag_tasks({"id": "doc-1"}, "invalid_type", 0)

    @patch("db.services.document_service.REDIS_CONN")
    @patch("db.services.document_service.settings")
    @patch("db.services.document_service.bulk_insert_into_db")
    @patch("db.services.document_service.DocumentService")
    def test_graphrag_type_accepted(self, mock_doc_svc, mock_bulk, mock_settings, mock_redis):
        """'graphrag' should be an accepted task type."""
        from db.services.document_service import queue_raptor_o_graphrag_tasks

        mock_doc_svc.get_chunking_config.return_value = {"field1": "val1"}
        mock_doc_svc.begin2parse = MagicMock()
        mock_redis.queue_product.return_value = True
        mock_settings.get_svr_queue_name.return_value = "queue_0"

        task_id = queue_raptor_o_graphrag_tasks({"id": "doc-1"}, "graphrag", 0)

        assert isinstance(task_id, str)
        mock_bulk.assert_called_once()

    @patch("db.services.document_service.REDIS_CONN")
    @patch("db.services.document_service.settings")
    @patch("db.services.document_service.bulk_insert_into_db")
    @patch("db.services.document_service.DocumentService")
    def test_raptor_type_accepted(self, mock_doc_svc, mock_bulk, mock_settings, mock_redis):
        """'raptor' should be an accepted task type."""
        from db.services.document_service import queue_raptor_o_graphrag_tasks

        mock_doc_svc.get_chunking_config.return_value = {"field1": "val1"}
        mock_doc_svc.begin2parse = MagicMock()
        mock_redis.queue_product.return_value = True
        mock_settings.get_svr_queue_name.return_value = "queue_0"

        task_id = queue_raptor_o_graphrag_tasks({"id": "doc-1"}, "raptor", 0)

        assert isinstance(task_id, str)
