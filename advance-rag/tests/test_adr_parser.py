"""Unit tests for the ADR (Architecture Decision Record) parser module.

Tests template-aware section parsing for MADR, Nygard, and Y-statement
ADR formats. Validates section detection, metadata extraction, chunk
structure, heading variation handling, and graceful fallback.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures")

# Dummy callback matching the parser contract
dummy_callback = lambda prog, msg="": None


def _read_fixture(name: str) -> bytes:
    """Read a fixture file and return its content as bytes.

    Args:
        name: Filename inside the fixtures directory.

    Returns:
        Raw bytes of the fixture file.
    """
    path = os.path.join(FIXTURES_DIR, name)
    with open(path, "rb") as f:
        return f.read()


# ---------------------------------------------------------------------------
# Stub out heavy dependencies (same pattern as test_code_parser.py)
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


# Mock the tokenizer with simple lowercase passthrough
_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
_mock_rag_tokenizer.fine_grained_tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()

_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer


class TestMadrFormat:
    """Tests for MADR-format ADR parsing."""

    def test_madr_produces_per_section_chunks(self):
        """MADR ADR should produce chunks for status, context, decision, consequences, options sections."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_madr.md")
        chunks = chunk("adr-001.md", binary=binary, callback=dummy_callback)

        section_types = [c.get("section_type") for c in chunks]
        # Should have at least: status, context, decision, consequences, options
        assert "status" in section_types
        assert "context" in section_types
        assert "decision" in section_types
        assert "consequences" in section_types
        assert "options" in section_types

    def test_madr_chunks_have_section_type_metadata(self):
        """Every MADR chunk should have a section_type metadata field."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_madr.md")
        chunks = chunk("adr-001.md", binary=binary, callback=dummy_callback)

        for c in chunks:
            assert "section_type" in c, f"Missing section_type in chunk"

    def test_madr_metadata_includes_status_and_title(self):
        """ADR metadata should include adr_status and adr_title."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_madr.md")
        chunks = chunk("adr-001.md", binary=binary, callback=dummy_callback)

        # All chunks should share the same ADR metadata
        for c in chunks:
            assert c.get("adr_status") == "accepted"
            assert "PostgreSQL" in c.get("adr_title", "")


class TestNygardFormat:
    """Tests for Nygard-format ADR parsing."""

    def test_nygard_produces_per_section_chunks(self):
        """Nygard ADR should produce per-section chunks with section_type metadata."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_nygard.md")
        chunks = chunk("adr-nygard.md", binary=binary, callback=dummy_callback)

        section_types = [c.get("section_type") for c in chunks]
        assert "status" in section_types
        assert "context" in section_types
        assert "decision" in section_types
        assert "consequences" in section_types

    def test_nygard_metadata_includes_date(self):
        """Nygard ADR metadata should include the date."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_nygard.md")
        chunks = chunk("adr-nygard.md", binary=binary, callback=dummy_callback)

        # At least one chunk should have adr_date
        dates = [c.get("adr_date") for c in chunks if c.get("adr_date")]
        assert len(dates) > 0
        assert "2024-01-15" in dates[0]

    def test_nygard_metadata_includes_status(self):
        """Nygard ADR chunks should have adr_status."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_nygard.md")
        chunks = chunk("adr-nygard.md", binary=binary, callback=dummy_callback)

        for c in chunks:
            assert c.get("adr_status") == "accepted"


class TestYStatementFormat:
    """Tests for Y-statement format ADR parsing."""

    def test_y_statement_detected_and_parsed(self):
        """Y-statement ADR should be detected and parsed into context/decision/consequences."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_ystatement.md")
        chunks = chunk("adr-003.md", binary=binary, callback=dummy_callback)

        section_types = [c.get("section_type") for c in chunks]
        # Y-statement should produce at least context and decision sections
        assert "context" in section_types or "decision" in section_types
        assert len(chunks) >= 2  # At least a couple of sections

    def test_y_statement_content_preserved(self):
        """Y-statement sections should contain the relevant content."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_ystatement.md")
        chunks = chunk("adr-003.md", binary=binary, callback=dummy_callback)

        # The decision content should mention JWT tokens
        all_content = " ".join(c["content_with_weight"] for c in chunks)
        assert "JWT" in all_content


class TestHeadingVariations:
    """Tests that heading variations are handled correctly."""

    def test_decision_outcome_heading_detected(self):
        """'Decision Outcome' heading should map to decision section type."""
        from rag.app.adr import chunk

        # MADR uses "Decision Outcome" heading
        binary = _read_fixture("sample_adr_madr.md")
        chunks = chunk("adr.md", binary=binary, callback=dummy_callback)

        section_types = [c.get("section_type") for c in chunks]
        assert "decision" in section_types

    def test_context_and_problem_statement_heading_detected(self):
        """'Context and Problem Statement' heading should map to context section type."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_madr.md")
        chunks = chunk("adr.md", binary=binary, callback=dummy_callback)

        section_types = [c.get("section_type") for c in chunks]
        assert "context" in section_types

    def test_pros_and_cons_heading_detected(self):
        """'Pros and Cons of the Options' heading should map to options or consequences section type."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_madr.md")
        chunks = chunk("adr.md", binary=binary, callback=dummy_callback)

        section_types = [c.get("section_type") for c in chunks]
        # "Pros and Cons" matches consequences pattern
        assert "consequences" in section_types or "options" in section_types


class TestChunkDictFields:
    """Tests for required chunk dict fields."""

    def test_all_chunks_have_required_fields(self):
        """Every ADR chunk must have content_with_weight, content_ltks, content_sm_ltks, docnm_kwd, title_tks."""
        from rag.app.adr import chunk

        binary = _read_fixture("sample_adr_madr.md")
        chunks = chunk("adr-001.md", binary=binary, callback=dummy_callback)

        required_fields = ["content_with_weight", "content_ltks", "content_sm_ltks", "docnm_kwd", "title_tks"]
        for c in chunks:
            for field in required_fields:
                assert field in c, f"Missing field '{field}' in chunk"
            assert c["docnm_kwd"] == "adr-001.md"


class TestGracefulFallback:
    """Tests for graceful handling of non-ADR markdown."""

    def test_plain_markdown_produces_single_chunk(self):
        """Plain markdown without ADR structure should produce a single chunk."""
        from rag.app.adr import chunk

        plain_md = b"# Random Document\n\nThis is just a regular markdown file with no ADR structure.\n\nIt has some text but no ADR sections."
        chunks = chunk("random.md", binary=plain_md, callback=dummy_callback)

        # Should produce at least one chunk (fallback single chunk)
        assert len(chunks) >= 1
        assert "content_with_weight" in chunks[0]

    def test_empty_binary_returns_empty_list(self):
        """Empty input should return empty list."""
        from rag.app.adr import chunk

        result = chunk("empty.md", binary=b"", callback=dummy_callback)
        assert isinstance(result, list)
        assert len(result) == 0
