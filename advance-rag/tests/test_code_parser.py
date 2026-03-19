"""Unit tests for the code-aware parser module.

Tests AST-based chunking for Python, TypeScript, and Java files using
tree-sitter. Validates chunk structure, metadata extraction, import
handling, large function splitting, and fallback behavior.
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
# Stub out heavy dependencies that code.py's rag_tokenizer import chain needs.
# We create lightweight mock modules ONLY for packages not installed in the
# test environment, then set rag.nlp.rag_tokenizer to a mock tokenizer.
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Args:
        name: Dotted module path to mock (e.g., 'common.settings').
    """
    if name not in sys.modules:
        try:
            __import__(name)
        except (ImportError, ModuleNotFoundError):
            mod = types.ModuleType(name)
            sys.modules[name] = mod
            # Ensure parent packages exist
            parts = name.split(".")
            for i in range(1, len(parts)):
                parent = ".".join(parts[:i])
                if parent not in sys.modules:
                    sys.modules[parent] = types.ModuleType(parent)


# Mock the tokenizer with simple lowercase passthrough
_mock_rag_tokenizer = MagicMock()
_mock_rag_tokenizer.tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()
_mock_rag_tokenizer.fine_grained_tokenize = lambda text: text.lower() if isinstance(text, str) else str(text).lower()

# Pre-register modules that may have heavy deps not installed in test env
_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")

# Ensure rag.nlp exists and wire up the mock tokenizer
_ensure_mock_module("rag.nlp")
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer


class TestPythonChunking:
    """Tests for Python file chunking via tree-sitter AST."""

    def test_produces_chunks_with_function_name_metadata(self):
        """Each function in the Python file should produce a chunk with function_name."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.py")
        chunks = chunk("sample_code.py", binary=binary, callback=dummy_callback)

        # Extract function names from chunk metadata
        func_names = [c.get("function_name") for c in chunks if c.get("function_name")]
        assert "calculate_discount" in func_names
        assert "process_large_dataset" in func_names

    def test_imports_stored_as_file_level_metadata(self):
        """Imports should be stored as file-level metadata, not duplicated per chunk."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.py")
        chunks = chunk("sample_code.py", binary=binary, callback=dummy_callback)

        # Find the file-level/imports chunk
        import_chunks = [c for c in chunks if c.get("imports")]
        assert len(import_chunks) >= 1, "Should have at least one chunk with import metadata"

        # Imports should contain the import statements
        import_text = import_chunks[0]["imports"]
        assert "import os" in import_text
        assert "from typing import" in import_text

        # Non-import chunks should NOT have imports duplicated in content
        non_import_chunks = [c for c in chunks if c.get("function_name") and not c.get("imports")]
        for c in non_import_chunks:
            assert "import os" not in c.get("content_with_weight", "")

    def test_class_methods_have_class_name_metadata(self):
        """Methods inside a class should have class_name populated."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.py")
        chunks = chunk("sample_code.py", binary=binary, callback=dummy_callback)

        # Find chunks from OrderProcessor class
        class_chunks = [c for c in chunks if c.get("class_name") == "OrderProcessor"]
        assert len(class_chunks) >= 2, "OrderProcessor has at least 2 methods"

        method_names = [c.get("function_name") for c in class_chunks]
        assert "validate_order" in method_names
        assert "calculate_shipping" in method_names

    def test_decorators_included_in_metadata(self):
        """Decorators/annotations should be included in chunk metadata."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.py")
        chunks = chunk("sample_code.py", binary=binary, callback=dummy_callback)

        # Find the calculate_shipping method which has @staticmethod
        shipping_chunks = [c for c in chunks if c.get("function_name") == "calculate_shipping"]
        assert len(shipping_chunks) == 1
        assert "staticmethod" in (shipping_chunks[0].get("decorators", "") or "")

    def test_required_chunk_fields_present(self):
        """Every chunk must have required fields: content_with_weight, content_ltks, etc."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.py")
        chunks = chunk("sample_code.py", binary=binary, callback=dummy_callback)

        required_fields = ["content_with_weight", "content_ltks", "content_sm_ltks",
                           "docnm_kwd", "title_tks"]

        # Verify every chunk has all required fields
        for i, c in enumerate(chunks):
            for field in required_fields:
                assert field in c, f"Chunk {i} missing required field '{field}'"
                assert c[field] is not None, f"Chunk {i} field '{field}' is None"

    def test_large_function_split_at_inner_blocks(self):
        """A large function exceeding token limit should be split at inner block boundaries."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.py")
        # Use a small token limit to force splitting of process_large_dataset
        chunks = chunk(
            "sample_code.py",
            binary=binary,
            callback=dummy_callback,
            parser_config={"chunk_token_num": 128},
        )

        # Find chunks from the large function
        large_fn_chunks = [c for c in chunks if c.get("function_name") == "process_large_dataset"]
        assert len(large_fn_chunks) > 1, (
            "process_large_dataset should be split into multiple chunks with small token limit"
        )

        # Each sub-chunk should contain the parent signature as prefix context
        for c in large_fn_chunks:
            assert "process_large_dataset" in c["content_with_weight"]

    def test_docstrings_included_inline(self):
        """Comments and docstrings should be included inline in chunk content."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.py")
        chunks = chunk("sample_code.py", binary=binary, callback=dummy_callback)

        # The calculate_discount function has a docstring
        discount_chunks = [c for c in chunks if c.get("function_name") == "calculate_discount"]
        assert len(discount_chunks) == 1
        content = discount_chunks[0]["content_with_weight"]
        assert "Calculate the discount" in content


class TestTypeScriptChunking:
    """Tests for TypeScript file chunking via tree-sitter AST."""

    def test_produces_chunks_with_function_boundaries(self):
        """TypeScript file should produce chunks at function/class boundaries."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.ts")
        chunks = chunk("sample_code.ts", binary=binary, callback=dummy_callback)

        # Should have chunks for fetchUserData, formatDate, DocumentService methods
        func_names = [c.get("function_name") for c in chunks if c.get("function_name")]
        assert "fetchUserData" in func_names
        # Arrow functions may be captured by variable name
        class_names = [c.get("class_name") for c in chunks if c.get("class_name")]
        assert "DocumentService" in class_names

    def test_required_fields_present_typescript(self):
        """Every TypeScript chunk must have required fields."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.ts")
        chunks = chunk("sample_code.ts", binary=binary, callback=dummy_callback)

        required_fields = ["content_with_weight", "content_ltks", "content_sm_ltks",
                           "docnm_kwd", "title_tks"]
        for i, c in enumerate(chunks):
            for field in required_fields:
                assert field in c, f"Chunk {i} missing required field '{field}'"


class TestUnsupportedExtensionFallback:
    """Tests for fallback behavior on unsupported file extensions."""

    def test_unsupported_extension_falls_back_to_naive(self):
        """An unsupported extension (e.g., .xyz) should fall back to naive text chunking."""
        from rag.app.code import chunk

        content = b"This is some content\nspread across multiple lines\nfor testing."
        chunks = chunk("data.xyz", binary=content, callback=dummy_callback)

        # Should produce at least one chunk with the text content
        assert len(chunks) >= 1
        assert chunks[0]["content_with_weight"]
        assert chunks[0]["docnm_kwd"] == "data.xyz"

    def test_unsupported_extension_has_required_fields(self):
        """Fallback chunks should still have all required fields."""
        from rag.app.code import chunk

        content = b"Some content for testing fallback.\nAnother line."
        chunks = chunk("data.xyz", binary=content, callback=dummy_callback)

        required_fields = ["content_with_weight", "content_ltks", "content_sm_ltks",
                           "docnm_kwd", "title_tks"]
        for c in chunks:
            for field in required_fields:
                assert field in c, f"Fallback chunk missing required field '{field}'"


class TestJavaChunking:
    """Tests for Java file chunking via tree-sitter AST."""

    def test_java_class_methods_have_metadata(self):
        """Java methods should produce chunks with class_name and function_name."""
        from rag.app.code import chunk

        binary = _read_fixture("sample_code.java")
        chunks = chunk("sample_code.java", binary=binary, callback=dummy_callback)

        # Should find InventoryService class methods
        func_names = [c.get("function_name") for c in chunks if c.get("function_name")]
        assert "findBySku" in func_names or "restock" in func_names

        class_chunks = [c for c in chunks if c.get("class_name") == "InventoryService"]
        assert len(class_chunks) >= 1
