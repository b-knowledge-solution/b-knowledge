"""
Code Graph RAG - JS/TS Utilities

Helper functions for JS/TS-specific AST analysis: method call extraction,
constructor naming, return expression analysis, and class body walking.

Ported from codebase_rag/parsers/js_ts/utils.py.
"""
from __future__ import annotations

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text


def extract_class_qn(method_qn: str) -> str | None:
    """Extract the class QN from a method QN (strip last segment)."""
    parts = method_qn.split(cs.SEPARATOR_DOT)
    return cs.SEPARATOR_DOT.join(parts[:-1]) if len(parts) >= 2 else None


def extract_method_call(member_expr_node: Node) -> str | None:
    """Extract 'object.property' from a member_expression node."""
    object_node = member_expr_node.child_by_field_name(cs.FIELD_OBJECT)
    property_node = member_expr_node.child_by_field_name(cs.FIELD_PROPERTY)

    if object_node and property_node and object_node.text and property_node.text:
        object_name = safe_decode_text(object_node)
        property_name = safe_decode_text(property_node)
        return f"{object_name}{cs.SEPARATOR_DOT}{property_name}"
    return None


def find_method_in_class_body(class_body_node: Node, method_name: str) -> Node | None:
    """Find a method_definition in a class body by name."""
    for child in class_body_node.children:
        if child.type == cs.TS_METHOD_DEFINITION:
            name_node = child.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                if safe_decode_text(name_node) == method_name:
                    return child
    return None


def find_method_in_ast(root_node: Node, class_name: str, method_name: str) -> Node | None:
    """Find a method node in the AST by class name and method name."""
    stack: list[Node] = [root_node]
    while stack:
        current = stack.pop()
        if current.type == cs.TS_CLASS_DECLARATION:
            name_node = current.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                if safe_decode_text(name_node) == class_name:
                    if body_node := current.child_by_field_name(cs.FIELD_BODY):
                        return find_method_in_class_body(body_node, method_name)
        stack.extend(reversed(current.children))
    return None


def find_return_statements(node: Node, return_nodes: list[Node]) -> None:
    """Walk AST and collect return_statement nodes."""
    stack: list[Node] = [node]
    while stack:
        current = stack.pop()
        if current.type == cs.TS_RETURN_STATEMENT:
            return_nodes.append(current)
        stack.extend(reversed(current.children))


def extract_constructor_name(new_expr_node: Node) -> str | None:
    """Extract the constructor class name from a new_expression."""
    if new_expr_node.type != cs.TS_NEW_EXPRESSION:
        return None
    constructor_node = new_expr_node.child_by_field_name(cs.FIELD_CONSTRUCTOR)
    if constructor_node and constructor_node.type == cs.TS_IDENTIFIER and constructor_node.text:
        return safe_decode_text(constructor_node)
    return None


def analyze_return_expression(expr_node: Node, method_qn: str) -> str | None:
    """Analyze a return expression to infer the type being returned."""
    if expr_node.type == cs.TS_NEW_EXPRESSION:
        if class_name := extract_constructor_name(expr_node):
            return extract_class_qn(method_qn) or class_name
        return None

    if expr_node.type == cs.TS_THIS:
        return extract_class_qn(method_qn)

    if expr_node.type == cs.TS_MEMBER_EXPRESSION:
        object_node = expr_node.child_by_field_name(cs.FIELD_OBJECT)
        if not object_node:
            return None
        if object_node.type == cs.TS_THIS:
            return extract_class_qn(method_qn)
        if object_node.type == cs.TS_IDENTIFIER and object_node.text:
            object_name = safe_decode_text(object_node)
            qn_parts = method_qn.split(cs.SEPARATOR_DOT)
            if len(qn_parts) >= 2 and object_name == qn_parts[-2]:
                return cs.SEPARATOR_DOT.join(qn_parts[:-1])

    return None
