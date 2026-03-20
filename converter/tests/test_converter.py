"""Unit tests for converter dispatcher module.

Tests file type routing, extension detection, and conversion dispatch.
"""
import sys
from unittest.mock import MagicMock, patch

# Mock heavy dependencies before importing
sys.modules.setdefault('src.logger', MagicMock())
mock_word = MagicMock()
mock_word.WORD_EXTENSIONS = {'.doc', '.docx', '.docm'}
mock_word.is_word_file = lambda f: any(f.lower().endswith(e) for e in ['.doc', '.docx', '.docm'])
mock_word.convert_word_to_pdf = MagicMock(return_value='/out/file.pdf')

mock_ppt = MagicMock()
mock_ppt.POWERPOINT_EXTENSIONS = {'.ppt', '.pptx', '.pptm'}
mock_ppt.is_powerpoint_file = lambda f: any(f.lower().endswith(e) for e in ['.ppt', '.pptx', '.pptm'])
mock_ppt.convert_powerpoint_to_pdf = MagicMock(return_value='/out/file.pdf')

mock_excel = MagicMock()
mock_excel.EXCEL_EXTENSIONS = {'.xls', '.xlsx', '.xlsm'}
mock_excel.is_excel_file = lambda f: any(f.lower().endswith(e) for e in ['.xls', '.xlsx', '.xlsm'])
mock_excel.convert_excel_to_pdf = MagicMock(return_value='/out/file.pdf')

sys.modules['src.word_converter'] = mock_word
sys.modules['src.powerpoint_converter'] = mock_ppt
sys.modules['src.excel_converter'] = mock_excel

import pytest
from src.converter import convert_to_pdf, is_office_file, is_pdf_file


class TestConvertToPdf:
    """Tests for convert_to_pdf() dispatcher."""

    def setup_method(self):
        """Reset mock call counts before each test."""
        mock_word.convert_word_to_pdf.reset_mock()
        mock_ppt.convert_powerpoint_to_pdf.reset_mock()
        mock_excel.convert_excel_to_pdf.reset_mock()

    def test_routes_word_file(self):
        """Verify Word files are routed to word converter."""
        convert_to_pdf('/input/file.docx', '/output')
        mock_word.convert_word_to_pdf.assert_called_with('/input/file.docx', '/output')

    def test_routes_word_doc(self):
        """Verify .doc files are routed to word converter."""
        convert_to_pdf('/input/file.doc', '/output')
        mock_word.convert_word_to_pdf.assert_called_with('/input/file.doc', '/output')

    def test_routes_word_docm(self):
        """Verify .docm files are routed to word converter."""
        convert_to_pdf('/input/file.docm', '/output')
        mock_word.convert_word_to_pdf.assert_called_with('/input/file.docm', '/output')

    def test_routes_powerpoint_file(self):
        """Verify PowerPoint files are routed to powerpoint converter."""
        convert_to_pdf('/input/file.pptx', '/output')
        mock_ppt.convert_powerpoint_to_pdf.assert_called_with('/input/file.pptx', '/output')

    def test_routes_powerpoint_ppt(self):
        """Verify .ppt files are routed to powerpoint converter."""
        convert_to_pdf('/input/file.ppt', '/output')
        mock_ppt.convert_powerpoint_to_pdf.assert_called_with('/input/file.ppt', '/output')

    def test_routes_excel_file(self):
        """Verify Excel files are routed to excel converter."""
        convert_to_pdf('/input/file.xlsx', '/output')
        mock_excel.convert_excel_to_pdf.assert_called_with('/input/file.xlsx', '/output')

    def test_routes_excel_xls(self):
        """Verify .xls files are routed to excel converter."""
        convert_to_pdf('/input/file.xls', '/output')
        mock_excel.convert_excel_to_pdf.assert_called_with('/input/file.xls', '/output')

    def test_unsupported_type_raises(self):
        """Verify unsupported file types raise ValueError."""
        with pytest.raises(ValueError, match='Unsupported file type'):
            convert_to_pdf('/input/file.txt', '/output')

    def test_unsupported_pdf_raises(self):
        """Verify PDF files raise ValueError (converter only handles Office)."""
        with pytest.raises(ValueError, match='Unsupported file type'):
            convert_to_pdf('/input/file.pdf', '/output')

    def test_returns_pdf_path(self):
        """Verify the return value is the PDF path from the sub-converter."""
        result = convert_to_pdf('/input/file.docx', '/output')
        assert result == '/out/file.pdf'


class TestIsOfficeFile:
    """Tests for is_office_file() function."""

    def test_word_is_office(self):
        """Verify Word files are recognized as Office files."""
        assert is_office_file('test.docx') is True
        assert is_office_file('test.doc') is True
        assert is_office_file('test.docm') is True

    def test_excel_is_office(self):
        """Verify Excel files are recognized as Office files."""
        assert is_office_file('test.xlsx') is True
        assert is_office_file('test.xls') is True
        assert is_office_file('test.xlsm') is True

    def test_powerpoint_is_office(self):
        """Verify PowerPoint files are recognized as Office files."""
        assert is_office_file('test.pptx') is True
        assert is_office_file('test.ppt') is True
        assert is_office_file('test.pptm') is True

    def test_pdf_is_not_office(self):
        """Verify PDF files are not recognized as Office files."""
        assert is_office_file('test.pdf') is False

    def test_unknown_is_not_office(self):
        """Verify unknown files are not recognized as Office files."""
        assert is_office_file('test.txt') is False
        assert is_office_file('test.jpg') is False

    def test_no_extension(self):
        """Verify files without extensions are not Office files."""
        assert is_office_file('noextension') is False


class TestIsPdfFile:
    """Tests for is_pdf_file() function."""

    def test_pdf_is_pdf(self):
        """Verify .pdf files are recognized."""
        assert is_pdf_file('test.pdf') is True

    def test_non_pdf_is_not_pdf(self):
        """Verify non-PDF files are not recognized."""
        assert is_pdf_file('test.docx') is False
        assert is_pdf_file('test.xlsx') is False

    def test_case_insensitive(self):
        """Verify case-insensitive matching."""
        assert is_pdf_file('test.PDF') is True
        assert is_pdf_file('test.Pdf') is True

    def test_no_extension(self):
        """Verify files without extensions are not PDFs."""
        assert is_pdf_file('noextension') is False

    def test_multiple_dots(self):
        """Verify only last extension is checked."""
        assert is_pdf_file('archive.backup.pdf') is True
        assert is_pdf_file('file.pdf.docx') is False
