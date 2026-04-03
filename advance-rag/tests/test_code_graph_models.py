"""Unit tests for the code_graph models module.

Tests GraphNode, GraphRelationship, FQNSpec, and LanguageSpec dataclass
construction and field behavior.
"""

import os
import sys
import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from rag.app.code_graph.models import (
    GraphNode,
    GraphRelationship,
    FQNSpec,
    LanguageSpec,
)
from rag.app.code_graph.constants import (
    NodeLabel,
    RelationshipType,
    SupportedLanguage,
)


class TestGraphNode:
    """Tests for GraphNode dataclass."""

    def test_minimal_construction(self):
        """Should construct with required fields only."""
        node = GraphNode(
            node_id="module.my_func",
            labels=["Function"],
        )
        assert node.node_id == "module.my_func"
        assert node.labels == ["Function"]
        assert node.properties == {}

    def test_with_properties(self):
        """Should store extra properties."""
        node = GraphNode(
            node_id="pkg.MyClass",
            labels=["Class"],
            properties={
                "name": "MyClass",
                "path": "/src/pkg/myclass.py",
                "start_line": 10,
                "end_line": 50,
                "language": "python",
            },
        )
        assert node.properties["path"] == "/src/pkg/myclass.py"
        assert node.properties["start_line"] == 10
        assert node.properties["language"] == "python"

    def test_kb_id_in_properties(self):
        """kb_id should be injectable via properties."""
        node = GraphNode(
            node_id="main.py",
            labels=["File"],
            properties={"kb_id": "test-kb-123"},
        )
        assert node.properties["kb_id"] == "test-kb-123"

    def test_multiple_labels(self):
        """Node should support multiple labels."""
        node = GraphNode(
            node_id="test",
            labels=["Method", "Function"],
        )
        assert len(node.labels) == 2
        assert "Method" in node.labels

    def test_default_properties_are_independent(self):
        """Each node should have its own properties dict (no shared mutable default)."""
        n1 = GraphNode(node_id="a", labels=["File"])
        n2 = GraphNode(node_id="b", labels=["File"])
        n1.properties["key"] = "val"
        assert "key" not in n2.properties


class TestGraphRelationship:
    """Tests for GraphRelationship dataclass."""

    def test_minimal_construction(self):
        """Should construct with required fields."""
        rel = GraphRelationship(
            from_id="module.func_a",
            to_id="module.func_b",
            rel_type="CALLS",
        )
        assert rel.from_id == "module.func_a"
        assert rel.to_id == "module.func_b"
        assert rel.rel_type == "CALLS"
        assert rel.properties == {}

    def test_with_properties(self):
        """Should store extra properties."""
        rel = GraphRelationship(
            from_id="app.main",
            to_id="utils.helper",
            rel_type="IMPORTS",
            properties={"alias": "h"},
        )
        assert rel.properties["alias"] == "h"

    def test_default_properties_are_independent(self):
        """Each relationship should have its own properties dict."""
        r1 = GraphRelationship(from_id="a", to_id="b", rel_type="CALLS")
        r2 = GraphRelationship(from_id="c", to_id="d", rel_type="CALLS")
        r1.properties["key"] = "val"
        assert "key" not in r2.properties


class TestFQNSpec:
    """Tests for FQNSpec dataclass."""

    def test_construction(self):
        """Should construct with all required callables."""
        spec = FQNSpec(
            scope_node_types=("class_definition",),
            function_node_types=("function_definition",),
            get_name=lambda node: "test",
            file_to_module_parts=lambda path: ["mod"],
        )
        assert spec.scope_node_types == ("class_definition",)
        assert spec.function_node_types == ("function_definition",)
        assert callable(spec.get_name)
        assert callable(spec.file_to_module_parts)


class TestLanguageSpec:
    """Tests for LanguageSpec dataclass."""

    def test_python_spec_construction(self):
        """Should construct a valid Python language spec."""
        spec = LanguageSpec(
            language=SupportedLanguage.PYTHON,
            file_extensions=(".py", ".pyi"),
            function_node_types=("function_definition",),
            class_node_types=("class_definition",),
            call_node_types=("call",),
            import_node_types=("import_statement", "import_from_statement"),
            module_node_types=("module",),
            package_indicators=("__init__.py",),
        )
        assert spec.language == SupportedLanguage.PYTHON
        assert ".py" in spec.file_extensions
        assert spec.function_query is None  # Optional defaults to None

    def test_optional_fields_default_to_empty(self):
        """Optional fields should have safe defaults."""
        spec = LanguageSpec(
            language=SupportedLanguage.JAVA,
            file_extensions=(".java",),
            function_node_types=("method_declaration",),
            class_node_types=("class_declaration",),
            call_node_types=("method_invocation",),
            import_node_types=("import_declaration",),
        )
        assert spec.module_node_types == ()
        assert spec.package_indicators == ()
        assert spec.function_query is None
        assert spec.class_query is None
        assert spec.call_query is None
