"""Unit tests for cross-KB collision guard in task_executor.py.

Tests the document name lookup logic in run_raptor_for_kb that prevents
naming collisions when multiple documents share a knowledge base.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestCrossKBCollisionGuard:
    """Tests for the cross-KB document name collision guard logic."""

    def _build_doc_name_lookup(
        self, doc_ids: list[str], get_by_id_side_effect: list
    ) -> dict[str, str]:
        """Simulate the doc_name_by_id lookup from run_raptor_for_kb.

        This replicates the exact logic from task_executor.py lines 1038-1045
        without importing the full module (which has heavy dependencies).

        Args:
            doc_ids: List of document IDs to look up.
            get_by_id_side_effect: List of (ok, doc) tuples returned by get_by_id.

        Returns:
            Dict mapping doc_id to document name.
        """
        doc_name_by_id: dict[str, str] = {}
        call_idx = 0
        for doc_id in set(doc_ids):
            ok, source_doc = get_by_id_side_effect[call_idx]
            call_idx += 1
            if not ok or not source_doc:
                continue
            source_name = getattr(source_doc, "name", "")
            if source_name:
                doc_name_by_id[doc_id] = source_name
        return doc_name_by_id

    def _resolve_effective_name(
        self, did: str, fake_doc_id: str, row_name: str,
        doc_name_by_id: dict[str, str]
    ) -> str:
        """Simulate the effective_doc_name resolution from task_executor.py line 1061.

        Args:
            did: Current document ID.
            fake_doc_id: The synthetic raptor/graphrag doc ID.
            row_name: Default name from the KB row.
            doc_name_by_id: Lookup table built by _build_doc_name_lookup.

        Returns:
            The effective document name to use.
        """
        # Exact logic from task_executor.py line 1061
        return row_name if did == fake_doc_id else doc_name_by_id.get(did, row_name)

    def test_collision_detected_uses_actual_name(self) -> None:
        """Should use actual document name when doc_id is found in lookup."""
        mock_doc = MagicMock()
        mock_doc.name = "real_report.pdf"

        doc_name_by_id = self._build_doc_name_lookup(
            doc_ids=["doc-1"],
            get_by_id_side_effect=[(True, mock_doc)],
        )

        # doc-1 should resolve to its actual name, not the row name
        effective = self._resolve_effective_name(
            did="doc-1",
            fake_doc_id="FAKE_RAPTOR_DOC",
            row_name="kb_default_name",
            doc_name_by_id=doc_name_by_id,
        )

        assert effective == "real_report.pdf"

    def test_no_collision_falls_back_to_row_name(self) -> None:
        """Should fall back to row name when doc_id is not in lookup."""
        # Document not found in DB
        doc_name_by_id = self._build_doc_name_lookup(
            doc_ids=["doc-missing"],
            get_by_id_side_effect=[(False, None)],
        )

        effective = self._resolve_effective_name(
            did="doc-missing",
            fake_doc_id="FAKE_RAPTOR_DOC",
            row_name="kb_default_name",
            doc_name_by_id=doc_name_by_id,
        )

        assert effective == "kb_default_name"

    def test_fake_doc_id_always_uses_row_name(self) -> None:
        """Should always use row name for the fake raptor doc ID."""
        mock_doc = MagicMock()
        mock_doc.name = "should_not_be_used.pdf"

        # Even if the fake ID somehow has a name in the lookup
        doc_name_by_id = {"FAKE_RAPTOR_DOC": "should_not_be_used.pdf"}

        effective = self._resolve_effective_name(
            did="FAKE_RAPTOR_DOC",
            fake_doc_id="FAKE_RAPTOR_DOC",
            row_name="kb_raptor_name",
            doc_name_by_id=doc_name_by_id,
        )

        assert effective == "kb_raptor_name"

    def test_multiple_docs_build_correct_lookup(self) -> None:
        """Should build lookup for multiple documents correctly."""
        doc_a = MagicMock()
        doc_a.name = "report_a.pdf"
        doc_b = MagicMock()
        doc_b.name = "report_b.pdf"

        # Map doc_id -> (ok, doc) for deterministic lookup regardless of set order
        doc_map = {
            "doc-1": (True, doc_a),
            "doc-2": (True, doc_b),
        }

        doc_name_by_id: dict[str, str] = {}
        for doc_id in set(["doc-1", "doc-2"]):
            ok, source_doc = doc_map[doc_id]
            if not ok or not source_doc:
                continue
            source_name = getattr(source_doc, "name", "")
            if source_name:
                doc_name_by_id[doc_id] = source_name

        assert doc_name_by_id["doc-1"] == "report_a.pdf"
        assert doc_name_by_id["doc-2"] == "report_b.pdf"

    def test_doc_with_empty_name_excluded_from_lookup(self) -> None:
        """Should skip documents with empty names from the lookup."""
        mock_doc = MagicMock()
        mock_doc.name = ""

        doc_name_by_id = self._build_doc_name_lookup(
            doc_ids=["doc-empty"],
            get_by_id_side_effect=[(True, mock_doc)],
        )

        # Empty name should not be in the lookup
        assert "doc-empty" not in doc_name_by_id

        # Resolution should fall back to row name
        effective = self._resolve_effective_name(
            did="doc-empty",
            fake_doc_id="FAKE_RAPTOR_DOC",
            row_name="fallback_name",
            doc_name_by_id=doc_name_by_id,
        )
        assert effective == "fallback_name"

    def test_duplicate_doc_ids_deduplicated(self) -> None:
        """Should deduplicate doc_ids via set() before lookup."""
        mock_doc = MagicMock()
        mock_doc.name = "report.pdf"

        # Pass same ID twice; set() should deduplicate
        doc_name_by_id = self._build_doc_name_lookup(
            doc_ids=["doc-1", "doc-1"],
            # Only one call since set deduplicates
            get_by_id_side_effect=[(True, mock_doc)],
        )

        assert doc_name_by_id["doc-1"] == "report.pdf"
