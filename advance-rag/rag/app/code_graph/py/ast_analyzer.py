"""
Code Graph RAG - Python AST Analyzer

Deep Python AST analysis for class detection, function scope analysis,
decorator parsing, and comprehension handling.

Ported from codebase_rag/parsers/py/ast_analyzer.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from tree_sitter import Node

from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    pass




def analyze_python_class(class_node: Node) -> dict[str, str | list[str] | None]:
    """
    Analyze a Python class_definition node to extract metadata.

    @param class_node: Python class AST node.
    @returns: Dict with 'name', 'bases', 'decorators', 'docstring'.
    """
    result: dict[str, str | list[str] | None] = {
        "name": None,
        "bases": [],
        "decorators": [],
        "docstring": None,
    }

    # Name
    name_node = class_node.child_by_field_name("name")
    if name_node:
        result["name"] = safe_decode_text(name_node)

    # Base classes
    bases: list[str] = []
    superclasses = class_node.child_by_field_name("superclasses")
    if superclasses:
        for child in superclasses.children:
            if child.type in ("identifier", "attribute") and child.text:
                if text := safe_decode_text(child):
                    bases.append(text)
    result["bases"] = bases

    # Decorators (from decorated_definition parent)
    decorators: list[str] = []
    if class_node.parent and class_node.parent.type == "decorated_definition":
        for child in class_node.parent.children:
            if child.type == "decorator":
                if text := safe_decode_text(child):
                    decorators.append(text)
    result["decorators"] = decorators

    # Docstring (first expression_statement with string child)
    body = class_node.child_by_field_name("body")
    if body and body.children:
        first_stmt = body.children[0] if body.children else None
        if first_stmt and first_stmt.type == "expression_statement":
            for child in first_stmt.children:
                if child.type == "string":
                    result["docstring"] = safe_decode_text(child)
                    break

    return result


def analyze_python_function(func_node: Node) -> dict[str, str | list[str] | None]:
    """
    Analyze a Python function_definition node to extract metadata.

    @param func_node: Python function AST node.
    @returns: Dict with 'name', 'params', 'return_type', 'decorators', 'docstring', 'is_async'.
    """
    result: dict[str, str | list[str] | None] = {
        "name": None,
        "params": [],
        "return_type": None,
        "decorators": [],
        "docstring": None,
        "is_async": None,
    }

    # Name
    name_node = func_node.child_by_field_name("name")
    if name_node:
        result["name"] = safe_decode_text(name_node)

    # Parameters
    params: list[str] = []
    params_node = func_node.child_by_field_name("parameters")
    if params_node:
        for child in params_node.children:
            if child.type in ("identifier", "typed_parameter", "default_parameter",
                              "typed_default_parameter", "list_splat_pattern",
                              "dictionary_splat_pattern"):
                if child.type == "identifier":
                    if text := safe_decode_text(child):
                        params.append(text)
                else:
                    name = child.child_by_field_name("name")
                    if name:
                        if text := safe_decode_text(name):
                            params.append(text)
    result["params"] = params

    # Return type
    return_type = func_node.child_by_field_name("return_type")
    if return_type:
        result["return_type"] = safe_decode_text(return_type)

    # Decorators
    decorators: list[str] = []
    if func_node.parent and func_node.parent.type == "decorated_definition":
        for child in func_node.parent.children:
            if child.type == "decorator":
                if text := safe_decode_text(child):
                    decorators.append(text)
    result["decorators"] = decorators

    # Docstring
    body = func_node.child_by_field_name("body")
    if body and body.children:
        first_stmt = body.children[0] if body.children else None
        if first_stmt and first_stmt.type == "expression_statement":
            for child in first_stmt.children:
                if child.type == "string":
                    result["docstring"] = safe_decode_text(child)
                    break

    # Async
    result["is_async"] = func_node.type == "async_function_definition"

    return result


def find_all_calls_in_function(func_node: Node) -> list[str]:
    """
    Find all function call names within a function body.

    @param func_node: Function AST node.
    @returns: List of called function name strings.
    """
    calls: list[str] = []
    body = func_node.child_by_field_name("body")
    if not body:
        return calls

    _walk_for_calls(body, calls)
    return calls


def _walk_for_calls(node: Node, calls: list[str]) -> None:
    """Recursively walk AST collecting function call names."""
    if node.type == "call":
        func_node = node.child_by_field_name("function")
        if func_node:
            if text := safe_decode_text(func_node):
                calls.append(text)

    for child in node.children:
        _walk_for_calls(child, calls)


def resolve_class_name(name: str, module_qn: str) -> str | None:
    """
    Resolve a Python class name to its qualified name.
    Simple implementation — returns module_qn.name.

    @param name: Class name.
    @param module_qn: Module qualified name.
    @returns: Qualified name or None.
    """
    return f"{module_qn}.{name}" if name else None
