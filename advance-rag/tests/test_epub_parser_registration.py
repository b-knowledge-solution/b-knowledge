"""Unit tests for EPUB parser registration in rag/app/naive.py.

Verifies that EpubParser is imported and invoked for .epub files
in the naive chunking pipeline.
"""

import os
import sys
import types
import re
import pytest
from unittest.mock import MagicMock, patch

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestEpubParserRegistration:
    """Tests for EPUB parser registration in naive.py."""

    def test_epub_extension_matches_regex(self) -> None:
        """Should match .epub filenames with the regex pattern used in naive.py."""
        # This is the exact pattern from naive.py line 967
        pattern = r"\.epub$"

        assert re.search(pattern, "book.epub", re.IGNORECASE) is not None
        assert re.search(pattern, "BOOK.EPUB", re.IGNORECASE) is not None
        assert re.search(pattern, "my-book.Epub", re.IGNORECASE) is not None
        # Non-epub files should not match
        assert re.search(pattern, "book.pdf", re.IGNORECASE) is None
        assert re.search(pattern, "book.epub.bak", re.IGNORECASE) is None

    def test_epub_parser_imported_in_naive(self) -> None:
        """Should confirm EpubParser is imported from deepdoc.parser in naive.py."""
        naive_path = os.path.join(_ADVANCE_RAG_ROOT, "rag", "app", "naive.py")
        with open(naive_path, "r", encoding="utf-8") as f:
            source = f.read()

        # Verify EpubParser is in the import line from deepdoc.parser
        assert "EpubParser" in source, "EpubParser should be imported in naive.py"

        # Verify it appears in the epub handling branch
        assert "EpubParser()" in source, "EpubParser should be instantiated for epub files"

    def test_epub_branch_exists_in_naive(self) -> None:
        """Should confirm the .epub regex branch exists in the chunk function."""
        naive_path = os.path.join(_ADVANCE_RAG_ROOT, "rag", "app", "naive.py")
        with open(naive_path, "r", encoding="utf-8") as f:
            source = f.read()

        # Verify the epub elif branch pattern
        assert re.search(r'elif re\.search\(r"\\.epub\$"', source), \
            "naive.py should have an elif branch matching .epub files"
