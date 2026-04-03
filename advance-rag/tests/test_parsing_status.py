"""Unit tests for DocumentService.get_parsing_status_by_kb_ids.

Tests aggregated parsing status grouping by dataset, handling of empty
kb_ids, multiple datasets, and unknown status values.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Patch missing attributes in conftest-mocked modules before importing
# ---------------------------------------------------------------------------
# common_service stub needs the retry_deadlock_operation decorator
_cs_mod = sys.modules.get("db.services.common_service")
if _cs_mod and not hasattr(_cs_mod, "retry_deadlock_operation"):
    # Provide a no-op decorator matching the real signature
    def _noop_retry_deadlock(**kw):
        """No-op stub for retry_deadlock_operation in test env."""
        def decorator(fn):
            return fn
        return decorator
    _cs_mod.retry_deadlock_operation = _noop_retry_deadlock

import db.services.document_service
from db.services.document_service import DocumentService
from common.constants import TaskStatus


class TestGetParsingStatusByKbIds:
    """Tests for DocumentService.get_parsing_status_by_kb_ids aggregation."""

    def _make_row(self, kb_id: str, run: str, cnt: int) -> dict:
        """Build a fake query result row.

        Args:
            kb_id: Knowledge base ID.
            run: Task status value.
            cnt: Document count for this status.

        Returns:
            Dict mimicking a Peewee .dicts() row.
        """
        return {"kb_id": kb_id, "run": run, "cnt": cnt}

    @patch.object(DocumentService, "model")
    def test_empty_kb_ids_returns_empty(self, mock_model: MagicMock) -> None:
        """Should return empty dict when kb_ids list is empty."""
        result = DocumentService.get_parsing_status_by_kb_ids([])

        assert result == {}
        # Model should not be queried at all
        mock_model.select.assert_not_called()

    @patch.object(DocumentService, "model")
    def test_single_kb_all_statuses(self, mock_model: MagicMock) -> None:
        """Should aggregate all status counts for a single dataset."""
        rows = [
            self._make_row("kb-1", TaskStatus.UNSTART.value, 5),
            self._make_row("kb-1", TaskStatus.RUNNING.value, 3),
            self._make_row("kb-1", TaskStatus.DONE.value, 10),
            self._make_row("kb-1", TaskStatus.FAIL.value, 2),
            self._make_row("kb-1", TaskStatus.CANCEL.value, 1),
        ]
        # Chain the Peewee query builder mocks
        mock_query = MagicMock()
        mock_model.select.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_query.group_by.return_value = mock_query
        mock_query.dicts.return_value = rows

        result = DocumentService.get_parsing_status_by_kb_ids(["kb-1"])

        assert result["kb-1"]["unstart_count"] == 5
        assert result["kb-1"]["running_count"] == 3
        assert result["kb-1"]["done_count"] == 10
        assert result["kb-1"]["fail_count"] == 2
        assert result["kb-1"]["cancel_count"] == 1

    @patch.object(DocumentService, "model")
    def test_multiple_datasets(self, mock_model: MagicMock) -> None:
        """Should group status counts per dataset when multiple kb_ids are given."""
        rows = [
            self._make_row("kb-1", TaskStatus.DONE.value, 8),
            self._make_row("kb-2", TaskStatus.RUNNING.value, 4),
            self._make_row("kb-2", TaskStatus.DONE.value, 12),
        ]
        mock_query = MagicMock()
        mock_model.select.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_query.group_by.return_value = mock_query
        mock_query.dicts.return_value = rows

        result = DocumentService.get_parsing_status_by_kb_ids(["kb-1", "kb-2"])

        # kb-1: only done
        assert result["kb-1"]["done_count"] == 8
        assert result["kb-1"]["running_count"] == 0

        # kb-2: running + done
        assert result["kb-2"]["running_count"] == 4
        assert result["kb-2"]["done_count"] == 12

    @patch.object(DocumentService, "model")
    def test_missing_statuses_default_to_zero(self, mock_model: MagicMock) -> None:
        """Should default all status counts to 0 when no documents match."""
        mock_query = MagicMock()
        mock_model.select.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_query.group_by.return_value = mock_query
        mock_query.dicts.return_value = []

        result = DocumentService.get_parsing_status_by_kb_ids(["kb-empty"])

        expected_zeroes = {
            "unstart_count": 0,
            "running_count": 0,
            "cancel_count": 0,
            "done_count": 0,
            "fail_count": 0,
        }
        assert result["kb-empty"] == expected_zeroes

    @patch.object(DocumentService, "model")
    def test_unknown_status_value_ignored(self, mock_model: MagicMock) -> None:
        """Should silently ignore rows with unknown status values."""
        rows = [
            self._make_row("kb-1", "999", 3),  # Unknown status
            self._make_row("kb-1", TaskStatus.DONE.value, 7),
        ]
        mock_query = MagicMock()
        mock_model.select.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_query.group_by.return_value = mock_query
        mock_query.dicts.return_value = rows

        result = DocumentService.get_parsing_status_by_kb_ids(["kb-1"])

        assert result["kb-1"]["done_count"] == 7
        assert result["kb-1"]["unstart_count"] == 0
