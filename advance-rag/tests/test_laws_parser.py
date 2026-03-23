"""Unit tests for the legal document parser module.

Tests the chunk() dispatch logic, file extension routing, section
processing, and tree-based merging in rag/app/laws.py. Heavy
dependencies (PDF, DOCX, OCR) are mocked.
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

# Provide stub callables for functions imported from rag.nlp
for _fn_name in [
    "bullets_category", "remove_contents_table", "make_colon_as_title",
    "tokenize_chunks", "docx_question_level", "tree_merge", "Node",
]:
    if not hasattr(sys.modules["rag.nlp"], _fn_name):
        setattr(sys.modules["rag.nlp"], _fn_name, MagicMock())

dummy_callback = lambda prog=None, msg="": None


class TestLawsChunkDispatch:
    """Tests for the chunk() function's file extension dispatch."""

    @patch("rag.app.laws.Docx")
    @patch("rag.app.laws.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_docx_dispatches_to_laws_docx_parser(self, mock_tok, mock_docx_cls):
        """A .docx file should be parsed by the laws-specific Docx parser."""
        from rag.app.laws import chunk

        mock_docx_instance = MagicMock(return_value=["Article 1 text", "Article 2 text"])
        mock_docx_cls.return_value = mock_docx_instance

        result = chunk("contract.docx", binary=b"docx-bytes", callback=dummy_callback)

        mock_docx_cls.assert_called_once()
        mock_docx_instance.assert_called_once()

    @patch("rag.app.laws.get_text", return_value="Section 1\nSection 2\nSection 3")
    @patch("rag.app.laws.remove_contents_table")
    @patch("rag.app.laws.make_colon_as_title")
    @patch("rag.app.laws.bullets_category", return_value=0)
    @patch("rag.app.laws.tree_merge", return_value=["merged chunk 1"])
    @patch("rag.app.laws.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_txt_dispatches_to_text_parsing(self, mock_tok, mock_tree, mock_bull, mock_colon, mock_remove, mock_get_text):
        """A .txt file should be parsed as plain text with tree merging."""
        from rag.app.laws import chunk

        result = chunk("law.txt", binary=b"Section 1\nSection 2", callback=dummy_callback)

        mock_get_text.assert_called_once()
        mock_tree.assert_called_once()

    @patch("rag.app.laws.get_text", return_value="# Heading\nContent here")
    @patch("rag.app.laws.remove_contents_table")
    @patch("rag.app.laws.make_colon_as_title")
    @patch("rag.app.laws.bullets_category", return_value=0)
    @patch("rag.app.laws.tree_merge", return_value=["merged chunk"])
    @patch("rag.app.laws.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_markdown_dispatches_to_text_parsing(self, mock_tok, mock_tree, mock_bull, mock_colon, mock_remove, mock_get_text):
        """A .md file should be parsed as text with tree merging."""
        from rag.app.laws import chunk

        result = chunk("regulation.md", binary=b"# Heading\nContent", callback=dummy_callback)

        mock_get_text.assert_called_once()

    @patch("rag.app.laws.HtmlParser")
    @patch("rag.app.laws.remove_contents_table")
    @patch("rag.app.laws.make_colon_as_title")
    @patch("rag.app.laws.bullets_category", return_value=0)
    @patch("rag.app.laws.tree_merge", return_value=["merged chunk"])
    @patch("rag.app.laws.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_html_dispatches_to_html_parser(self, mock_tok, mock_tree, mock_bull, mock_colon, mock_remove, mock_html_cls):
        """A .html file should be parsed by HtmlParser."""
        from rag.app.laws import chunk

        mock_html_instance = MagicMock(return_value=["<p>Article 1</p>"])
        mock_html_cls.return_value = mock_html_instance

        result = chunk("law.html", binary=b"<html></html>", callback=dummy_callback)

        mock_html_cls.assert_called_once()

    def test_unsupported_extension_raises_not_implemented(self):
        """An unsupported extension should raise NotImplementedError."""
        from rag.app.laws import chunk

        with pytest.raises(NotImplementedError):
            chunk("law.xyz", binary=b"content", callback=dummy_callback)


class TestLawsChunkEmptyResult:
    """Tests for edge cases where parsing produces no results."""

    @patch("rag.app.laws.get_text", return_value="")
    @patch("rag.app.laws.remove_contents_table")
    @patch("rag.app.laws.make_colon_as_title")
    @patch("rag.app.laws.bullets_category", return_value=0)
    @patch("rag.app.laws.tree_merge", return_value=[])
    @patch("rag.app.laws.tokenize_chunks", return_value=[])
    def test_empty_text_triggers_no_chunk_callback(self, mock_tok, mock_tree, mock_bull, mock_colon, mock_remove, mock_get_text):
        """When no chunks are produced, callback should report it."""
        from rag.app.laws import chunk

        cb = MagicMock()
        result = chunk("empty.txt", binary=b"", callback=cb)

        # Callback should be called with 0.99 indicating no chunks
        cb.assert_any_call(0.99, "No chunk parsed out.")


class TestLawsPdfDispatch:
    """Tests for PDF file handling in the laws parser."""

    @patch("rag.app.laws.normalize_layout_recognizer", return_value=("DeepDOC", None))
    @patch("rag.app.laws.PARSERS", {"deepdoc": MagicMock(return_value=([("text", "tag")], None, MagicMock()))})
    @patch("rag.app.laws.remove_contents_table")
    @patch("rag.app.laws.make_colon_as_title")
    @patch("rag.app.laws.bullets_category", return_value=0)
    @patch("rag.app.laws.tree_merge", return_value=["merged chunk"])
    @patch("rag.app.laws.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_pdf_dispatches_to_parser_backend(self, mock_tok, mock_tree, mock_bull, mock_colon, mock_remove, mock_normalize):
        """A .pdf file should dispatch to the configured parser backend."""
        from rag.app.laws import chunk

        result = chunk("law.pdf", binary=b"pdf-bytes", callback=dummy_callback)

        # tree_merge should be called after section extraction
        mock_tree.assert_called_once()

    @patch("rag.app.laws.normalize_layout_recognizer", return_value=("DeepDOC", None))
    @patch("rag.app.laws.PARSERS", {"deepdoc": MagicMock(return_value=([], None, None))})
    @patch("rag.app.laws.tokenize_chunks", return_value=[])
    def test_pdf_empty_sections_returns_empty(self, mock_tok, mock_normalize):
        """When PDF parsing produces no sections and no tables, return empty."""
        from rag.app.laws import chunk

        result = chunk("empty.pdf", binary=b"pdf-bytes", callback=dummy_callback)

        assert result == []


class TestLawsDocParsing:
    """Tests for .doc file handling in the laws parser."""

    @patch("rag.app.laws.remove_contents_table")
    @patch("rag.app.laws.make_colon_as_title")
    @patch("rag.app.laws.bullets_category", return_value=0)
    @patch("rag.app.laws.tree_merge", return_value=["merged chunk"])
    @patch("rag.app.laws.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_doc_with_tika_unavailable_returns_empty(self, mock_tok, mock_tree, mock_bull, mock_colon, mock_remove):
        """When tika is unavailable for .doc files, should return empty list."""
        from rag.app.laws import chunk

        # Patch tika import to fail
        with patch.dict("sys.modules", {"tika": None, "tika.parser": None}):
            cb = MagicMock()
            result = chunk("law.doc", binary=b"doc-bytes", callback=cb)

            assert result == []
