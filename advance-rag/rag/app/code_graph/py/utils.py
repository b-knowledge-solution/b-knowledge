"""
Code Graph RAG - Python Utilities

Python-specific utility functions for name resolution.
"""
from __future__ import annotations

from tree_sitter import Node

from ..parsers.utils import safe_decode_text


def resolve_class_name(name: str, module_qn: str) -> str | None:
    """
    Resolve a Python class name to its qualified name.

    @param name: Class name.
    @param module_qn: Module qualified name.
    @returns: Qualified name or None.
    """
    return f"{module_qn}.{name}" if name else None


def extract_docstring(node: Node) -> str | None:
    """
    Extract docstring from a Python function/class body.

    @param node: Function or class definition AST node.
    @returns: Docstring text or None.
    """
    body = node.child_by_field_name("body")
    if not body or not body.children:
        return None

    first_stmt = body.children[0]
    if first_stmt.type == "expression_statement":
        for child in first_stmt.children:
            if child.type == "string":
                return safe_decode_text(child)
    return None
