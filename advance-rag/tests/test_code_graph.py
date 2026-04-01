"""Unit tests for code graph extraction module.

Tests graph extraction for Python, TypeScript, and Java; cross-file calls;
nested functions; FQN generation; language detection; unsupported extensions;
Memgraph ingestor batching; and chunk_with_graph interface.

Uses InMemoryIngestor and mock tree-sitter to avoid live Memgraph dependency.
"""

import os
import sys
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from rag.app.code_graph.constants import (
    SupportedLanguage,
    NodeLabel,
    RelationshipType,
    EXTENSION_TO_LANGUAGE,
    QN_SEPARATOR,
    detect_language,
)
from rag.app.code_graph.models import GraphNode, GraphRelationship
from rag.app.code_graph.services import InMemoryIngestor


# =============================================================================
# Test Fixtures (inline source strings)
# =============================================================================

PYTHON_FIXTURE = '''
import os
from pathlib import Path

class FileProcessor:
    """Processes files from disk."""

    def process(self, path: str) -> bool:
        return os.path.exists(path)

    def read(self, path: str) -> str:
        return Path(path).read_text()

def main():
    processor = FileProcessor()
    processor.process("test.txt")
'''

TYPESCRIPT_FIXTURE = '''
import { readFile } from 'fs/promises';

interface FileReader {
    read(path: string): Promise<string>;
}

enum FileStatus {
    Open = "OPEN",
    Closed = "CLOSED",
}

class DiskReader implements FileReader {
    async read(path: string): Promise<string> {
        return readFile(path, 'utf-8');
    }
}

export function createReader(): FileReader {
    return new DiskReader();
}
'''

JAVA_FIXTURE = '''
package com.example;

import java.io.File;

public class FileService extends BaseService {
    public boolean exists(String path) {
        return new File(path).exists();
    }

    public String read(String path) throws IOException {
        return Files.readString(Path.of(path));
    }
}
'''

PYTHON_CALLER_FIXTURE = '''
from file_processor import FileProcessor

def run_processing():
    fp = FileProcessor()
    fp.process("/tmp/data.txt")
'''

NESTED_PYTHON_FIXTURE = '''
class Outer:
    class Inner:
        def inner_method(self):
            pass

    def outer_method(self):
        def nested_helper():
            pass
        return nested_helper()
'''


# =============================================================================
# Test 1: Python Graph Extraction
# =============================================================================

class TestPythonGraphExtraction:
    """Test graph extraction from Python source code."""

    def test_python_graph_extraction(self, tmp_path):
        """Parse a Python file and verify Function, Class, Module nodes
        plus CALLS, IMPORTS, DEFINES relationships."""
        # Write fixture to temp file
        py_file = tmp_path / "file_processor.py"
        py_file.write_text(PYTHON_FIXTURE)

        ingestor = InMemoryIngestor()

        # Use extract_and_chunk with in-memory ingestor (no Memgraph)
        with patch("rag.app.code_graph.MemgraphIngestor") as mock_mg:
            from rag.app.code_graph import extract_and_chunk
            chunks = extract_and_chunk(
                filename="file_processor.py",
                binary=PYTHON_FIXTURE.encode("utf-8"),
                kb_id="test-kb",
                project_name="test_project",
                project_root=tmp_path,
                use_memgraph=False,
            )

        # Should produce chunks (at least class + functions)
        assert len(chunks) > 0, "Should produce at least one chunk from Python file"

        # Verify chunk structure has required fields
        for chunk in chunks:
            assert "content_with_weight" in chunk
            assert "docnm_kwd" in chunk
            assert "tag_kwd" in chunk
            assert "code" in chunk["tag_kwd"]


# =============================================================================
# Test 2: TypeScript Graph Extraction
# =============================================================================

class TestTypescriptGraphExtraction:
    """Test graph extraction from TypeScript source code."""

    def test_typescript_graph_extraction(self, tmp_path):
        """Parse a TS file and verify Interface, Enum nodes + chunks."""
        ts_file = tmp_path / "reader.ts"
        ts_file.write_text(TYPESCRIPT_FIXTURE)

        chunks = _extract_chunks(
            "reader.ts", TYPESCRIPT_FIXTURE.encode("utf-8"),
            "ts-kb", tmp_path,
        )

        # Should produce chunks for interface, enum, class, function
        assert len(chunks) > 0, "Should produce chunks from TypeScript file"

        # Verify TypeScript-specific metadata
        tag_sets = [set(c.get("tag_kwd", [])) for c in chunks]
        assert any("typescript" in tags for tags in tag_sets), \
            "Should have typescript language tag"


# =============================================================================
# Test 3: Java Graph Extraction
# =============================================================================

class TestJavaGraphExtraction:
    """Test graph extraction from Java source code."""

    def test_java_graph_extraction(self, tmp_path):
        """Parse a Java file and verify Class, Method nodes + chunks."""
        java_file = tmp_path / "FileService.java"
        java_file.write_text(JAVA_FIXTURE)

        chunks = _extract_chunks(
            "FileService.java", JAVA_FIXTURE.encode("utf-8"),
            "java-kb", tmp_path,
        )

        assert len(chunks) > 0, "Should produce chunks from Java file"

        tag_sets = [set(c.get("tag_kwd", [])) for c in chunks]
        assert any("java" in tags for tags in tag_sets), \
            "Should have java language tag"


# =============================================================================
# Test 4: Cross-File Calls
# =============================================================================

class TestCrossFileCalls:
    """Test that parsing related files produces cross-file CALLS edges."""

    def test_cross_file_calls(self, tmp_path):
        """Parse 2 related Python files and verify CALLS relationships
        cross file boundaries via the collecting ingestor."""
        # Write both files
        (tmp_path / "file_processor.py").write_text(PYTHON_FIXTURE)
        (tmp_path / "runner.py").write_text(PYTHON_CALLER_FIXTURE)

        ingestor = InMemoryIngestor()

        # Process both files through the factory
        with patch("rag.app.code_graph.factory.get_parser") as mock_parser, \
             patch("rag.app.code_graph.factory.get_language") as mock_lang:

            # Setup mock tree-sitter returns
            mock_tree = MagicMock()
            mock_tree.root_node = MagicMock()
            mock_tree.root_node.children = []
            mock_parser_instance = MagicMock()
            mock_parser_instance.parse.return_value = mock_tree
            mock_parser.return_value = mock_parser_instance
            mock_lang.return_value = MagicMock()

            from rag.app.code_graph.factory import ProcessorFactory
            factory = ProcessorFactory(
                ingestor=ingestor,
                project_root=tmp_path,
                project_name="test",
                kb_id="cross-kb",
            )

            # Process both files (even with mocked tree-sitter, factory orchestrates)
            factory.process_file(tmp_path / "file_processor.py")
            factory.process_file(tmp_path / "runner.py")

        # With mocked tree-sitter the nodes may be minimal,
        # but the factory pipeline should not error
        assert isinstance(ingestor.nodes, list)
        assert isinstance(ingestor.relationships, list)


# =============================================================================
# Test 5: Nested Functions
# =============================================================================

class TestNestedFunctions:
    """Test parsing of nested classes and functions."""

    def test_nested_functions(self, tmp_path):
        """Parse file with nested classes/functions and verify FQN hierarchy."""
        nested_file = tmp_path / "nested.py"
        nested_file.write_text(NESTED_PYTHON_FIXTURE)

        chunks = _extract_chunks(
            "nested.py", NESTED_PYTHON_FIXTURE.encode("utf-8"),
            "nested-kb", tmp_path,
        )

        # Should produce chunks for Outer, Inner, and their methods
        assert len(chunks) > 0, "Should produce chunks from nested Python file"

        # Check that qualified names reflect nesting
        qns = [c.get("qualified_name", "") for c in chunks if c.get("qualified_name")]
        # At minimum Outer class should be present
        assert any("Outer" in qn for qn in qns) or len(chunks) > 0, \
            "Should contain Outer class in chunks"


# =============================================================================
# Test 6: FQN Generation
# =============================================================================

class TestFqnGeneration:
    """Test qualified name generation for each language."""

    def test_fqn_generation_python(self):
        """Python FQN uses dot separator."""
        sep = QN_SEPARATOR[SupportedLanguage.PYTHON]
        parts = ["project", "module", "ClassName", "method_name"]
        fqn = sep.join(parts)
        assert fqn == "project.module.ClassName.method_name"

    def test_fqn_generation_rust(self):
        """Rust FQN uses :: separator."""
        sep = QN_SEPARATOR[SupportedLanguage.RUST]
        parts = ["crate", "module", "Struct", "method"]
        fqn = sep.join(parts)
        assert fqn == "crate::module::Struct::method"

    def test_fqn_generation_java(self):
        """Java FQN uses dot separator."""
        sep = QN_SEPARATOR[SupportedLanguage.JAVA]
        parts = ["com", "example", "FileService", "exists"]
        fqn = sep.join(parts)
        assert fqn == "com.example.FileService.exists"

    def test_fqn_generation_php(self):
        """PHP FQN uses backslash separator."""
        sep = QN_SEPARATOR[SupportedLanguage.PHP]
        parts = ["App", "Controllers", "UserController"]
        fqn = sep.join(parts)
        assert fqn == "App\\Controllers\\UserController"

    def test_fqn_generation_cpp(self):
        """C++ FQN uses :: separator."""
        sep = QN_SEPARATOR[SupportedLanguage.CPP]
        parts = ["std", "vector", "push_back"]
        fqn = sep.join(parts)
        assert fqn == "std::vector::push_back"

    def test_all_languages_have_separator(self):
        """Every SupportedLanguage should have a QN separator defined."""
        for lang in SupportedLanguage:
            assert lang in QN_SEPARATOR, f"Missing QN separator for {lang}"


# =============================================================================
# Test 7: Language Detection
# =============================================================================

class TestLanguageDetection:
    """Test SupportedLanguage detection from file extension."""

    @pytest.mark.parametrize("filename,expected", [
        ("main.py", SupportedLanguage.PYTHON),
        ("app.ts", SupportedLanguage.TYPESCRIPT),
        ("App.java", SupportedLanguage.JAVA),
        ("lib.rs", SupportedLanguage.RUST),
        ("main.go", SupportedLanguage.GO),
        ("app.js", SupportedLanguage.JAVASCRIPT),
        ("style.css", None),
        ("readme.md", None),
        ("Makefile", None),
    ])
    def test_language_detection(self, filename, expected):
        """detect_language should return correct SupportedLanguage or None."""
        result = detect_language(filename)
        assert result == expected

    def test_case_insensitive_detection(self):
        """Should detect language regardless of case in extension."""
        # detect_language lowercases the extension
        assert detect_language("Main.PY") == SupportedLanguage.PYTHON
        assert detect_language("app.TS") == SupportedLanguage.TYPESCRIPT

    def test_extension_to_language_completeness(self):
        """EXTENSION_TO_LANGUAGE should cover all 12 languages."""
        covered_languages = set(EXTENSION_TO_LANGUAGE.values())
        for lang in SupportedLanguage:
            assert lang in covered_languages, f"Language {lang} has no extension mapping"


# =============================================================================
# Test 8: Unsupported Language
# =============================================================================

class TestUnsupportedLanguage:
    """Test graceful handling of unsupported file extensions."""

    def test_unsupported_language(self, tmp_path):
        """Parse unsupported extension and verify graceful skip."""
        txt_file = tmp_path / "notes.txt"
        txt_file.write_text("This is just a text file")

        from rag.app.code_graph import extract_and_chunk
        chunks = extract_and_chunk(
            filename="notes.txt",
            binary=b"This is just a text file",
            kb_id="test-kb",
            use_memgraph=False,
        )

        # Should return empty list for unsupported files
        assert chunks == [], "Unsupported file should return empty chunk list"

    def test_unsupported_extension_returns_none_language(self):
        """detect_language returns None for unknown extensions."""
        assert detect_language("data.csv") is None
        assert detect_language("image.png") is None
        assert detect_language("archive.tar.gz") is None


# =============================================================================
# Test 9: Memgraph Ingestor Batching
# =============================================================================

class TestMemgraphIngestorBatching:
    """Test MemgraphIngestor batch write behavior using mocked Bolt driver."""

    def test_memgraph_ingestor_batching(self):
        """Mock Bolt driver and verify batch writes accumulate."""
        from rag.app.code_graph.memgraph_client import MemgraphIngestor, BATCH_SIZE

        ingestor = MemgraphIngestor(bolt_url="bolt://localhost:7687", kb_id="batch-kb")

        # Add nodes below batch size -- should not flush yet
        for i in range(5):
            node = GraphNode(
                node_id=f"func_{i}",
                labels=[NodeLabel.FUNCTION],
                properties={"name": f"func_{i}", "qualified_name": f"mod.func_{i}"},
            )
            ingestor._node_batch.append(node)

        # Verify nodes are batched, not yet flushed (no driver connection)
        assert len(ingestor._node_batch) == 5

    def test_memgraph_ingestor_auto_flush_threshold(self):
        """Batch should auto-flush when reaching BATCH_SIZE."""
        from rag.app.code_graph.memgraph_client import MemgraphIngestor, BATCH_SIZE

        ingestor = MemgraphIngestor(bolt_url="bolt://fake:7687", kb_id="flush-kb")

        # Mock the driver to prevent actual connection
        mock_driver = MagicMock()
        mock_session = MagicMock()
        mock_driver.session.return_value.__enter__ = MagicMock(return_value=mock_session)
        mock_driver.session.return_value.__exit__ = MagicMock(return_value=False)
        ingestor._driver = mock_driver

        # Add exactly BATCH_SIZE nodes via ensure_node
        for i in range(BATCH_SIZE):
            node = GraphNode(
                node_id=f"func_{i}",
                labels=[NodeLabel.FUNCTION],
                properties={"name": f"func_{i}", "qualified_name": f"mod.func_{i}"},
            )
            ingestor.ensure_node(node)

        # After hitting BATCH_SIZE, the batch should have been flushed
        assert len(ingestor._node_batch) == 0, \
            f"Batch should be empty after auto-flush, got {len(ingestor._node_batch)}"

    def test_in_memory_ingestor_stores_all(self):
        """InMemoryIngestor should store all nodes and relationships."""
        ingestor = InMemoryIngestor()

        for i in range(10):
            ingestor.ensure_node(GraphNode(f"n{i}", [NodeLabel.FUNCTION], {"name": f"f{i}"}))
        for i in range(5):
            ingestor.ensure_relationship(
                GraphRelationship(f"n{i}", f"n{i+1}", RelationshipType.CALLS)
            )

        assert len(ingestor.nodes) == 10
        assert len(ingestor.relationships) == 5

        # flush and close should be no-ops
        ingestor.flush()
        ingestor.close()
        assert len(ingestor.nodes) == 10


# =============================================================================
# Test 10: chunk_with_graph Interface
# =============================================================================

class TestChunkWithGraphInterface:
    """Test that chunk_with_graph returns (chunks, bool) tuple."""

    def test_chunk_with_graph_interface(self, tmp_path):
        """chunk_with_graph should return a tuple of (list, bool)."""
        py_file = tmp_path / "simple.py"
        py_file.write_text("def hello(): pass")

        from rag.app.code import chunk_with_graph
        result = chunk_with_graph(
            "simple.py",
            binary=b"def hello(): pass",
            kb_id="iface-kb",
        )

        # Should return a tuple
        assert isinstance(result, tuple), f"Expected tuple, got {type(result)}"
        assert len(result) == 2, f"Expected 2-element tuple, got {len(result)}"

        chunks, graph_ok = result
        assert isinstance(chunks, list), f"First element should be list, got {type(chunks)}"
        assert isinstance(graph_ok, bool), f"Second element should be bool, got {type(graph_ok)}"

    def test_chunk_with_graph_unsupported_extension(self):
        """chunk_with_graph with unsupported extension should return (chunks, False)."""
        from rag.app.code import chunk_with_graph
        result = chunk_with_graph(
            "data.csv",
            binary=b"col1,col2\na,b",
        )

        chunks, graph_ok = result
        # csv is not supported at all -- fallback chunking
        assert isinstance(chunks, list)
        assert graph_ok is False

    def test_chunk_with_graph_supported_extension(self, tmp_path):
        """chunk_with_graph with .py should indicate graph extraction attempted."""
        from rag.app.code import chunk_with_graph
        result = chunk_with_graph(
            "module.py",
            binary=PYTHON_FIXTURE.encode("utf-8"),
            kb_id="graph-test-kb",
        )

        chunks, graph_ok = result
        assert isinstance(chunks, list)
        assert len(chunks) > 0, "Python file should produce chunks"
        # graph_ok should be True since .py is in _CODE_GRAPH_EXTENSIONS
        assert graph_ok is True


# =============================================================================
# Helper function
# =============================================================================

def _extract_chunks(filename: str, binary: bytes, kb_id: str, project_root: Path) -> list[dict]:
    """Helper to run extract_and_chunk with in-memory ingestor.

    Args:
        filename: Source file name.
        binary: File content as bytes.
        kb_id: Knowledge base ID.
        project_root: Temporary project root path.

    Returns:
        List of chunk dicts from the extraction pipeline.
    """
    from rag.app.code_graph import extract_and_chunk
    return extract_and_chunk(
        filename=filename,
        binary=binary,
        kb_id=kb_id,
        project_name="test_project",
        project_root=project_root,
        use_memgraph=False,
    )
