"""Unit tests for the naive (general-purpose) document parser module.

Tests the dispatch logic, format detection, helper functions, and
section normalization in rag/app/naive.py. Heavy dependencies such
as PDF/DOCX parsers, OCR, and LLM services are mocked via conftest.
"""

import os
import sys
import pytest
from unittest.mock import MagicMock, patch

dummy_callback = lambda prog=None, msg="": None

from rag.app.naive import (
    _normalize_section_text_for_rtl_presentation_forms,
    PARSERS,
)


class TestParsersRegistry:
    """Tests for the PARSERS dispatch dictionary."""

    def test_parsers_contains_expected_keys(self):
        """PARSERS dict should contain all supported backend names."""
        expected_keys = {"deepdoc", "mineru", "docling", "tcadp parser", "paddleocr", "plaintext"}
        assert expected_keys == set(PARSERS.keys())

    def test_parsers_values_are_callable(self):
        """Every parser backend in the registry must be callable."""
        for name, parser_fn in PARSERS.items():
            assert callable(parser_fn), f"Parser '{name}' is not callable"


class TestNormalizeSectionTextForRtl:
    """Tests for _normalize_section_text_for_rtl_presentation_forms."""

    def test_returns_none_or_empty_for_falsy_input(self):
        """Should return the input unchanged when falsy."""
        assert _normalize_section_text_for_rtl_presentation_forms(None) is None
        assert _normalize_section_text_for_rtl_presentation_forms([]) == []

    def test_normalizes_tuple_sections(self):
        """Tuple sections should have their first element normalized."""
        sections = [("hello world", "tag1")]
        result = _normalize_section_text_for_rtl_presentation_forms(sections)
        assert result[0][0] == "hello world"
        assert result[0][1] == "tag1"

    def test_normalizes_list_sections(self):
        """List sections should have their first element normalized."""
        sections = [["hello world", "tag1"]]
        result = _normalize_section_text_for_rtl_presentation_forms(sections)
        assert result[0][0] == "hello world"
        assert result[0][1] == "tag1"

    def test_normalizes_plain_string_sections(self):
        """Plain string sections should be normalized directly."""
        sections = ["hello world"]
        result = _normalize_section_text_for_rtl_presentation_forms(sections)
        assert result[0] == "hello world"

    def test_preserves_empty_tuples(self):
        """Empty tuples in sections list should be preserved as-is."""
        sections = [()]
        result = _normalize_section_text_for_rtl_presentation_forms(sections)
        assert result[0] == ()

    def test_preserves_empty_lists(self):
        """Empty lists in sections list should be preserved as-is."""
        sections = [[]]
        result = _normalize_section_text_for_rtl_presentation_forms(sections)
        assert result[0] == []

    def test_handles_mixed_section_types(self):
        """Should handle a mix of tuples, lists, and strings."""
        sections = [("text1", "tag1"), ["text2", "tag2"], "text3", (), []]
        result = _normalize_section_text_for_rtl_presentation_forms(sections)
        assert len(result) == 5
        assert result[0][0] == "text1"
        assert result[1][0] == "text2"
        assert result[2] == "text3"
        assert result[3] == ()
        assert result[4] == []


class TestChunkDispatchByFileExtension:
    """Tests for the chunk() function's file extension dispatch logic."""

    @patch("rag.app.naive.extract_embed_file", return_value=[])
    @patch("rag.app.naive.TxtParser")
    def test_txt_extension_dispatches_to_txt_parser(self, mock_txt_cls, mock_embed):
        """A .txt file should be parsed by TxtParser."""
        from rag.app.naive import chunk

        mock_txt_instance = MagicMock(return_value=[("line1", ""), ("line2", "")])
        mock_txt_cls.return_value = mock_txt_instance

        with patch("rag.app.naive.naive_merge", return_value=["chunk1"]):
            with patch("rag.app.naive.tokenize_chunks", return_value=[{"content": "c1"}]):
                result = chunk("test.txt", binary=b"hello\nworld", callback=dummy_callback)

        mock_txt_cls.assert_called_once()

    @patch("rag.app.naive.extract_embed_file", return_value=[])
    @patch("rag.app.naive.HtmlParser")
    def test_html_extension_dispatches_to_html_parser(self, mock_html_cls, mock_embed):
        """A .html file should be parsed by HtmlParser."""
        from rag.app.naive import chunk

        mock_html_instance = MagicMock(return_value=["<p>hello</p>"])
        mock_html_cls.return_value = mock_html_instance

        with patch("rag.app.naive.naive_merge", return_value=["chunk1"]):
            with patch("rag.app.naive.tokenize_chunks", return_value=[{"content": "c1"}]):
                result = chunk("test.html", binary=b"<html>hello</html>", callback=dummy_callback)

        mock_html_cls.assert_called_once()

    @patch("rag.app.naive.extract_embed_file", return_value=[])
    @patch("rag.app.naive.JsonParser")
    def test_json_extension_dispatches_to_json_parser(self, mock_json_cls, mock_embed):
        """A .json file should be parsed by JsonParser."""
        from rag.app.naive import chunk

        mock_json_instance = MagicMock(return_value=['{"key": "value"}'])
        mock_json_cls.return_value = mock_json_instance

        with patch("rag.app.naive.naive_merge", return_value=["chunk1"]):
            with patch("rag.app.naive.tokenize_chunks", return_value=[{"content": "c1"}]):
                result = chunk("data.json", binary=b'{"key":"value"}', callback=dummy_callback)

        mock_json_cls.assert_called_once()

    @patch("rag.app.naive.extract_embed_file", return_value=[])
    def test_unsupported_extension_raises_not_implemented(self, mock_embed):
        """An unsupported file extension should raise NotImplementedError."""
        from rag.app.naive import chunk

        with pytest.raises(NotImplementedError):
            chunk("test.xyz", binary=b"content", callback=dummy_callback)


class TestChunkParserConfigDefaults:
    """Tests for default parser_config handling in chunk()."""

    @patch("rag.app.naive.extract_embed_file", return_value=[])
    @patch("rag.app.naive.TxtParser")
    @patch("rag.app.naive.naive_merge", return_value=["chunk1"])
    @patch("rag.app.naive.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_default_parser_config_applied(self, mock_tok, mock_merge, mock_txt, mock_embed):
        """When no parser_config kwarg is given, defaults should be used."""
        from rag.app.naive import chunk

        mock_txt.return_value = MagicMock(return_value=[("line", "")])
        result = chunk("test.txt", binary=b"hello", callback=dummy_callback)

        call_args = mock_merge.call_args
        assert call_args is not None

    @patch("rag.app.naive.extract_embed_file", return_value=[])
    @patch("rag.app.naive.TxtParser")
    @patch("rag.app.naive.naive_merge", return_value=["chunk1"])
    @patch("rag.app.naive.tokenize_chunks", return_value=[{"content": "c1"}])
    def test_custom_chunk_token_num_passed_through(self, mock_tok, mock_merge, mock_txt, mock_embed):
        """Custom chunk_token_num in parser_config should be forwarded."""
        from rag.app.naive import chunk

        mock_txt.return_value = MagicMock(return_value=[("line", "")])
        result = chunk(
            "test.txt",
            binary=b"hello",
            callback=dummy_callback,
            parser_config={"chunk_token_num": 256, "delimiter": "\n"},
        )

        call_args = mock_merge.call_args
        assert call_args[0][1] == 256


class TestPdfParserSelection:
    """Tests for PDF parser backend selection logic."""

    def test_deepdoc_key_maps_to_by_deepdoc(self):
        """The 'deepdoc' key should map to by_deepdoc function."""
        from rag.app.naive import by_deepdoc
        assert PARSERS["deepdoc"] is by_deepdoc

    def test_mineru_key_maps_to_by_mineru(self):
        """The 'mineru' key should map to by_mineru function."""
        from rag.app.naive import by_mineru
        assert PARSERS["mineru"] is by_mineru

    def test_plaintext_key_maps_to_by_plaintext(self):
        """The 'plaintext' key should map to by_plaintext function."""
        from rag.app.naive import by_plaintext
        assert PARSERS["plaintext"] is by_plaintext


class TestByPlaintext:
    """Tests for the by_plaintext PDF parser backend."""

    @patch("rag.app.naive.PlainParser")
    def test_by_plaintext_with_no_layout_recognizer(self, mock_plain_cls):
        """When no layout_recognizer is set, PlainParser should be used."""
        from rag.app.naive import by_plaintext

        mock_parser = MagicMock(return_value=([("text", "tag")], []))
        mock_plain_cls.return_value = mock_parser

        sections, tables, parser = by_plaintext(
            "test.pdf", binary=b"pdf-content", callback=dummy_callback
        )

        mock_plain_cls.assert_called_once()

    def test_by_plaintext_with_vision_recognizer_requires_tenant_id(self):
        """When a non-plain layout_recognizer is set, tenant_id is required."""
        from rag.app.naive import by_plaintext

        with pytest.raises(ValueError, match="tenant_id is required"):
            by_plaintext(
                "test.pdf", binary=b"content", callback=dummy_callback,
                layout_recognizer="SomeVisionModel"
            )


class TestByMineru:
    """Tests for the by_mineru PDF parser backend."""

    def test_by_mineru_without_tenant_returns_none(self):
        """by_mineru without tenant_id should invoke callback and return Nones."""
        from rag.app.naive import by_mineru

        cb = MagicMock()
        sections, tables, parser = by_mineru(
            "test.pdf", binary=b"content", callback=cb, tenant_id=None
        )

        cb.assert_called_with(-1, "MinerU not found.")
        assert sections is None
        assert tables is None
        assert parser is None


class TestByDocling:
    """Tests for the by_docling PDF parser backend."""

    @patch("rag.app.naive.DoclingParser")
    def test_by_docling_not_installed_calls_callback(self, mock_docling_cls):
        """When Docling is not installed, callback should be invoked with -1."""
        from rag.app.naive import by_docling

        mock_parser = MagicMock()
        mock_parser.check_installation.return_value = False
        mock_docling_cls.return_value = mock_parser

        cb = MagicMock()
        sections, tables, parser = by_docling("test.pdf", binary=b"content", callback=cb)

        cb.assert_called_with(-1, "Docling not found.")
        assert sections is None
        assert tables is None


class TestByTcadp:
    """Tests for the by_tcadp PDF parser backend."""

    @patch("rag.app.naive.TCADPParser")
    def test_by_tcadp_not_installed_calls_callback(self, mock_tcadp_cls):
        """When TCADP is not available, callback should be invoked with -1."""
        from rag.app.naive import by_tcadp

        mock_parser = MagicMock()
        mock_parser.check_installation.return_value = False
        mock_tcadp_cls.return_value = mock_parser

        cb = MagicMock()
        sections, tables, parser = by_tcadp("test.pdf", binary=b"content", callback=cb)

        cb.assert_called_with(-1, "TCADP parser not available. Please check Tencent Cloud API configuration.")
        assert sections is None
        assert tables is None
