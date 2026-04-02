"""
Code Graph RAG - Python Type Inference

Extracts type annotations and infers types from Python AST nodes.

Ported from codebase_rag/parsers/py/type_inference.py.
"""
from __future__ import annotations

from tree_sitter import Node

from ..parsers.utils import safe_decode_text


def extract_type_annotation(node: Node) -> str | None:
    """
    Extract type annotation from a Python typed parameter or assignment.

    @param node: AST node with 'type' field.
    @returns: Type annotation string or None.
    """
    type_node = node.child_by_field_name("type")
    if type_node and type_node.text:
        return safe_decode_text(type_node)
    return None


def extract_return_type(func_node: Node) -> str | None:
    """
    Extract return type annotation from a function definition.

    @param func_node: Function definition AST node.
    @returns: Return type string or None.
    """
    return_type = func_node.child_by_field_name("return_type")
    if return_type and return_type.text:
        return safe_decode_text(return_type)
    return None


def infer_type_from_value(value_node: Node) -> str | None:
    """
    Infer a type from a value expression node.

    @param value_node: AST value node.
    @returns: Inferred type string or None.
    """
    type_map = {
        "integer": "int",
        "float": "float",
        "string": "str",
        "true": "bool",
        "false": "bool",
        "none": "None",
        "list": "list",
        "dictionary": "dict",
        "set": "set",
        "tuple": "tuple",
        "list_comprehension": "list",
        "dictionary_comprehension": "dict",
        "set_comprehension": "set",
        "generator_expression": "Generator",
    }
    return type_map.get(value_node.type)
