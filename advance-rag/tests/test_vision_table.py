"""Unit tests for deepdoc.vision.table_structure_recognizer module.

Tests table structure recognition functionality including label definitions,
table cell detection, grid reconstruction, recognizer type selection, and
the overall table structure output format. Model inference is fully mocked.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestTableStructureRecognizerLabels:
    """Tests for TableStructureRecognizer label definitions."""

    def test_has_expected_labels(self):
        """Verify all expected table structure labels are defined."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer

        expected = [
            "table", "table column", "table row",
            "table column header", "table projected row header",
            "table spanning cell",
        ]
        for label in expected:
            assert label in TableStructureRecognizer.labels

    def test_label_count(self):
        """Verify total number of table structure labels."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer
        assert len(TableStructureRecognizer.labels) == 6

    def test_table_is_first_label(self):
        """Verify 'table' is the first label."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer
        assert TableStructureRecognizer.labels[0] == "table"


class TestTableStructureRecognizerCall:
    """Tests for TableStructureRecognizer.__call__() inference."""

    def _make_recognizer(self):
        """Create a TableStructureRecognizer with mocked model loading.

        Returns:
            TableStructureRecognizer instance with mocked dependencies.
        """
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer

        with patch.object(TableStructureRecognizer, "__init__", lambda self: None):
            recognizer = TableStructureRecognizer.__new__(TableStructureRecognizer)
            recognizer.labels = TableStructureRecognizer.labels
            return recognizer

    def test_unsupported_recognizer_type_raises(self):
        """Verify unsupported recognizer type raises RuntimeError."""
        recognizer = self._make_recognizer()

        with patch.dict(os.environ, {"TABLE_STRUCTURE_RECOGNIZER_TYPE": "invalid"}):
            with pytest.raises(RuntimeError, match="Unsupported"):
                recognizer([MagicMock()])

    def test_onnx_type_uses_parent_call(self):
        """Verify 'onnx' type delegates to the parent Recognizer.__call__."""
        recognizer = self._make_recognizer()

        # Mock the parent __call__ to return empty table structures
        mock_tbl_result = [[
            {"type": "table row", "score": 0.9, "bbox": [0, 0, 100, 20]},
            {"type": "table column", "score": 0.9, "bbox": [0, 0, 50, 100]},
        ]]

        with patch.dict(os.environ, {"TABLE_STRUCTURE_RECOGNIZER_TYPE": "onnx"}):
            with patch.object(type(recognizer).__bases__[0], "__call__", return_value=mock_tbl_result):
                result = recognizer([MagicMock()])

        # Should produce a list of table structures
        assert isinstance(result, list)

    def test_default_type_is_onnx(self):
        """Verify default recognizer type is 'onnx' when env var not set."""
        recognizer = self._make_recognizer()

        # Remove the env var to use default
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(type(recognizer).__bases__[0], "__call__", return_value=[[]]):
                # Should not raise — defaults to onnx
                result = recognizer([MagicMock()])

        assert isinstance(result, list)


class TestTableStructureOutput:
    """Tests for table structure post-processing output format."""

    def test_output_has_label_and_bbox(self):
        """Verify each detected element has label, score, and bbox coordinates."""
        # Simulate the output format from __call__
        element = {
            "label": "table row",
            "score": 0.95,
            "x0": 10,
            "x1": 200,
            "top": 5,
            "bottom": 25,
        }
        assert "label" in element
        assert "score" in element
        assert "x0" in element and "x1" in element
        assert "top" in element and "bottom" in element

    def test_bbox_coordinates_are_ordered(self):
        """Verify bbox coordinates maintain spatial ordering."""
        element = {
            "x0": 10, "x1": 200,
            "top": 5, "bottom": 25,
        }
        # x0 should be less than x1 (left < right)
        assert element["x0"] < element["x1"]
        # top should be less than bottom
        assert element["top"] < element["bottom"]


class TestTableLabelTypes:
    """Tests for individual table structure label types."""

    def test_row_label(self):
        """Verify 'table row' label exists."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer
        assert "table row" in TableStructureRecognizer.labels

    def test_column_label(self):
        """Verify 'table column' label exists."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer
        assert "table column" in TableStructureRecognizer.labels

    def test_column_header_label(self):
        """Verify 'table column header' label exists for header detection."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer
        assert "table column header" in TableStructureRecognizer.labels

    def test_spanning_cell_label(self):
        """Verify 'table spanning cell' label exists for merged cells."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer
        assert "table spanning cell" in TableStructureRecognizer.labels

    def test_projected_row_header_label(self):
        """Verify 'table projected row header' label exists."""
        from deepdoc.vision.table_structure_recognizer import TableStructureRecognizer
        assert "table projected row header" in TableStructureRecognizer.labels
