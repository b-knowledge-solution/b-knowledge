"""
Code Graph RAG - Parent Class Extraction

Language-specific extraction of parent/base classes from AST nodes.
Handles Python, Java, C++, JS/TS, and Rust inheritance patterns.

Ported from codebase_rag/parsers/class_ingest/parent_extraction.py.
"""
from __future__ import annotations

from loguru import logger
from collections.abc import Callable
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..parsers.utils import safe_decode_text
from .utils import find_child_by_type

if TYPE_CHECKING:
    from ..import_processor import ImportProcessor




def extract_parent_classes(
    class_node: Node,
    module_qn: str,
    import_processor: ImportProcessor | None,
    resolve_to_qn: Callable[[str, str], str],
) -> list[str]:
    """
    Extract parent classes based on the node type (dispatches by language).

    @param class_node: AST class node.
    @param module_qn: Module qualified name.
    @param import_processor: Import processor for resolving imports.
    @param resolve_to_qn: Function to resolve name → qualified name.
    @returns: List of parent class qualified names.
    """
    if class_node.type in cs.CPP_CLASS_TYPES:
        return extract_cpp_parent_classes(class_node, module_qn)

    parent_classes: list[str] = []

    # Java superclass
    if class_node.type == cs.TS_CLASS_DECLARATION:
        parent_classes.extend(
            extract_java_superclass(class_node, module_qn, resolve_to_qn)
        )

    # Python base classes
    parent_classes.extend(
        extract_python_superclasses(class_node, module_qn, resolve_to_qn)
    )

    # JS/TS heritage
    if class_heritage_node := find_child_by_type(class_node, cs.TS_CLASS_HERITAGE):
        parent_classes.extend(
            extract_js_ts_heritage_parents(
                class_heritage_node, module_qn, resolve_to_qn
            )
        )

    # Interface extends
    if class_node.type == cs.TS_INTERFACE_DECLARATION:
        parent_classes.extend(
            extract_interface_parents(class_node, module_qn, resolve_to_qn)
        )

    return parent_classes


# ---- C++ ----

def extract_cpp_parent_classes(class_node: Node, module_qn: str) -> list[str]:
    """Extract C++ base classes from base_class_clause children."""
    parent_classes: list[str] = []
    for child in class_node.children:
        if child.type == cs.TS_BASE_CLASS_CLAUSE:
            parent_classes.extend(parse_cpp_base_classes(child, class_node, module_qn))
    return parent_classes


def parse_cpp_base_classes(
    base_clause_node: Node, class_node: Node, module_qn: str
) -> list[str]:
    """Parse C++ base_class_clause to extract parent QNs."""
    from ..cpp import utils as cpp_utils
    parent_classes: list[str] = []
    base_type_nodes = (
        cs.TS_TYPE_IDENTIFIER,
        cs.CppNodeType.QUALIFIED_IDENTIFIER,
        cs.TS_TEMPLATE_TYPE,
    )

    for base_child in base_clause_node.children:
        if base_child.type in (
            cs.TS_ACCESS_SPECIFIER, cs.TS_VIRTUAL,
            cs.CHAR_COMMA, cs.CHAR_COLON,
        ):
            continue

        if base_child.type in base_type_nodes and base_child.text:
            if parent_name := safe_decode_text(base_child):
                # Strip template args
                base_name = parent_name.split(cs.CHAR_ANGLE_OPEN)[0] if cs.CHAR_ANGLE_OPEN in parent_name else parent_name
                if cs.SEPARATOR_DOUBLE_COLON in base_name:
                    base_name = base_name.split(cs.SEPARATOR_DOUBLE_COLON)[-1]
                parent_qn = cpp_utils.build_qualified_name(class_node, module_qn, base_name)
                parent_classes.append(parent_qn)

    return parent_classes


# ---- Java ----

def extract_java_superclass(
    class_node: Node,
    module_qn: str,
    resolve_to_qn: Callable[[str, str], str],
) -> list[str]:
    """Extract Java superclass from 'superclass' field."""
    superclass_node = class_node.child_by_field_name(cs.FIELD_SUPERCLASS)
    if not superclass_node:
        return []

    if superclass_node.type == cs.TS_TYPE_IDENTIFIER:
        if resolved := _resolve_type_identifier(superclass_node, module_qn, resolve_to_qn):
            return [resolved]
        return []

    for child in superclass_node.children:
        if child.type == cs.TS_TYPE_IDENTIFIER:
            if resolved := _resolve_type_identifier(child, module_qn, resolve_to_qn):
                return [resolved]
    return []


# ---- Python ----

def extract_python_superclasses(
    class_node: Node,
    module_qn: str,
    resolve_to_qn: Callable[[str, str], str],
) -> list[str]:
    """Extract Python base classes from argument_list of class_definition."""
    parent_classes: list[str] = []
    arg_list = class_node.child_by_field_name("superclasses")
    if not arg_list:
        return parent_classes

    for child in arg_list.children:
        if child.type == cs.TS_IDENTIFIER and child.text:
            if parent_name := safe_decode_text(child):
                parent_classes.append(resolve_to_qn(parent_name, module_qn))
        elif child.type == "attribute" and child.text:
            if parent_name := safe_decode_text(child):
                parent_classes.append(resolve_to_qn(parent_name, module_qn))

    return parent_classes


# ---- JS/TS ----

def extract_js_ts_heritage_parents(
    heritage_node: Node,
    module_qn: str,
    resolve_to_qn: Callable[[str, str], str],
) -> list[str]:
    """Extract JS/TS parents from class_heritage node."""
    parent_classes: list[str] = []
    for child in heritage_node.children:
        if child.type == cs.TS_IDENTIFIER and child.text:
            if parent_name := safe_decode_text(child):
                parent_classes.append(resolve_to_qn(parent_name, module_qn))
        elif child.type == cs.TS_TYPE_IDENTIFIER and child.text:
            if parent_name := safe_decode_text(child):
                parent_classes.append(resolve_to_qn(parent_name, module_qn))
    return parent_classes


def extract_interface_parents(
    class_node: Node,
    module_qn: str,
    resolve_to_qn: Callable[[str, str], str],
) -> list[str]:
    """Extract parent interfaces from extends clause."""
    parent_classes: list[str] = []
    for child in class_node.children:
        if child.type == "extends_type_clause":
            for type_child in child.children:
                if type_child.type == cs.TS_TYPE_IDENTIFIER and type_child.text:
                    if parent_name := safe_decode_text(type_child):
                        parent_classes.append(resolve_to_qn(parent_name, module_qn))
    return parent_classes


def extract_implemented_interfaces(
    class_node: Node,
    module_qn: str,
    resolve_to_qn: Callable[[str, str], str],
) -> list[str]:
    """Extract implemented interfaces from implements clause (Java/TS)."""
    interfaces: list[str] = []
    for child in class_node.children:
        if child.type in ("implements_clause", "super_interfaces"):
            for type_child in child.children:
                if type_child.type == cs.TS_TYPE_IDENTIFIER and type_child.text:
                    if interface_name := safe_decode_text(type_child):
                        interfaces.append(resolve_to_qn(interface_name, module_qn))
    return interfaces


# ---- Helpers ----

def _resolve_type_identifier(
    type_node: Node,
    module_qn: str,
    resolve_to_qn: Callable[[str, str], str],
) -> str | None:
    """Resolve a type_identifier node to a qualified name."""
    if type_node.text:
        if parent_name := safe_decode_text(type_node):
            return resolve_to_qn(parent_name, module_qn)
    return None
