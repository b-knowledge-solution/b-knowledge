"""
Code Graph RAG - Function Ingest

Deep function body analysis with handler integration.
Extracts function metadata, manages call resolution, and creates
function graph nodes with source code.

Ported from codebase_rag/parsers/function_ingest.py.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path
from typing import TYPE_CHECKING

from tree_sitter import Node

from . import constants as cs
from .models import GraphNode, GraphRelationship
from .parsers.utils import safe_decode_text
from .types_defs import NodeType, PropertyDict

if TYPE_CHECKING:
    from .handlers.protocol import LanguageHandler
    from .services import IngestorProtocol
    from .types_defs import FunctionRegistryTrieProtocol, SimpleNameLookup




def ingest_function(
    func_node: Node,
    module_qn: str,
    language: cs.SupportedLanguage,
    handler: LanguageHandler,
    ingestor: IngestorProtocol,
    function_registry: FunctionRegistryTrieProtocol,
    simple_name_lookup: SimpleNameLookup,
    file_path: Path | None = None,
    repo_path: Path | None = None,
    project_name: str = "",
    include_source: bool = True,
) -> str | None:
    """
    Ingest a top-level function into the graph.

    @param func_node: Function AST node.
    @param module_qn: Module QN.
    @param language: Source language.
    @param handler: Language-specific handler.
    @param ingestor: Graph ingestor.
    @param function_registry: QN→type registry.
    @param simple_name_lookup: Name→QN set.
    @param file_path: Source file path.
    @param repo_path: Repository root.
    @param project_name: Project name.
    @param include_source: Whether to include source code in node.
    @returns: Function qualified name or None.
    """
    # Skip class methods (handled by class_ingest)
    if handler.is_class_method(func_node):
        return None

    # Extract function name
    func_name = handler.extract_function_name(func_node)
    if not func_name:
        return None

    # Build qualified name
    func_qn = handler.build_function_qualified_name(
        func_node, module_qn, func_name,
        None, file_path,
        repo_path or Path("."), project_name,
    )

    # Extract metadata
    decorators = handler.extract_decorators(func_node)
    docstring = _extract_docstring(func_node, language)
    params = _extract_parameters(func_node)
    return_type = _extract_return_type(func_node)

    # Build properties
    func_props: PropertyDict = {
        cs.KEY_QUALIFIED_NAME: func_qn,
        cs.KEY_NAME: func_name,
        "decorators": decorators,
        cs.KEY_START_LINE: func_node.start_point[0] + 1,
        cs.KEY_END_LINE: func_node.end_point[0] + 1,
        "docstring": docstring,
    }
    if params:
        func_props[cs.KEY_PARAMETERS] = params
    if return_type:
        func_props[cs.KEY_RETURN_TYPE] = return_type
    if file_path and repo_path:
        func_props[cs.KEY_PATH] = file_path.relative_to(repo_path).as_posix()
    if include_source:
        func_props[cs.KEY_SOURCE_CODE] = safe_decode_text(func_node)

    # Create graph node
    ingestor.ensure_node(GraphNode(
        labels=[cs.NodeLabel.FUNCTION],
        properties=func_props,
    ))
    function_registry[func_qn] = NodeType.FUNCTION
    simple_name_lookup[func_name].add(func_qn)

    # Module DEFINES Function
    ingestor.ensure_relationship(GraphRelationship(
        source_label=cs.NodeLabel.MODULE,
        source_key=cs.KEY_QUALIFIED_NAME,
        source_value=module_qn,
        target_label=cs.NodeLabel.FUNCTION,
        target_key=cs.KEY_QUALIFIED_NAME,
        target_value=func_qn,
        rel_type=cs.RelationshipType.DEFINES,
    ))

    # Handle exports (JS/TS, C++)
    if handler.is_function_exported(func_node):
        ingestor.ensure_relationship(GraphRelationship(
            source_label=cs.NodeLabel.MODULE,
            source_key=cs.KEY_QUALIFIED_NAME,
            source_value=module_qn,
            target_label=cs.NodeLabel.FUNCTION,
            target_key=cs.KEY_QUALIFIED_NAME,
            target_value=func_qn,
            rel_type=cs.RelationshipType.EXPORTS,
        ))

    logger.info(f"Function ingested: {func_name} ({func_qn})")
    return func_qn


def _extract_docstring(func_node: Node, language: cs.SupportedLanguage) -> str | None:
    """Extract docstring from function body's first statement."""
    body = func_node.child_by_field_name(cs.FIELD_BODY)
    if not body or not body.children:
        return None

    first = body.children[0]

    # Python: expression_statement > string
    if language == cs.SupportedLanguage.PYTHON and first.type == "expression_statement":
        for child in first.children:
            if child.type == "string":
                return safe_decode_text(child)

    # JS/TS: first comment child
    if language in (cs.SupportedLanguage.JAVASCRIPT, cs.SupportedLanguage.TYPESCRIPT):
        if first.type == "comment":
            return safe_decode_text(first)

    return None


def _extract_parameters(func_node: Node) -> list[str] | None:
    """Extract parameter names from function node."""
    params_node = func_node.child_by_field_name(cs.FIELD_PARAMETERS)
    if not params_node:
        return None

    params: list[str] = []
    for child in params_node.children:
        if child.type == "identifier" and child.text:
            if text := safe_decode_text(child):
                params.append(text)
        elif child.type in ("typed_parameter", "formal_parameter", "required_parameter",
                            "optional_parameter", "parameter"):
            name = child.child_by_field_name("name") or child.child_by_field_name("pattern")
            if name and name.text:
                if text := safe_decode_text(name):
                    params.append(text)
    return params if params else None


def _extract_return_type(func_node: Node) -> str | None:
    """Extract return type annotation."""
    return_type = func_node.child_by_field_name("return_type")
    if return_type and return_type.text:
        return safe_decode_text(return_type)
    return None
