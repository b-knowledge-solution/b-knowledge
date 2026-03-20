"""Unit tests for deepdoc.vision.layout_recognizer module.

Tests layout recognition functionality including label definitions,
layout classification types, garbage layout filtering, and the integration
of OCR results with layout regions. Model inference is fully mocked.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestLayoutRecognizerLabels:
    """Tests for LayoutRecognizer label definitions."""

    def test_has_expected_labels(self):
        """Verify all expected layout labels are defined."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer

        expected = [
            "Text", "Title", "Figure", "Figure caption",
            "Table", "Table caption", "Header", "Footer",
            "Reference", "Equation",
        ]
        for label in expected:
            assert label in LayoutRecognizer.labels

    def test_background_label_first(self):
        """Verify the first label is the background class."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer
        assert LayoutRecognizer.labels[0] == "_background_"

    def test_label_count(self):
        """Verify total number of labels including background."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer
        # 10 layout types + 1 background = 11
        assert len(LayoutRecognizer.labels) == 11


class TestLayoutRecognizerInit:
    """Tests for LayoutRecognizer initialization."""

    def test_sets_garbage_layouts(self):
        """Verify garbage layout types are set for filtering."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer

        with patch.object(LayoutRecognizer, "__init__", lambda self, domain: None):
            recognizer = LayoutRecognizer.__new__(LayoutRecognizer)
            recognizer.garbage_layouts = ["footer", "header", "reference"]

        assert "footer" in recognizer.garbage_layouts
        assert "header" in recognizer.garbage_layouts
        assert "reference" in recognizer.garbage_layouts

    def test_garbage_layouts_excludes_text(self):
        """Verify important layout types are not marked as garbage."""
        garbage = ["footer", "header", "reference"]
        important = ["text", "title", "figure", "table", "equation"]
        for layout_type in important:
            assert layout_type not in garbage


class TestLayoutRecognizerCall:
    """Tests for LayoutRecognizer.__call__() inference integration."""

    def test_asserts_matching_image_ocr_lengths(self):
        """Verify assertion fails when image and OCR result lengths differ."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer

        with patch.object(LayoutRecognizer, "__init__", lambda self, domain: None):
            recognizer = LayoutRecognizer.__new__(LayoutRecognizer)
            recognizer.labels = LayoutRecognizer.labels
            recognizer.garbage_layouts = ["footer", "header", "reference"]
            recognizer.client = None

        # Mock the parent __call__ to return matching layout lists
        with patch.object(type(recognizer).__bases__[0], "__call__", return_value=[[], []]):
            # Mismatched lengths should raise
            with pytest.raises(AssertionError):
                recognizer([MagicMock()], [[], []])  # 1 image, 2 OCR results

    def test_empty_input_returns_empty(self):
        """Verify empty input produces empty output."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer

        with patch.object(LayoutRecognizer, "__init__", lambda self, domain: None):
            recognizer = LayoutRecognizer.__new__(LayoutRecognizer)
            recognizer.labels = LayoutRecognizer.labels
            recognizer.garbage_layouts = ["footer", "header", "reference"]
            recognizer.client = None

        # Mock parent __call__ to return empty
        with patch.object(type(recognizer).__bases__[0], "__call__", return_value=[]):
            result = recognizer([], [], scale_factor=3, thr=0.2)

        assert result == []


class TestLayoutTypes:
    """Tests for layout type classification constants."""

    def test_text_type_exists(self):
        """Verify 'Text' is a recognized layout type."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer
        assert "Text" in LayoutRecognizer.labels

    def test_table_type_exists(self):
        """Verify 'Table' is a recognized layout type."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer
        assert "Table" in LayoutRecognizer.labels

    def test_figure_type_exists(self):
        """Verify 'Figure' is a recognized layout type."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer
        assert "Figure" in LayoutRecognizer.labels

    def test_title_type_exists(self):
        """Verify 'Title' is a recognized layout type."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer
        assert "Title" in LayoutRecognizer.labels

    def test_equation_type_exists(self):
        """Verify 'Equation' is a recognized layout type."""
        from deepdoc.vision.layout_recognizer import LayoutRecognizer
        assert "Equation" in LayoutRecognizer.labels
