"""Unit tests for the code_graph constants module.

Tests language detection, enum completeness, extension mappings,
qualified name separators, and Cypher query templates.
"""

import os
import sys
import pytest

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
    PACKAGE_INDICATORS,
    detect_language,
    CYPHER_CALLERS,
    CYPHER_CALLEES,
    CYPHER_HIERARCHY,
    CYPHER_SNIPPET,
    CYPHER_STATS_NODES,
    CYPHER_STATS_RELS,
    CYPHER_FULL_GRAPH,
)


class TestSupportedLanguage:
    """Tests for the SupportedLanguage enum."""

    def test_all_12_languages_present(self):
        """Should have exactly 12 supported languages."""
        assert len(SupportedLanguage) == 12

    def test_enum_values_are_strings(self):
        """Each enum member should have a string value."""
        for lang in SupportedLanguage:
            assert isinstance(lang.value, str)
            assert len(lang.value) > 0

    def test_specific_languages_present(self):
        """Key languages should be present."""
        expected = ["python", "javascript", "typescript", "rust", "java",
                    "c", "cpp", "lua", "go", "scala", "c_sharp", "php"]
        actual = [lang.value for lang in SupportedLanguage]
        for exp in expected:
            assert exp in actual, f"Missing language: {exp}"


class TestNodeLabel:
    """Tests for the NodeLabel enum."""

    def test_essential_labels_present(self):
        """Essential node labels should exist."""
        required = ["Project", "Folder", "Package", "Module", "File",
                     "Function", "Method", "Class"]
        for label_name in required:
            assert hasattr(NodeLabel, label_name.upper()), \
                f"Missing NodeLabel: {label_name}"

    def test_type_labels_present(self):
        """Type-system labels should exist for multi-language support."""
        type_labels = ["Interface", "Enum", "Trait", "Struct", "Type", "Union"]
        for label_name in type_labels:
            assert hasattr(NodeLabel, label_name.upper()), \
                f"Missing NodeLabel: {label_name}"


class TestRelationshipType:
    """Tests for the RelationshipType enum."""

    def test_essential_relationships_present(self):
        """Core relationship types should exist."""
        required = ["CONTAINS", "DEFINES", "CALLS", "IMPORTS", "INHERITS"]
        for rel in required:
            assert hasattr(RelationshipType, rel), f"Missing RelationshipType: {rel}"


class TestExtensionToLanguage:
    """Tests for file extension → language mapping."""

    @pytest.mark.parametrize("ext,expected", [
        (".py", SupportedLanguage.PYTHON),
        (".pyi", SupportedLanguage.PYTHON),
        (".js", SupportedLanguage.JAVASCRIPT),
        (".jsx", SupportedLanguage.JAVASCRIPT),
        (".ts", SupportedLanguage.TYPESCRIPT),
        (".tsx", SupportedLanguage.TYPESCRIPT),
        (".rs", SupportedLanguage.RUST),
        (".java", SupportedLanguage.JAVA),
        (".c", SupportedLanguage.C),
        (".h", SupportedLanguage.C),
        (".cpp", SupportedLanguage.CPP),
        (".cc", SupportedLanguage.CPP),
        (".hpp", SupportedLanguage.CPP),
        (".lua", SupportedLanguage.LUA),
        (".go", SupportedLanguage.GO),
        (".scala", SupportedLanguage.SCALA),
        (".cs", SupportedLanguage.CSHARP),
        (".php", SupportedLanguage.PHP),
    ])
    def test_extension_maps_to_correct_language(self, ext, expected):
        """Each file extension should map to the expected language."""
        assert EXTENSION_TO_LANGUAGE[ext] == expected

    def test_no_dot_missing(self):
        """Every extension key should start with a dot."""
        for ext in EXTENSION_TO_LANGUAGE:
            assert ext.startswith("."), f"Extension missing dot: {ext}"


class TestDetectLanguage:
    """Tests for the detect_language() function."""

    @pytest.mark.parametrize("filename,expected", [
        ("main.py", SupportedLanguage.PYTHON),
        ("src/utils.ts", SupportedLanguage.TYPESCRIPT),
        ("lib/core.rs", SupportedLanguage.RUST),
        ("App.java", SupportedLanguage.JAVA),
        ("kernel.c", SupportedLanguage.C),
        ("widget.cpp", SupportedLanguage.CPP),
        ("script.lua", SupportedLanguage.LUA),
        ("handler.go", SupportedLanguage.GO),
        ("build.scala", SupportedLanguage.SCALA),
        ("Program.cs", SupportedLanguage.CSHARP),
        ("index.php", SupportedLanguage.PHP),
    ])
    def test_detects_language_from_filename(self, filename, expected):
        """Should detect the correct language from filename."""
        assert detect_language(filename) == expected

    @pytest.mark.parametrize("filename", [
        "readme.md", "config.yaml", "data.json", "image.png", "Makefile",
    ])
    def test_returns_none_for_unsupported(self, filename):
        """Should return None for unsupported file types."""
        assert detect_language(filename) is None

    def test_case_insensitive_extension(self):
        """Detect language should work with uppercase extensions."""
        # Our function lowers the extension
        assert detect_language("test.PY") == SupportedLanguage.PYTHON


class TestQnSeparator:
    """Tests for qualified name separators."""

    def test_all_languages_have_separator(self):
        """Every supported language should have a QN separator defined."""
        for lang in SupportedLanguage:
            assert lang in QN_SEPARATOR, f"Missing QN_SEPARATOR for {lang.value}"

    def test_python_uses_dot(self):
        """Python should use dot separator."""
        assert QN_SEPARATOR[SupportedLanguage.PYTHON] == "."

    def test_rust_uses_double_colon(self):
        """Rust should use :: separator."""
        assert QN_SEPARATOR[SupportedLanguage.RUST] == "::"

    def test_php_uses_backslash(self):
        """PHP should use backslash separator."""
        assert QN_SEPARATOR[SupportedLanguage.PHP] == "\\"


class TestPackageIndicators:
    """Tests for package indicator files per language."""

    def test_all_languages_have_indicators(self):
        """Every supported language should have package indicators."""
        for lang in SupportedLanguage:
            assert lang in PACKAGE_INDICATORS, \
                f"Missing PACKAGE_INDICATORS for {lang.value}"
            assert len(PACKAGE_INDICATORS[lang]) > 0

    def test_python_has_init(self):
        """Python package indicator should include __init__.py."""
        assert "__init__.py" in PACKAGE_INDICATORS[SupportedLanguage.PYTHON]

    def test_js_has_package_json(self):
        """JavaScript should indicate with package.json."""
        assert "package.json" in PACKAGE_INDICATORS[SupportedLanguage.JAVASCRIPT]


class TestCypherTemplates:
    """Tests for Cypher query templates."""

    def test_callers_template_has_placeholders(self):
        """CYPHER_CALLERS should contain $kb_id and $name placeholders."""
        assert "$kb_id" in CYPHER_CALLERS
        assert "$name" in CYPHER_CALLERS
        assert "CALLS" in CYPHER_CALLERS

    def test_callees_template_has_placeholders(self):
        """CYPHER_CALLEES should contain $kb_id and $name."""
        assert "$kb_id" in CYPHER_CALLEES
        assert "$name" in CYPHER_CALLEES

    def test_hierarchy_template_uses_inherits(self):
        """CYPHER_HIERARCHY should traverse INHERITS relationships."""
        assert "INHERITS" in CYPHER_HIERARCHY

    def test_snippet_template_filters_functions(self):
        """CYPHER_SNIPPET should filter by Function or Method labels."""
        assert "Function" in CYPHER_SNIPPET
        assert "Method" in CYPHER_SNIPPET

    def test_stats_templates_are_valid(self):
        """Stats query templates should use labels() and type() functions."""
        assert "labels(n)" in CYPHER_STATS_NODES
        assert "type(r)" in CYPHER_STATS_RELS

    def test_full_graph_has_limit(self):
        """CYPHER_FULL_GRAPH should contain a $limit parameter."""
        assert "$limit" in CYPHER_FULL_GRAPH
