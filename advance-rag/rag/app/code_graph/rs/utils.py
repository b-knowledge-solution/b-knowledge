"""
Code Graph RAG - Rust Utilities

Rust-specific AST helpers: module path building and impl target extraction.

Ported from codebase_rag/parsers/rs/utils.py.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from tree_sitter import Node


def build_module_path(
    node: Node,
    include_classes: bool = False,
    class_node_types: frozenset[str] | None = None,
) -> list[str]:
    """
    Walk ancestors to build the module path for a Rust symbol.

    @param node: AST node.
    @param include_classes: Whether to include class nodes in the path.
    @param class_node_types: Set of class node type strings.
    @returns: List of path components (bottom-up, reversed).
    """
    path_parts: list[str] = []
    current = node.parent

    while current:
        if current.type == cs.TS_IMPL_ITEM:
            if target := extract_impl_target(current):
                path_parts.append(target)
        elif current.type in ("mod_item",):
            name_node = current.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                if name := safe_decode_text(name_node):
                    path_parts.append(name)
        elif include_classes and class_node_types and current.type in class_node_types:
            name_node = current.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                if name := safe_decode_text(name_node):
                    path_parts.append(name)
        current = current.parent

    path_parts.reverse()
    return path_parts


def extract_impl_target(node: Node) -> str | None:
    """
    Extract the target type from a Rust impl block.

    @param node: impl_item AST node.
    @returns: Type name string or None.
    """
    if node.type != cs.TS_IMPL_ITEM:
        return None

    # The type field in impl blocks
    type_node = node.child_by_field_name("type")
    if type_node and type_node.text:
        return safe_decode_text(type_node)

    # Fallback: look for type_identifier children
    for child in node.children:
        if child.type == cs.TS_TYPE_IDENTIFIER and child.text:
            return safe_decode_text(child)

    return None
