"""Unit tests for PDF post-processor module.

Tests the SimpleRect helper class, content detection heuristics,
bounds detection logic, and the public trim/process API with mocked
pypdf and pdfminer dependencies.
"""
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch, mock_open

# Mock logger before importing
sys.modules.setdefault('src.logger', MagicMock())

# ---------------------------------------------------------------------------
# Mock pypdf and pdfminer to avoid cryptography/cffi dependency issues.
# We create lightweight stubs that satisfy the import statements in
# pdf_processor.py without requiring the actual C-level crypto backends.
# ---------------------------------------------------------------------------

# Build mock pypdf module with PdfReader, PdfWriter, RectangleObject
_mock_pypdf = MagicMock()


class _MockRectangleObject:
    """Stub for pypdf.generic.RectangleObject."""

    def __init__(self, coords):
        """Store coordinates tuple."""
        self._coords = coords


_mock_pypdf.generic.RectangleObject = _MockRectangleObject

# Ensure pypdf is mocked before importing pdf_processor
sys.modules['pypdf'] = _mock_pypdf
sys.modules['pypdf.generic'] = _mock_pypdf.generic

# pdfminer layout classes — need real-ish class hierarchy for isinstance checks
_mock_pdfminer = MagicMock()
_mock_pdfminer_hl = MagicMock()


class _LTPage:
    """Stub for pdfminer LTPage."""
    pass


class _LTTextContainer:
    """Stub for pdfminer LTTextContainer."""

    def get_text(self) -> str:
        """Return text content."""
        return ''


class _LTTextBox(_LTTextContainer):
    """Stub for pdfminer LTTextBox (inherits LTTextContainer)."""

    def __init__(self, text='', bbox=None):
        """Create a text box with optional text and bbox."""
        self._text = text
        self.bbox = bbox or (0, 0, 0, 0)

    def get_text(self) -> str:
        """Return stored text content."""
        return self._text


class _LTImage:
    """Stub for pdfminer LTImage."""
    pass


class _LTFigure:
    """Stub for pdfminer LTFigure."""
    pass


class _LTRect:
    """Stub for pdfminer LTRect."""
    pass


class _LTLine:
    """Stub for pdfminer LTLine."""
    pass


class _LTCurve:
    """Stub for pdfminer LTCurve."""
    pass


# Wire up pdfminer.layout module
_layout_mod = MagicMock()
_layout_mod.LTPage = _LTPage
_layout_mod.LTTextContainer = _LTTextContainer
_layout_mod.LTTextBox = _LTTextBox
_layout_mod.LTImage = _LTImage
_layout_mod.LTFigure = _LTFigure
_layout_mod.LTRect = _LTRect
_layout_mod.LTLine = _LTLine
_layout_mod.LTCurve = _LTCurve

sys.modules['pdfminer'] = _mock_pdfminer
sys.modules['pdfminer.high_level'] = _mock_pdfminer_hl
sys.modules['pdfminer.layout'] = _layout_mod

import pytest

# Now import the module under test — pypdf and pdfminer are pre-mocked
from src.pdf_processor import (
    SimpleRect,
    _page_has_content,
    _detect_content_bounds,
    _detect_bounds_parallel,
    _save_pdf,
    process_pdf,
)


# ============================================================================
# SimpleRect tests
# ============================================================================

class TestSimpleRect:
    """Tests for the SimpleRect bounding-box helper class."""

    def test_initialization(self):
        """Verify coordinates are stored correctly on construction."""
        rect = SimpleRect(10.0, 20.0, 100.0, 200.0)
        assert rect.x0 == 10.0
        assert rect.y0 == 20.0
        assert rect.x1 == 100.0
        assert rect.y1 == 200.0

    def test_is_important_default(self):
        """Verify is_important defaults to False."""
        rect = SimpleRect(0, 0, 10, 10)
        assert rect.is_important is False

    def test_is_important_set(self):
        """Verify is_important can be set to True."""
        rect = SimpleRect(0, 0, 10, 10, is_important=True)
        assert rect.is_important is True

    def test_width_property(self):
        """Verify width is computed as x1 - x0."""
        rect = SimpleRect(10.0, 0, 50.0, 0)
        assert rect.width == 40.0

    def test_height_property(self):
        """Verify height is computed as y1 - y0."""
        rect = SimpleRect(0, 15.0, 0, 75.0)
        assert rect.height == 60.0

    def test_area_property(self):
        """Verify area is computed as width * height."""
        rect = SimpleRect(0, 0, 10.0, 20.0)
        assert rect.area == 200.0

    def test_zero_dimensions(self):
        """Verify zero-size rect has zero area."""
        rect = SimpleRect(5, 5, 5, 5)
        assert rect.width == 0.0
        assert rect.height == 0.0
        assert rect.area == 0.0

    def test_negative_dimensions(self):
        """Verify negative dimensions produce negative width/height.

        SimpleRect does not validate coordinates — callers are
        responsible for ensuring x0 <= x1 and y0 <= y1.
        """
        rect = SimpleRect(100, 100, 50, 50)
        assert rect.width == -50.0
        assert rect.height == -50.0
        # Area is positive because (-50) * (-50) = 2500
        assert rect.area == 2500.0

    def test_float_precision(self):
        """Verify floating-point coordinates are handled."""
        rect = SimpleRect(0.1, 0.2, 0.3, 0.4)
        assert rect.width == pytest.approx(0.2)
        assert rect.height == pytest.approx(0.2)
        assert rect.area == pytest.approx(0.04)


# ============================================================================
# _page_has_content tests
# ============================================================================

class TestPageHasContent:
    """Tests for _page_has_content() internal function."""

    def test_empty_page(self):
        """Verify an empty page returns False."""
        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([]))
        assert _page_has_content(mock_page) is False

    def test_page_with_text(self):
        """Verify a page with text content returns True."""
        mock_text = _LTTextBox(text='Hello World')

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_text]))
        assert _page_has_content(mock_page) is True

    def test_page_with_whitespace_only_text(self):
        """Verify a page with only whitespace text returns False."""
        mock_text = _LTTextBox(text='   \n  ')

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_text]))
        assert _page_has_content(mock_page) is False

    def test_page_with_image(self):
        """Verify a page with an image returns True."""
        mock_image = MagicMock(spec=_LTImage)

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_image]))
        assert _page_has_content(mock_page) is True

    def test_page_with_figure(self):
        """Verify a page with a figure returns True."""
        mock_figure = MagicMock(spec=_LTFigure)

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_figure]))
        assert _page_has_content(mock_page) is True

    def test_page_with_large_rect(self):
        """Verify a page with a rect larger than 5pt returns True."""
        mock_rect = MagicMock(spec=_LTRect)
        # bbox = (x0, y0, x1, y1) — width=10, height=10 (>5pt threshold)
        mock_rect.bbox = (0, 0, 10, 10)

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_rect]))
        assert _page_has_content(mock_page) is True

    def test_page_with_tiny_rect(self):
        """Verify a page with only tiny rects (<= 5pt) returns False."""
        mock_rect = MagicMock(spec=_LTRect)
        # bbox with width=3, height=2 — both under 5pt threshold
        mock_rect.bbox = (0, 0, 3, 2)

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_rect]))
        assert _page_has_content(mock_page) is False

    def test_page_with_line(self):
        """Verify a page with a large line returns True."""
        mock_line = MagicMock(spec=_LTLine)
        mock_line.bbox = (0, 0, 100, 10)

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_line]))
        assert _page_has_content(mock_page) is True


# ============================================================================
# _detect_content_bounds tests
# ============================================================================

class TestDetectContentBounds:
    """Tests for _detect_content_bounds() internal function."""

    def test_empty_page_returns_none(self):
        """Verify an empty page returns None bounds."""
        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([]))

        result = _detect_content_bounds(mock_page, 612.0, 792.0)
        assert result is None

    def test_single_text_element(self):
        """Verify bounds match a single text element's bbox."""
        mock_text = _LTTextBox(text='Content', bbox=(50.0, 100.0, 200.0, 150.0))

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_text]))

        result = _detect_content_bounds(mock_page, 612.0, 792.0)
        assert result is not None
        x0, y0, x1, y1 = result
        assert x0 == 50.0
        assert y0 == 100.0
        assert x1 == 200.0
        assert y1 == 150.0

    def test_background_artifact_filtered(self):
        """Verify elements covering >90% of page area are skipped."""
        # Page is 100x100 = 10000 area
        # Rect covers 96x96 = 9216 area (>90% of page)
        mock_bg = MagicMock(spec=_LTRect)
        mock_bg.bbox = (2, 2, 98, 98)

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_bg]))

        result = _detect_content_bounds(mock_page, 100.0, 100.0)
        # Background-only page should return None
        assert result is None

    def test_multiple_elements_union(self):
        """Verify bounds are the union of multiple content elements."""
        mock_text1 = _LTTextBox(text='A', bbox=(10.0, 20.0, 100.0, 50.0))
        mock_text2 = _LTTextBox(text='B', bbox=(50.0, 100.0, 200.0, 300.0))

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_text1, mock_text2]))

        result = _detect_content_bounds(mock_page, 612.0, 792.0)
        assert result is not None
        x0, y0, x1, y1 = result
        # Union should encompass both elements
        assert x0 == 10.0
        assert y0 == 20.0
        assert x1 == 200.0
        assert y1 == 300.0

    def test_small_nonimportant_outlier_rejected(self):
        """Verify tiny non-text elements that expand bounds >10% are rejected.

        The outlier rejection algorithm keeps text elements (headers/footers)
        but rejects tiny non-text elements that would disproportionately
        expand the bounding box.
        """
        # Main content element — large text block
        mock_text = _LTTextBox(text='Main Content', bbox=(100.0, 100.0, 500.0, 700.0))

        # Tiny decorative rect far from content — would expand bounds
        mock_dot = MagicMock(spec=_LTRect)
        mock_dot.bbox = (1.0, 1.0, 2.0, 2.0)

        mock_page = MagicMock()
        mock_page.__iter__ = MagicMock(return_value=iter([mock_text, mock_dot]))

        result = _detect_content_bounds(mock_page, 612.0, 792.0)
        assert result is not None
        x0, y0, x1, y1 = result
        # The tiny dot should be rejected — bounds should match main content
        assert x0 == 100.0
        assert y0 == 100.0


# ============================================================================
# _detect_bounds_parallel tests
# ============================================================================

class TestDetectBoundsParallel:
    """Tests for _detect_bounds_parallel() function."""

    def test_empty_list(self):
        """Verify empty input returns empty results."""
        result = _detect_bounds_parallel([], [], max_workers=2)
        assert result == []

    def test_single_page_sequential(self):
        """Verify single page is processed sequentially (not via thread pool)."""
        # Single None page should produce [None]
        result = _detect_bounds_parallel([None], [(612.0, 792.0)], max_workers=2)
        assert result == [None]

    def test_two_pages_sequential(self):
        """Verify two pages are processed sequentially (threshold is <=2)."""
        result = _detect_bounds_parallel(
            [None, None],
            [(612.0, 792.0), (612.0, 792.0)],
            max_workers=2,
        )
        assert len(result) == 2
        assert result == [None, None]

    def test_three_pages_parallel(self):
        """Verify three or more pages trigger parallel processing."""
        # All None pages — no content detection needed
        result = _detect_bounds_parallel(
            [None, None, None],
            [(612.0, 792.0)] * 3,
            max_workers=2,
        )
        assert len(result) == 3
        assert result == [None, None, None]


# ============================================================================
# process_pdf tests (public API with mocked I/O)
# ============================================================================

class TestProcessPdf:
    """Tests for process_pdf() public API."""

    @patch('src.pdf_processor.trim_whitespace')
    @patch('src.pdf_processor.trim_empty_pages')
    def test_calls_both_steps(self, mock_trim_empty, mock_trim_ws):
        """Verify both processing steps are called when enabled."""
        mock_trim_empty.return_value = '/tmp/test.pdf'
        mock_trim_ws.return_value = '/tmp/test.pdf'

        result = process_pdf('/tmp/test.pdf', remove_empty=True, trim=True)

        mock_trim_empty.assert_called_once_with('/tmp/test.pdf', None)
        mock_trim_ws.assert_called_once()
        assert result == '/tmp/test.pdf'

    @patch('src.pdf_processor.trim_whitespace')
    @patch('src.pdf_processor.trim_empty_pages')
    def test_skip_both_steps(self, mock_trim_empty, mock_trim_ws):
        """Verify neither step is called when both disabled."""
        result = process_pdf('/tmp/test.pdf', remove_empty=False, trim=False)

        mock_trim_empty.assert_not_called()
        mock_trim_ws.assert_not_called()
        assert result == '/tmp/test.pdf'

    @patch('src.pdf_processor.trim_whitespace')
    @patch('src.pdf_processor.trim_empty_pages')
    def test_only_remove_empty(self, mock_trim_empty, mock_trim_ws):
        """Verify only empty page removal runs when trim is disabled."""
        mock_trim_empty.return_value = '/tmp/test.pdf'

        result = process_pdf('/tmp/test.pdf', remove_empty=True, trim=False)

        mock_trim_empty.assert_called_once()
        mock_trim_ws.assert_not_called()

    @patch('src.pdf_processor.trim_whitespace')
    @patch('src.pdf_processor.trim_empty_pages')
    def test_only_trim_whitespace(self, mock_trim_empty, mock_trim_ws):
        """Verify only whitespace trimming runs when empty removal is disabled."""
        mock_trim_ws.return_value = '/tmp/test.pdf'

        result = process_pdf('/tmp/test.pdf', remove_empty=False, trim=True)

        mock_trim_empty.assert_not_called()
        mock_trim_ws.assert_called_once()

    @patch('src.pdf_processor.trim_whitespace')
    @patch('src.pdf_processor.trim_empty_pages')
    def test_custom_margin_passed(self, mock_trim_empty, mock_trim_ws):
        """Verify custom trim margin is forwarded to trim_whitespace."""
        mock_trim_empty.return_value = '/tmp/test.pdf'
        mock_trim_ws.return_value = '/tmp/test.pdf'

        process_pdf('/tmp/test.pdf', trim_margin=25.0)

        # Verify margin kwarg was passed
        call_kwargs = mock_trim_ws.call_args
        assert call_kwargs.kwargs.get('margin') == 25.0

    @patch('src.pdf_processor.trim_whitespace')
    @patch('src.pdf_processor.trim_empty_pages')
    def test_output_path_forwarded(self, mock_trim_empty, mock_trim_ws):
        """Verify output_path is forwarded to both processing steps."""
        mock_trim_empty.return_value = '/tmp/output.pdf'
        mock_trim_ws.return_value = '/tmp/output.pdf'

        result = process_pdf('/tmp/test.pdf', output_path='/tmp/output.pdf')

        # trim_empty_pages should receive output_path
        mock_trim_empty.assert_called_once_with('/tmp/test.pdf', '/tmp/output.pdf')
        assert result == '/tmp/output.pdf'


# ============================================================================
# _save_pdf tests
# ============================================================================

class TestSavePdf:
    """Tests for _save_pdf() internal helper."""

    def test_save_to_different_path(self, tmp_path):
        """Verify saving to a different path writes directly."""
        mock_writer = MagicMock()
        input_file = tmp_path / 'input.pdf'
        input_file.touch()
        target = tmp_path / 'output.pdf'

        _save_pdf(mock_writer, input_file, target)

        # Writer should have been called to write to the target
        mock_writer.write.assert_called_once()

    def test_save_overwrite_same_path(self, tmp_path):
        """Verify overwriting same path uses temp file strategy."""
        mock_writer = MagicMock()
        input_file = tmp_path / 'test.pdf'
        input_file.write_bytes(b'dummy')

        _save_pdf(mock_writer, input_file, input_file)

        # Writer should have been called (writes to temp, then renames)
        mock_writer.write.assert_called_once()

    def test_creates_parent_directories(self, tmp_path):
        """Verify parent directories are created if they don't exist."""
        mock_writer = MagicMock()
        input_file = tmp_path / 'input.pdf'
        input_file.touch()
        target = tmp_path / 'subdir' / 'nested' / 'output.pdf'

        _save_pdf(mock_writer, input_file, target)

        # Parent directories should have been created
        assert target.parent.exists()
