"""Unit tests for the code_graph import processor, structure processor,
and ProcessorFactory pipeline.

Tests initialization, language dispatch, import mapping construction,
and factory orchestration without requiring tree-sitter (uses mocks).
"""

import os
import sys
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from rag.app.code_graph.constants import SupportedLanguage, NodeLabel, RelationshipType
from rag.app.code_graph.models import GraphNode, GraphRelationship
from rag.app.code_graph.import_processor import ImportProcessor
from rag.app.code_graph.structure_processor import StructureProcessor


# =============================================================================
# Helper: mock ingestor matching IngestorProtocol (ensure_node/ensure_relationship)
# =============================================================================

def make_mock_ingestor():
    """Create a mock IngestorProtocol that records all ensure_node/ensure_relationship calls."""
    ingestor = MagicMock()
    ingestor.nodes = []
    ingestor.rels = []

    def _ensure_node(node):
        ingestor.nodes.append(node)
    def _ensure_relationship(rel):
        ingestor.rels.append(rel)

    ingestor.ensure_node = MagicMock(side_effect=_ensure_node)
    ingestor.ensure_relationship = MagicMock(side_effect=_ensure_relationship)
    ingestor.flush = MagicMock()
    ingestor.close = MagicMock()
    return ingestor


# =============================================================================
# ImportProcessor Tests
# =============================================================================

class TestImportProcessorInit:
    """Tests for ImportProcessor initialization."""

    def test_construction(self, tmp_path):
        """Should construct with required parameters."""
        ingestor = make_mock_ingestor()
        proc = ImportProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test_project",
            kb_id="kb-123",
        )
        assert proc.project_root == tmp_path
        assert proc.project_name == "test_project"
        assert proc.kb_id == "kb-123"
        assert proc.import_mapping == {}

    def test_language_dispatch_covers_all_languages(self, tmp_path):
        """parse_imports should handle all 12 languages without error."""
        ingestor = make_mock_ingestor()
        proc = ImportProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test",
        )
        mock_tree = MagicMock()
        mock_tree.children = []

        for lang in SupportedLanguage:
            result = proc.parse_imports(
                filepath=tmp_path / "test.py",
                tree_root=mock_tree,
                language=lang,
                module_qn="test.module",
            )
            assert isinstance(result, dict)


class TestImportProcessorMapping:
    """Tests for import mapping behavior."""

    def test_empty_tree_returns_empty_mapping(self, tmp_path):
        """An empty AST should produce an empty import mapping."""
        ingestor = make_mock_ingestor()
        proc = ImportProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test",
        )
        mock_tree = MagicMock()
        mock_tree.children = []

        result = proc.parse_imports(
            filepath=tmp_path / "empty.py",
            tree_root=mock_tree,
            language=SupportedLanguage.PYTHON,
            module_qn="test.empty",
        )
        assert result == {}

    def test_import_mapping_stored_by_filepath(self, tmp_path):
        """Import mapping should be stored keyed by filepath."""
        ingestor = make_mock_ingestor()
        proc = ImportProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test",
        )
        mock_tree = MagicMock()
        mock_tree.children = []

        filepath = tmp_path / "module.py"
        proc.parse_imports(filepath, mock_tree, SupportedLanguage.PYTHON, "test.module")

        assert str(filepath) in proc.import_mapping


# =============================================================================
# StructureProcessor Tests
# =============================================================================

class TestStructureProcessor:
    """Tests for StructureProcessor directory scanning."""

    def test_scan_empty_directory(self, tmp_path):
        """Scanning an empty directory should still create a Project node."""
        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="empty_project",
            kb_id="kb-001",
        )
        proc.identify_structure()
        ingestor.ensure_node.assert_called()
        # At minimum should have a Project node
        project_nodes = [n for n in ingestor.nodes if NodeLabel.PROJECT in n.labels]
        assert len(project_nodes) >= 1

    def test_scan_with_python_files(self, tmp_path):
        """Should create Module nodes for .py files in the directory."""
        (tmp_path / "main.py").write_text("print('hello')")
        (tmp_path / "utils.py").write_text("x = 1")
        (tmp_path / "readme.md").write_text("# Docs")  # Should be skipped

        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test_project",
            kb_id="kb-002",
        )
        proc.identify_structure()

        # Should have Module nodes for .py files
        module_nodes = [n for n in ingestor.nodes if NodeLabel.MODULE in n.labels]
        names = [n.properties.get("name", "") for n in module_nodes]
        assert "main" in names
        assert "utils" in names

    def test_scan_with_subdirectory(self, tmp_path):
        """Should create Folder nodes for subdirectories with supported files."""
        sub = tmp_path / "src"
        sub.mkdir()
        (sub / "app.py").write_text("pass")

        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="nested_project",
            kb_id="kb-003",
        )
        proc.identify_structure()

        # Should have Folder node for src/
        folder_nodes = [n for n in ingestor.nodes if NodeLabel.FOLDER in n.labels]
        assert len(folder_nodes) >= 1

    def test_scan_detects_python_package(self, tmp_path):
        """Directory with __init__.py should be detected as a Package."""
        pkg = tmp_path / "mypackage"
        pkg.mkdir()
        (pkg / "__init__.py").write_text("")
        (pkg / "core.py").write_text("pass")

        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="pkg_project",
            kb_id="kb-004",
        )
        proc.identify_structure()

        # Should have a Package node
        package_nodes = [n for n in ingestor.nodes if NodeLabel.PACKAGE in n.labels]
        assert len(package_nodes) >= 1

    def test_scan_creates_contains_relationships(self, tmp_path):
        """Project should have CONTAINS relationships to its children."""
        (tmp_path / "file.py").write_text("pass")

        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="rel_project",
            kb_id="kb-005",
        )
        proc.identify_structure()

        rel_types = [r.rel_type for r in ingestor.rels]
        assert any(t in rel_types for t in [
            RelationshipType.CONTAINS,
            RelationshipType.CONTAINS_MODULE,
            RelationshipType.CONTAINS_PACKAGE,
        ])

    def test_kb_id_injected_into_nodes(self, tmp_path):
        """Every node should have kb_id in its properties."""
        (tmp_path / "test.py").write_text("pass")

        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test",
            kb_id="test-kb-id",
        )
        proc.identify_structure()

        for node in ingestor.nodes:
            assert node.properties.get("kb_id") == "test-kb-id", \
                f"Node {node.node_id} missing kb_id"

    def test_readme_md_not_included(self, tmp_path):
        """Non-code files (.md) should not be in the graph."""
        (tmp_path / "readme.md").write_text("# Hello")
        (tmp_path / "main.py").write_text("pass")

        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test",
            kb_id="kb-006",
        )
        proc.identify_structure()

        all_names = [n.properties.get("name", "") for n in ingestor.nodes]
        assert "readme" not in all_names

    def test_hidden_directories_skipped(self, tmp_path):
        """Directories starting with . should be skipped."""
        hidden = tmp_path / ".git"
        hidden.mkdir()
        (hidden / "config.py").write_text("pass")
        (tmp_path / "main.py").write_text("pass")

        ingestor = make_mock_ingestor()
        proc = StructureProcessor(
            ingestor=ingestor,
            project_root=tmp_path,
            project_name="test",
            kb_id="kb-007",
        )
        proc.identify_structure()

        paths = [str(n.properties.get("path", "")) for n in ingestor.nodes]
        assert not any(".git" in p for p in paths)


# =============================================================================
# ProcessorFactory Tests (mock tree-sitter)
# =============================================================================

class TestProcessorFactory:
    """Tests for ProcessorFactory — mocks tree-sitter to avoid dependency."""

    def test_construction(self, tmp_path):
        """Should construct with project root and kb_id."""
        ingestor = make_mock_ingestor()

        # Mock tree-sitter import at factory level
        with patch("rag.app.code_graph.factory.get_parser"), \
             patch("rag.app.code_graph.factory.get_language"):
            from rag.app.code_graph.factory import ProcessorFactory
            factory = ProcessorFactory(
                ingestor=ingestor,
                project_root=tmp_path,
                project_name="factory_test",
                kb_id="kb-f01",
            )
            assert factory.project_root == tmp_path
            assert factory.kb_id == "kb-f01"

    def test_lazy_processor_creation(self, tmp_path):
        """Processors should be lazily created on first access."""
        ingestor = make_mock_ingestor()

        with patch("rag.app.code_graph.factory.get_parser"), \
             patch("rag.app.code_graph.factory.get_language"):
            from rag.app.code_graph.factory import ProcessorFactory
            factory = ProcessorFactory(
                ingestor=ingestor,
                project_root=tmp_path,
                project_name="lazy_test",
                kb_id="kb-f02",
            )
            # Internal state should be None before access
            assert factory._structure is None
            assert factory._import is None
            assert factory._definition is None
            assert factory._call is None

            # Access should create them
            _ = factory.structure_processor
            assert factory._structure is not None
            _ = factory.import_processor
            assert factory._import is not None

    def test_process_file_returns_false_for_unsupported(self, tmp_path):
        """Processing an unsupported file type should return False."""
        ingestor = make_mock_ingestor()

        with patch("rag.app.code_graph.factory.get_parser"), \
             patch("rag.app.code_graph.factory.get_language"):
            from rag.app.code_graph.factory import ProcessorFactory
            factory = ProcessorFactory(
                ingestor=ingestor,
                project_root=tmp_path,
                project_name="test",
                kb_id="kb-f03",
            )
            # .txt is unsupported
            result = factory.process_file(tmp_path / "readme.txt")
            assert result is False
