"""
Code Graph RAG - Lua Utilities

Lua-specific AST helpers: extracting assigned names for function_definition nodes.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from tree_sitter import Node


def extract_assigned_name(
    node: Node,
    accepted_var_types: tuple[str, ...] = (),
) -> str | None:
    """
    Extract the name from a Lua function_definition by walking up
    to the assignment statement.

    @param node: Lua function_definition AST node.
    @param accepted_var_types: Accepted variable node types for the assignment.
    @returns: Assigned name string or None.
    """
    parent = node.parent
    if not parent:
        return None

    # local_function_declaration_statement has a name field
    name_node = parent.child_by_field_name("name")
    if name_node and name_node.text:
        return safe_decode_text(name_node)

    # assignment_statement: look for the variable on the left side
    if parent.type in ("assignment_statement", "local_variable_declaration"):
        for child in parent.children:
            if child.type in accepted_var_types and child.text:
                return safe_decode_text(child)

    return None
