"""
Code Graph RAG - Python Variable Analyzer

Analyzes Python variable assignments, scope tracking, and type inference
from assignment statements and type annotations.

Ported from codebase_rag/parsers/py/variable_analyzer.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from tree_sitter import Node

from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    pass




def extract_assignments(node: Node) -> list[dict[str, str | None]]:
    """
    Extract variable assignments from a Python scope.

    @param node: AST node (function body, module, class body).
    @returns: List of dicts with 'name', 'type', 'value'.
    """
    assignments: list[dict[str, str | None]] = []
    _walk_for_assignments(node, assignments)
    return assignments


def _walk_for_assignments(node: Node, assignments: list[dict[str, str | None]]) -> None:
    """Recursively find assignment statements."""
    if node.type == "assignment":
        left = node.child_by_field_name("left")
        right = node.child_by_field_name("right")
        type_node = node.child_by_field_name("type")

        if left:
            name = safe_decode_text(left)
            value = safe_decode_text(right) if right else None
            type_annotation = safe_decode_text(type_node) if type_node else None
            assignments.append({
                "name": name,
                "type": type_annotation,
                "value": value,
            })
    elif node.type == "augmented_assignment":
        left = node.child_by_field_name("left")
        if left:
            assignments.append({
                "name": safe_decode_text(left),
                "type": None,
                "value": None,
            })

    # Don't descend into nested functions/classes
    if node.type not in ("function_definition", "class_definition", "async_function_definition"):
        for child in node.children:
            _walk_for_assignments(child, assignments)


def extract_global_names(node: Node) -> list[str]:
    """
    Extract global/nonlocal variable names from a scope.

    @param node: Function body AST node.
    @returns: List of global/nonlocal variable names.
    """
    names: list[str] = []
    for child in node.children:
        if child.type in ("global_statement", "nonlocal_statement"):
            for name_child in child.children:
                if name_child.type == "identifier" and name_child.text:
                    if text := safe_decode_text(name_child):
                        names.append(text)
    return names


def classify_variable_scope(
    name: str,
    function_body: Node,
) -> str:
    """
    Classify whether a variable is local, global, or nonlocal in a function.

    @param name: Variable name.
    @param function_body: Function body AST node.
    @returns: 'local', 'global', or 'nonlocal'.
    """
    for child in function_body.children:
        if child.type == "global_statement":
            for name_child in child.children:
                if name_child.type == "identifier" and safe_decode_text(name_child) == name:
                    return "global"
        elif child.type == "nonlocal_statement":
            for name_child in child.children:
                if name_child.type == "identifier" and safe_decode_text(name_child) == name:
                    return "nonlocal"
    return "local"
