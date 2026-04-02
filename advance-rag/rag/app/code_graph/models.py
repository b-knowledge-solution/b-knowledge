"""
Code Graph RAG - Data Models

Graph node/relationship models, FQNSpec, and LanguageSpec dataclasses
for the code knowledge graph pipeline.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .constants import SupportedLanguage


# =============================================================================
# Graph Data Models
# =============================================================================

@dataclass
class GraphNode:
    """
    Represents a node in the code knowledge graph.

    @param node_id: Unique identifier (typically qualified_name).
    @param labels: List of labels (e.g., ["Function"], ["Class"]).
    @param properties: Key-value properties (name, path, source_code, etc.).
    """
    node_id: str
    labels: list[str]
    properties: dict[str, str | int | float | bool | None] = field(default_factory=dict)


@dataclass
class GraphRelationship:
    """
    Represents an edge in the code knowledge graph.

    @param from_id: Source node identifier.
    @param to_id: Target node identifier.
    @param rel_type: Relationship type (CALLS, IMPORTS, INHERITS, etc.).
    @param properties: Optional edge properties.
    """
    from_id: str
    to_id: str
    rel_type: str
    properties: dict[str, str | int | float | bool | None] = field(default_factory=dict)


# =============================================================================
# Fully Qualified Name Specification
# =============================================================================

@dataclass
class FQNSpec:
    """
    Language-specific rules for building fully qualified names (FQN).

    @param scope_node_types: AST node types that define a scope (class, module, etc.).
    @param function_node_types: AST node types that define functions/methods.
    @param get_name: Callable that extracts name from an AST node.
    @param file_to_module_parts: Callable that converts file path to module parts.
    """
    scope_node_types: tuple[str, ...]
    function_node_types: tuple[str, ...]
    get_name: Callable
    file_to_module_parts: Callable


# =============================================================================
# Language Specification
# =============================================================================

@dataclass
class LanguageSpec:
    """
    Full specification for how to parse a programming language.

    @param language: The SupportedLanguage enum value.
    @param file_extensions: Tuple of file extensions for this language.
    @param function_node_types: AST node types for function definitions.
    @param class_node_types: AST node types for class/struct/trait definitions.
    @param call_node_types: AST node types for function calls.
    @param import_node_types: AST node types for import statements.
    @param module_node_types: AST node types for module declarations.
    @param package_indicators: Files that indicate a package root.
    @param function_query: Optional Tree-sitter query for functions.
    @param class_query: Optional Tree-sitter query for classes.
    @param call_query: Optional Tree-sitter query for calls.
    """
    language: SupportedLanguage
    file_extensions: tuple[str, ...]
    function_node_types: tuple[str, ...]
    class_node_types: tuple[str, ...]
    call_node_types: tuple[str, ...]
    import_node_types: tuple[str, ...]
    module_node_types: tuple[str, ...] = ()
    package_indicators: tuple[str, ...] = ()
    function_query: str | None = None
    class_query: str | None = None
    call_query: str | None = None
