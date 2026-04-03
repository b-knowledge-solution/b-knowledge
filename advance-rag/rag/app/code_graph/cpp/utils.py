"""
Code Graph RAG - C++ Utilities

C++ specific AST helpers: function name extraction, qualified name
building with namespace resolution, and export detection.

Ported from codebase_rag/parsers/cpp/utils.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from tree_sitter import Node




def extract_function_name(node: Node) -> str | None:
    """
    Extract function name from a C++ function/method node.

    @param node: C++ function AST node.
    @returns: Function name string or None.
    """
    # Template declarations — dig into the inner declaration
    if node.type == cs.CppNodeType.TEMPLATE_DECLARATION:
        for child in node.children:
            if child.type == cs.CppNodeType.FUNCTION_DEFINITION:
                return extract_function_name(child)
        return None

    # Declarator field for function definitions
    declarator = node.child_by_field_name("declarator")
    if declarator is None:
        # Fall back to name field
        name_node = node.child_by_field_name(cs.FIELD_NAME)
        return safe_decode_text(name_node) if name_node and name_node.text else None

    # Walk through nested declarators to get the name
    while declarator:
        if declarator.type == cs.CppNodeType.QUALIFIED_IDENTIFIER:
            # Get the last name component of qualified name
            name_node = declarator.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                return safe_decode_text(name_node)
            # Fallback: last child that's an identifier
            for child in reversed(declarator.children):
                if child.type in (cs.TS_IDENTIFIER, cs.TS_TYPE_IDENTIFIER) and child.text:
                    return safe_decode_text(child)
            return safe_decode_text(declarator) if declarator.text else None

        if declarator.type in (cs.TS_IDENTIFIER, cs.TS_TYPE_IDENTIFIER):
            return safe_decode_text(declarator) if declarator.text else None

        # Nested declarators (function pointers, etc.)
        inner = declarator.child_by_field_name("declarator")
        if inner:
            declarator = inner
        else:
            name_node = declarator.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                return safe_decode_text(name_node)
            return None

    return None


def build_qualified_name(node: Node, module_qn: str, func_name: str) -> str:
    """
    Build a C++ qualified name by walking namespace/class parents.

    @param node: The AST node.
    @param module_qn: Module qualified name.
    @param func_name: Local function/class name.
    @returns: Fully qualified name string.
    """
    # Collect namespace/class parent path
    path_parts: list[str] = []
    current = node.parent
    while current:
        if current.type == cs.CppNodeType.NAMESPACE_DEFINITION:
            name_node = current.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                if name := safe_decode_text(name_node):
                    path_parts.append(name)
        elif current.type in cs.CPP_CLASS_TYPES:
            name_node = current.child_by_field_name(cs.FIELD_NAME)
            if not name_node:
                # Try type_identifier children
                for child in current.children:
                    if child.type == cs.TS_TYPE_IDENTIFIER and child.text:
                        name_node = child
                        break
            if name_node and name_node.text:
                if name := safe_decode_text(name_node):
                    path_parts.append(name)
        current = current.parent

    path_parts.reverse()

    if path_parts:
        return f"{module_qn}{cs.SEPARATOR_DOT}{cs.SEPARATOR_DOT.join(path_parts)}{cs.SEPARATOR_DOT}{func_name}"
    return f"{module_qn}{cs.SEPARATOR_DOT}{func_name}"


def is_exported(node: Node) -> bool:
    """
    Check if a C++ function/class is exported (extern, public).

    @param node: The AST node.
    @returns: True if the node represents an exported symbol.
    """
    # Check for extern keyword
    text = safe_decode_text(node)
    if text and ("extern" in text.split()[:5] or "public" in text.split()[:5]):
        return True

    # Top-level definitions (in namespace) are considered exported
    parent = node.parent
    if parent and parent.type in (cs.CppNodeType.NAMESPACE_DEFINITION, "translation_unit"):
        return True

    return False


def extract_exported_class_name(node: Node) -> str | None:
    """
    Extract class name from a C++ exported function_definition (extern class).

    @param node: AST node.
    @returns: Class name if found.
    """
    return extract_function_name(node)
