"""
Code Graph RAG - JS/TS Ingest

Deep ingestion of JS/TS-specific constructs: arrow functions, destructuring,
module.exports patterns, and class field declarations.

Ported from codebase_rag/parsers/js_ts/ingest.py.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..models import GraphNode, GraphRelationship
from ..parsers.utils import safe_decode_text
from ..types_defs import NodeType

if TYPE_CHECKING:
    from ..services import IngestorProtocol
    from ..types_defs import FunctionRegistryTrieProtocol, SimpleNameLookup




def ingest_module_exports(
    root_node: Node,
    module_qn: str,
    ingestor: IngestorProtocol,
    function_registry: FunctionRegistryTrieProtocol,
    simple_name_lookup: SimpleNameLookup,
    file_path: Path | None = None,
    repo_path: Path | None = None,
) -> None:
    """
    Ingest module.exports and exports.* patterns as exported functions.

    @param root_node: AST root node.
    @param module_qn: Module QN.
    @param ingestor: Graph ingestor.
    @param function_registry: QN→type map.
    @param simple_name_lookup: Name→QN set.
    @param file_path: Source file path.
    @param repo_path: Repo root.
    """
    for child in root_node.children:
        if child.type == cs.TS_EXPRESSION_STATEMENT:
            _process_expression_export(
                child, module_qn, ingestor, function_registry,
                simple_name_lookup, file_path, repo_path,
            )


def _process_expression_export(
    expr_stmt: Node,
    module_qn: str,
    ingestor: IngestorProtocol,
    function_registry: FunctionRegistryTrieProtocol,
    simple_name_lookup: SimpleNameLookup,
    file_path: Path | None,
    repo_path: Path | None,
) -> None:
    """Process an expression_statement for module.exports patterns."""
    for child in expr_stmt.children:
        if child.type == cs.TS_ASSIGNMENT_EXPRESSION:
            left = child.child_by_field_name("left")
            right = child.child_by_field_name("right")
            if not left or not right:
                continue

            left_text = safe_decode_text(left) if left.text else None
            if not left_text:
                continue

            # module.exports = { ... }
            if left_text == "module.exports" and right.type == cs.TS_OBJECT:
                _ingest_object_exports(
                    right, module_qn, ingestor, function_registry,
                    simple_name_lookup, file_path, repo_path,
                )

            # exports.foo = function() { ... }
            elif left_text.startswith("exports."):
                export_name = left_text.split(".", 1)[-1]
                if right.type in (
                    cs.TS_FUNCTION_EXPRESSION, cs.TS_ARROW_FUNCTION,
                ):
                    func_qn = f"{module_qn}.{export_name}"
                    _create_exported_function(
                        func_qn, export_name, right, module_qn,
                        ingestor, function_registry, simple_name_lookup,
                        file_path, repo_path,
                    )


def _ingest_object_exports(
    obj_node: Node,
    module_qn: str,
    ingestor: IngestorProtocol,
    function_registry: FunctionRegistryTrieProtocol,
    simple_name_lookup: SimpleNameLookup,
    file_path: Path | None,
    repo_path: Path | None,
) -> None:
    """Ingest properties from a module.exports = { ... } pattern."""
    for child in obj_node.children:
        if child.type in ("pair", "method_definition"):
            key_node = child.child_by_field_name("key") or child.child_by_field_name(cs.FIELD_NAME)
            value_node = child.child_by_field_name("value")

            if key_node and key_node.text:
                export_name = safe_decode_text(key_node)
                if export_name:
                    func_qn = f"{module_qn}.{export_name}"
                    target_node = value_node or child
                    _create_exported_function(
                        func_qn, export_name, target_node, module_qn,
                        ingestor, function_registry, simple_name_lookup,
                        file_path, repo_path,
                    )


def _create_exported_function(
    func_qn: str,
    func_name: str,
    node: Node,
    module_qn: str,
    ingestor: IngestorProtocol,
    function_registry: FunctionRegistryTrieProtocol,
    simple_name_lookup: SimpleNameLookup,
    file_path: Path | None,
    repo_path: Path | None,
) -> None:
    """Create a graph node for an exported function."""
    props = {
        cs.KEY_QUALIFIED_NAME: func_qn,
        cs.KEY_NAME: func_name,
        cs.KEY_START_LINE: node.start_point[0] + 1,
        cs.KEY_END_LINE: node.end_point[0] + 1,
    }
    if file_path and repo_path:
        props[cs.KEY_PATH] = file_path.relative_to(repo_path).as_posix()

    ingestor.ensure_node(GraphNode(
        labels=[cs.NodeLabel.FUNCTION],
        properties=props,
    ))
    function_registry[func_qn] = NodeType.FUNCTION
    simple_name_lookup[func_name].add(func_qn)

    ingestor.ensure_relationship(GraphRelationship(
        source_label=cs.NodeLabel.MODULE,
        source_key=cs.KEY_QUALIFIED_NAME,
        source_value=module_qn,
        target_label=cs.NodeLabel.FUNCTION,
        target_key=cs.KEY_QUALIFIED_NAME,
        target_value=func_qn,
        rel_type=cs.RelationshipType.EXPORTS,
    ))


def ingest_destructured_imports(
    root_node: Node,
    module_qn: str,
) -> dict[str, str]:
    """
    Extract destructured variable bindings from require() calls.

    @param root_node: AST root.
    @param module_qn: Module QN.
    @returns: Map of local_name → source module hint.
    """
    bindings: dict[str, str] = {}

    for child in root_node.children:
        if child.type in (cs.TS_VARIABLE_DECLARATION, cs.TS_LEXICAL_DECLARATION):
            for decl in child.children:
                if decl.type == cs.TS_VARIABLE_DECLARATOR:
                    name_node = decl.child_by_field_name(cs.FIELD_NAME)
                    value_node = decl.child_by_field_name(cs.FIELD_VALUE)
                    if (
                        name_node
                        and name_node.type == cs.TS_OBJECT_PATTERN
                        and value_node
                        and value_node.type == cs.TS_CALL_EXPRESSION
                    ):
                        func = value_node.child_by_field_name("function")
                        if func and func.text and safe_decode_text(func) == "require":
                            for prop in name_node.children:
                                if prop.type == cs.TS_SHORTHAND_PROPERTY_IDENTIFIER_PATTERN:
                                    if prop.text:
                                        prop_name = safe_decode_text(prop)
                                        if prop_name:
                                            bindings[prop_name] = module_qn

    return bindings
