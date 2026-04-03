"""
Code Graph RAG - Parser Utilities

Shared utility functions for AST text extraction, function/method
ingestion, and tree-sitter query helpers.

Ported from codebase_rag/parsers/utils.py and adapted for b-knowledge.
"""
from __future__ import annotations

from loguru import logger
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, NamedTuple

from tree_sitter import Node

from .. import constants as cs
from ..types_defs import NodeType, PropertyDict, SimpleNameLookup

if TYPE_CHECKING:
    from ..language_spec import LanguageSpec
    from ..services import IngestorProtocol
    from ..types_defs import FunctionRegistryTrieProtocol




# =============================================================================
# AST Text Extraction
# =============================================================================

class FunctionCapturesResult(NamedTuple):
    """Result of extracting function captures from an AST root."""
    lang_config: LanguageSpec
    captures: dict[str, list[Node]]


@lru_cache(maxsize=50000)
def _cached_decode_bytes(text_bytes: bytes) -> str:
    """Cached decode of bytes to string to avoid repeated decoding."""
    return text_bytes.decode(cs.ENCODING_UTF8)


def safe_decode_text(node: Node | None) -> str | None:
    """
    Safely extract text from a tree-sitter node.

    @param node: Tree-sitter AST node (may be None).
    @returns: Decoded text string, or None if node is None or has no text.
    """
    if node is None or (text_bytes := node.text) is None:
        return None
    if isinstance(text_bytes, bytes):
        return _cached_decode_bytes(text_bytes)
    return str(text_bytes)


def safe_decode_with_fallback(node: Node | None, fallback: str = "") -> str:
    """
    Decode node text with a fallback value.

    @param node: Tree-sitter AST node.
    @param fallback: Default value if decoding fails.
    @returns: Decoded text or fallback string.
    """
    return result if (result := safe_decode_text(node)) is not None else fallback


def contains_node(parent: Node, target: Node) -> bool:
    """
    Check whether target is a descendant of parent node.

    @param parent: Potential ancestor node.
    @param target: The node to search for.
    @returns: True if target is found within parent's subtree.
    """
    return parent == target or any(
        contains_node(child, target) for child in parent.children
    )


# =============================================================================
# Method Ingestion
# =============================================================================

def ingest_method(
    method_node: Node,
    container_qn: str,
    container_type: cs.NodeLabel,
    ingestor: IngestorProtocol,
    function_registry: FunctionRegistryTrieProtocol,
    simple_name_lookup: SimpleNameLookup,
    get_docstring_func: Callable[[Node], str | None],
    language: cs.SupportedLanguage | None = None,
    extract_decorators_func: Callable[[Node], list[str]] | None = None,
    method_qualified_name: str | None = None,
    file_path: Path | None = None,
    repo_path: Path | None = None,
) -> None:
    """
    Ingest a method node by creating graph nodes and relationships.

    @param method_node: The AST node for the method.
    @param container_qn: Qualified name of the owning class/struct.
    @param container_type: NodeLabel of the container.
    @param ingestor: Graph ingestor to write nodes/rels.
    @param function_registry: Registry mapping QN -> NodeType.
    @param simple_name_lookup: Map from simple name -> set of QNs.
    @param get_docstring_func: Function to extract docstring from node.
    @param language: Programming language of the source.
    @param extract_decorators_func: Optional decorator extraction function.
    @param method_qualified_name: Override for the method QN.
    @param file_path: Absolute file path.
    @param repo_path: Repository root path.
    """
    # Extract method name
    if language == cs.SupportedLanguage.CPP:
        from .cpp import utils as cpp_utils
        method_name = cpp_utils.extract_function_name(method_node)
        if not method_name:
            return
    elif not (method_name_node := method_node.child_by_field_name(cs.FIELD_NAME)):
        return
    elif (text := method_name_node.text) is None:
        return
    else:
        method_name = text.decode(cs.ENCODING_UTF8) if isinstance(text, bytes) else str(text)

    method_qn = method_qualified_name or f"{container_qn}.{method_name}"
    decorators = extract_decorators_func(method_node) if extract_decorators_func else []

    # Build method properties
    method_props: PropertyDict = {
        cs.KEY_QUALIFIED_NAME: method_qn,
        cs.KEY_NAME: method_name,
        "decorators": decorators,
        cs.KEY_START_LINE: method_node.start_point[0] + 1,
        cs.KEY_END_LINE: method_node.end_point[0] + 1,
        "docstring": get_docstring_func(method_node),
    }
    if file_path is not None and repo_path is not None:
        method_props[cs.KEY_PATH] = file_path.relative_to(repo_path).as_posix()

    logger.info(f"Method found: {method_name} ({method_qn})")

    # Create graph node and relationship
    from ..models import GraphNode, GraphRelationship
    ingestor.ensure_node(GraphNode(
        labels=[cs.NodeLabel.METHOD],
        properties=method_props,
    ))
    function_registry[method_qn] = NodeType.METHOD
    simple_name_lookup[method_name].add(method_qn)

    ingestor.ensure_relationship(GraphRelationship(
        source_label=container_type,
        source_key=cs.KEY_QUALIFIED_NAME,
        source_value=container_qn,
        target_label=cs.NodeLabel.METHOD,
        target_key=cs.KEY_QUALIFIED_NAME,
        target_value=method_qn,
        rel_type=cs.RelationshipType.DEFINES_METHOD,
    ))


def ingest_exported_function(
    function_node: Node,
    function_name: str,
    module_qn: str,
    export_type: str,
    ingestor: IngestorProtocol,
    function_registry: FunctionRegistryTrieProtocol,
    simple_name_lookup: SimpleNameLookup,
    get_docstring_func: Callable[[Node], str | None],
    file_path: Path | None = None,
    repo_path: Path | None = None,
) -> None:
    """
    Ingest an exported function node.

    @param function_node: AST node of the function.
    @param function_name: Name of the function.
    @param module_qn: Qualified name of the containing module.
    @param export_type: Type string (e.g. 'default', 'named').
    @param ingestor: Graph ingestor.
    @param function_registry: QN -> NodeType map.
    @param simple_name_lookup: simple name -> QN set.
    @param get_docstring_func: Docstring extractor.
    @param file_path: Absolute file path.
    @param repo_path: Repository root path.
    """
    function_qn = f"{module_qn}.{function_name}"

    func_props: PropertyDict = {
        cs.KEY_QUALIFIED_NAME: function_qn,
        cs.KEY_NAME: function_name,
        "export_type": export_type,
        cs.KEY_START_LINE: function_node.start_point[0] + 1,
        cs.KEY_END_LINE: function_node.end_point[0] + 1,
        "docstring": get_docstring_func(function_node),
    }
    if file_path is not None and repo_path is not None:
        func_props[cs.KEY_PATH] = file_path.relative_to(repo_path).as_posix()

    from ..models import GraphNode, GraphRelationship
    ingestor.ensure_node(GraphNode(
        labels=[cs.NodeLabel.FUNCTION],
        properties=func_props,
    ))
    function_registry[function_qn] = NodeType.FUNCTION
    simple_name_lookup[function_name].add(function_qn)

    ingestor.ensure_relationship(GraphRelationship(
        source_label=cs.NodeLabel.MODULE,
        source_key=cs.KEY_QUALIFIED_NAME,
        source_value=module_qn,
        target_label=cs.NodeLabel.FUNCTION,
        target_key=cs.KEY_QUALIFIED_NAME,
        target_value=function_qn,
        rel_type=cs.RelationshipType.EXPORTS,
    ))
