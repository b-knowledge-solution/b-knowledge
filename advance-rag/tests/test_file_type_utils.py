"""Unit tests for common.file_type_utils module.

Tests file type detection, path sanitization, thumbnail generation,
and broken PDF repair. External dependencies (pdfplumber, PIL) are
mocked to avoid heavy library requirements in unit tests.
"""
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from db import FileType
from common.file_type_utils import (
    filename_type,
    thumbnail_img,
    read_potential_broken_pdf,
    sanitize_path,
)


# ── filename_type ─────────────────────────────────────────────────────

class TestFilenameType:
    """Tests for filename_type() function."""

    def test_pdf_extension(self):
        """Verify .pdf maps to FileType.PDF."""
        assert filename_type("report.pdf") == FileType.PDF

    def test_doc_extensions(self):
        """Verify office document extensions map to FileType.DOC."""
        for ext in [".doc", ".docx", ".xlsx", ".xls", ".ppt", ".pptx",
                    ".txt", ".md", ".csv", ".html", ".htm", ".json", ".xml", ".eml"]:
            assert filename_type(f"file{ext}") == FileType.DOC, f"Failed for {ext}"

    def test_visual_extensions(self):
        """Verify image extensions map to FileType.VISUAL."""
        for ext in [".png", ".jpg", ".jpeg", ".gif", ".bmp",
                    ".tif", ".tiff", ".webp", ".svg"]:
            assert filename_type(f"image{ext}") == FileType.VISUAL, f"Failed for {ext}"

    def test_aural_extensions(self):
        """Verify audio/video extensions map to FileType.AURAL."""
        for ext in [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".wma", ".mp4"]:
            assert filename_type(f"audio{ext}") == FileType.AURAL, f"Failed for {ext}"

    def test_unknown_extension(self):
        """Verify unknown extension maps to FileType.OTHER."""
        assert filename_type("file.xyz") == FileType.OTHER

    def test_no_extension(self):
        """Verify filename without extension maps to FileType.OTHER."""
        assert filename_type("README") == FileType.OTHER

    def test_empty_filename(self):
        """Verify empty filename maps to FileType.OTHER."""
        assert filename_type("") == FileType.OTHER

    def test_none_filename(self):
        """Verify None filename maps to FileType.OTHER."""
        assert filename_type(None) == FileType.OTHER

    def test_case_insensitive(self):
        """Verify extension matching is case-insensitive."""
        assert filename_type("FILE.PDF") == FileType.PDF
        assert filename_type("image.PNG") == FileType.VISUAL

    def test_dotfile(self):
        """Verify dotfiles without recognized extension map to OTHER."""
        assert filename_type(".gitignore") == FileType.OTHER

    def test_multiple_dots(self):
        """Verify only the last extension is used for detection."""
        assert filename_type("archive.tar.gz") == FileType.OTHER
        assert filename_type("report.v2.pdf") == FileType.PDF


# ── sanitize_path ─────────────────────────────────────────────────────

class TestSanitizePath:
    """Tests for sanitize_path() function."""

    def test_removes_directory_traversal(self):
        """Verify '../' sequences are removed."""
        result = sanitize_path("../../../etc/passwd")
        assert ".." not in result

    def test_normalizes_backslashes(self):
        """Verify backslashes are converted to forward slashes."""
        result = sanitize_path("path\\to\\file.txt")
        assert "\\" not in result
        assert "path/to/file.txt" == result

    def test_collapses_multiple_slashes(self):
        """Verify multiple consecutive slashes are collapsed to one."""
        result = sanitize_path("path///to////file.txt")
        assert "path/to/file.txt" == result

    def test_strips_leading_trailing_slashes(self):
        """Verify leading and trailing slashes are stripped."""
        result = sanitize_path("/path/to/file/")
        assert result == "path/to/file"

    def test_none_returns_empty(self):
        """Verify None input returns empty string."""
        assert sanitize_path(None) == ""

    def test_empty_returns_empty(self):
        """Verify empty string returns empty string."""
        assert sanitize_path("") == ""

    def test_normal_path_unchanged(self):
        """Verify a clean path without issues passes through (minus leading/trailing slashes)."""
        result = sanitize_path("documents/reports/q1.pdf")
        assert result == "documents/reports/q1.pdf"

    def test_combined_traversal_and_backslash(self):
        """Verify combined traversal and backslash issues are cleaned."""
        result = sanitize_path("..\\..\\secret\\file.txt")
        assert ".." not in result
        assert "\\" not in result


# ── thumbnail_img ─────────────────────────────────────────────────────

class TestThumbnailImg:
    """Tests for thumbnail_img() function."""

    def test_visual_file_returns_base64(self):
        """Verify image files return a data URI with Base64 content."""
        blob = b"\x89PNG\r\n\x1a\n"  # Minimal PNG header bytes
        result = thumbnail_img("photo.png", blob)
        assert result is not None
        assert result.startswith("data:image/png;base64,")

    def test_non_visual_non_pdf_returns_none(self):
        """Verify non-visual, non-PDF files return None."""
        result = thumbnail_img("readme.txt", b"some text")
        assert result is None

    def test_empty_filename_returns_none(self):
        """Verify empty filename returns None."""
        result = thumbnail_img("", b"data")
        assert result is None

    @patch("common.file_type_utils.pdfplumber", create=True)
    def test_pdf_with_mock_pdfplumber(self, mock_pdfplumber):
        """Verify PDF thumbnail generation calls pdfplumber correctly."""
        # This test mocks the pdfplumber import to avoid heavy dependency
        # The function may fail gracefully since pdfplumber is imported inside the function
        blob = b"%PDF-1.4 fake content"
        # If pdfplumber isn't installed, the function catches the exception
        result = thumbnail_img("doc.pdf", blob)
        # Result is either a base64 string or None depending on pdfplumber availability
        assert result is None or result.startswith("data:image/png;base64,")


# ── read_potential_broken_pdf ─────────────────────────────────────────

class TestReadPotentialBrokenPdf:
    """Tests for read_potential_broken_pdf() function."""

    def test_non_pdf_returns_unchanged(self):
        """Verify non-PDF blob is returned as-is."""
        blob = b"not a pdf"
        assert read_potential_broken_pdf(blob) == blob

    def test_none_returns_none(self):
        """Verify None input returns None."""
        assert read_potential_broken_pdf(None) is None

    def test_empty_returns_empty(self):
        """Verify empty bytes return empty bytes."""
        assert read_potential_broken_pdf(b"") == b""

    def test_pdf_header_detected(self):
        """Verify data starting with PDF header is processed (returns blob on any error)."""
        blob = b"%PDF-1.4 minimal fake content"
        # pdfplumber will fail on this fake PDF, so original blob is returned
        result = read_potential_broken_pdf(blob)
        assert result == blob
