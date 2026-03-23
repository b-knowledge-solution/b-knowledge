"""Unit tests for the presentation (PPT/PPTX/PDF) parser module.

Tests file extension dispatch, page-per-chunk logic, PPTX/PDF routing,
tika fallback handling, and metadata generation in rag/app/presentation.py.
External parsers, file I/O, and OCR are mocked.
"""

import os
import sys
import types
import copy
import pytest
from unittest.mock import MagicMock, patch, PropertyMock

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


_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
_mock_rag_tokenizer.fine_grained_tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()

_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer

for _fn_name in ["tokenize"]:
    if not hasattr(sys.modules["rag.nlp"], _fn_name):
        setattr(sys.modules["rag.nlp"], _fn_name, MagicMock())

dummy_callback = lambda prog=None, msg="": None


class TestPresentationChunkDispatch:
    """Tests for the chunk() function's file extension dispatch."""

    def test_unsupported_extension_raises_not_implemented(self):
        """An unsupported extension should raise NotImplementedError."""
        from rag.app.presentation import chunk

        with pytest.raises(NotImplementedError):
            chunk("slides.xyz", binary=b"content", callback=dummy_callback)

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_pptx_dispatches_to_ppt_parser(self, mock_tokenize, mock_ppt_cls):
        """A .pptx file should be parsed by RAGFlowPptParser."""
        from rag.app.presentation import chunk

        # Mock parser to yield slide texts
        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1 content", "Slide 2 content"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("slides.pptx", binary=b"pptx-bytes", callback=dummy_callback)

        mock_ppt_cls.assert_called_once()
        # Should produce one chunk per slide
        assert len(result) == 2

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_ppt_dispatches_to_ppt_parser(self, mock_tokenize, mock_ppt_cls):
        """A .ppt file should also be handled by RAGFlowPptParser."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("slides.ppt", binary=b"ppt-bytes", callback=dummy_callback)

        mock_ppt_cls.assert_called_once()
        assert len(result) >= 1


class TestPresentationPptxChunking:
    """Tests for PPTX slide-per-chunk metadata generation."""

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_each_slide_gets_page_number(self, mock_tokenize, mock_ppt_cls):
        """Each slide should have page_num_int metadata."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1", "Slide 2", "Slide 3"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("slides.pptx", binary=b"pptx-bytes", callback=dummy_callback)

        # Verify page numbers are sequential starting from 1
        for i, d in enumerate(result):
            assert d["page_num_int"] == [i + 1]

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_each_slide_has_doc_type_image(self, mock_tokenize, mock_ppt_cls):
        """Each PPTX slide chunk should have doc_type_kwd='image'."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("slides.pptx", binary=b"pptx-bytes", callback=dummy_callback)

        assert result[0]["doc_type_kwd"] == "image"

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_position_metadata_set(self, mock_tokenize, mock_ppt_cls):
        """Each slide should have position_int metadata."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("slides.pptx", binary=b"pptx-bytes", callback=dummy_callback)

        assert "position_int" in result[0]
        # Position should be a list of tuples
        assert result[0]["position_int"][0][0] == 1  # page number

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_from_page_offset_applied(self, mock_tokenize, mock_ppt_cls):
        """The from_page offset should be added to page numbers."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1", "Slide 2"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("slides.pptx", binary=b"pptx-bytes", callback=dummy_callback, from_page=5)

        # Page numbers should start from 6 (from_page + 1)
        assert result[0]["page_num_int"] == [6]
        assert result[1]["page_num_int"] == [7]


class TestPresentationPptxFallback:
    """Tests for PPTX parsing with tika fallback."""

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_pptx_parser_failure_falls_back_to_tika(self, mock_tokenize, mock_ppt_cls):
        """When python-pptx fails, should attempt tika fallback."""
        from rag.app.presentation import chunk

        # Make python-pptx fail
        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value.__iter__ = MagicMock(side_effect=Exception("pptx parse error"))
        mock_ppt_cls.return_value = mock_parser_instance

        # Mock tika to also not be available
        with patch.dict("sys.modules", {"tika": None, "tika.parser": None}):
            with pytest.raises(NotImplementedError, match="tika not available"):
                chunk("bad.pptx", binary=b"broken-pptx", callback=dummy_callback)


class TestPresentationPdfDispatch:
    """Tests for PDF file handling in presentation mode."""

    @patch("rag.app.presentation.normalize_layout_recognizer", return_value=("Plain Text", None))
    @patch("rag.app.presentation.PARSERS")
    @patch("rag.app.presentation.tokenize")
    @patch("rag.app.presentation.is_image_like", return_value=False)
    @patch("rag.app.presentation.ensure_pil_image")
    def test_pdf_dispatches_to_parser_backend(self, mock_pil, mock_img_like, mock_tokenize, mock_parsers, mock_normalize):
        """A .pdf file should dispatch to the configured parser backend."""
        from rag.app.presentation import chunk

        # Mock the parser to return sections with page text and image
        mock_parser_fn = MagicMock(return_value=(
            [("Page 1 text", None), ("Page 2 text", None)],
            [],
            MagicMock()
        ))
        mock_parsers.get.return_value = mock_parser_fn

        result = chunk(
            "slides.pdf", binary=b"pdf-bytes", callback=dummy_callback,
            parser_config={"layout_recognize": "Plain Text"}
        )

        assert len(result) == 2

    @patch("rag.app.presentation.normalize_layout_recognizer", return_value=("Plain Text", None))
    @patch("rag.app.presentation.PARSERS")
    def test_pdf_empty_sections_returns_empty(self, mock_parsers, mock_normalize):
        """When PDF parsing produces no sections, return empty list."""
        from rag.app.presentation import chunk

        mock_parser_fn = MagicMock(return_value=([], [], None))
        mock_parsers.get.return_value = mock_parser_fn

        result = chunk(
            "empty.pdf", binary=b"pdf-bytes", callback=dummy_callback,
            parser_config={"layout_recognize": "Plain Text"}
        )

        assert result == []


class TestPresentationDocMetadata:
    """Tests for document metadata in presentation chunks."""

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_docnm_kwd_set_to_filename(self, mock_tokenize, mock_ppt_cls):
        """Each chunk should have docnm_kwd set to the original filename."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("my_slides.pptx", binary=b"pptx-bytes", callback=dummy_callback)

        assert result[0]["docnm_kwd"] == "my_slides.pptx"

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_title_tks_derived_from_filename(self, mock_tokenize, mock_ppt_cls):
        """title_tks should be derived from filename without extension."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("my_slides.pptx", binary=b"pptx-bytes", callback=dummy_callback)

        # title_tks should be tokenized version of "my_slides"
        assert "title_tks" in result[0]

    @patch("rag.app.presentation.RAGFlowPptParser")
    @patch("rag.app.presentation.tokenize")
    def test_top_int_set_to_zero(self, mock_tokenize, mock_ppt_cls):
        """Each presentation chunk should have top_int = [0]."""
        from rag.app.presentation import chunk

        mock_parser_instance = MagicMock()
        mock_parser_instance.return_value = iter(["Slide 1"])
        mock_ppt_cls.return_value = mock_parser_instance

        result = chunk("slides.pptx", binary=b"pptx-bytes", callback=dummy_callback)

        assert result[0]["top_int"] == [0]
