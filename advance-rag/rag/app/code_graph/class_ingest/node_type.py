"""
Code Graph RAG - Node Type Classification

Determines whether a class AST node represents a Class, Interface, Enum,
Struct, Union, or Type by examining tree-sitter node types.

Ported from codebase_rag/parsers/class_ingest/node_type.py.
"""
from __future__ import annotations

from loguru import logger

from tree_sitter import Node

from .. import constants as cs
from ..types_defs import NodeType
from ..parsers.utils import safe_decode_with_fallback




def determine_node_type(
    class_node: Node,
    class_name: str | None,
    class_qn: str,
    language: cs.SupportedLanguage,
) -> str:
    """
    Classify an AST class/struct/enum node into a NodeType string.

    @param class_node: The AST node.
    @param class_name: Class name (for logging).
    @param class_qn: Qualified name (for logging).
    @param language: Source language.
    @returns: NodeType string constant.
    """
    node_type = class_node.type

    # Interface / trait
    if node_type in (cs.TS_INTERFACE_DECLARATION, cs.TS_RS_TRAIT_ITEM):
        logger.info(f"Interface found: {class_name} ({class_qn})")
        return NodeType.INTERFACE

    # Enum
    if node_type in (
        cs.TS_ENUM_DECLARATION, cs.TS_ENUM_SPECIFIER,
        cs.TS_ENUM_CLASS_SPECIFIER, cs.TS_RS_ENUM_ITEM,
    ):
        logger.info(f"Enum found: {class_name} ({class_qn})")
        return NodeType.ENUM

    # Type alias
    if node_type in (cs.TS_TYPE_ALIAS_DECLARATION, cs.TS_RS_TYPE_ITEM):
        logger.info(f"Type found: {class_name} ({class_qn})")
        return NodeType.TYPE

    # Struct
    if node_type in (cs.TS_STRUCT_SPECIFIER, cs.TS_RS_STRUCT_ITEM):
        logger.info(f"Struct found: {class_name} ({class_qn})")
        return NodeType.CLASS

    # Union
    if node_type in (cs.TS_UNION_SPECIFIER, cs.TS_RS_UNION_ITEM):
        logger.info(f"Union found: {class_name} ({class_qn})")
        return NodeType.CLASS

    # C++ template
    if node_type == cs.CppNodeType.TEMPLATE_DECLARATION:
        template_type = extract_template_class_type(class_node) or NodeType.CLASS
        logger.info(f"Template {template_type} found: {class_name} ({class_qn})")
        return template_type

    # C++ exported function_definition as class
    if (
        node_type == cs.CppNodeType.FUNCTION_DEFINITION
        and language == cs.SupportedLanguage.CPP
    ):
        logger.info(f"Exported class found: {class_name} ({class_qn})")
        return NodeType.CLASS

    # Default: regular class
    logger.info(f"Class found: {class_name} ({class_qn})")
    return NodeType.CLASS


def extract_template_class_type(template_node: Node) -> str | None:
    """Extract the inner type from a C++ template declaration."""
    for child in template_node.children:
        if child.type in (cs.CppNodeType.CLASS_SPECIFIER, cs.TS_STRUCT_SPECIFIER):
            return NodeType.CLASS
        if child.type == cs.TS_ENUM_SPECIFIER:
            return NodeType.ENUM
    return None
