"""
Code Graph RAG - Java Utilities

Java-specific AST helpers: annotation extraction and method info extraction.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from tree_sitter import Node


def extract_annotations(node: Node) -> list[str]:
    """
    Extract Java annotations from modifiers node.

    @param node: Java method/class AST node.
    @returns: List of annotation strings (e.g. '@Override').
    """
    annotations: list[str] = []
    for child in node.children:
        if child.type == cs.TS_JAVA_MODIFIERS:
            for modifier_child in child.children:
                if modifier_child.type == "marker_annotation":
                    if text := safe_decode_text(modifier_child):
                        annotations.append(text)
                elif modifier_child.type == "annotation":
                    if text := safe_decode_text(modifier_child):
                        annotations.append(text)
    return annotations


def extract_method_info(method_node: Node) -> dict[str, list[str]] | None:
    """
    Extract method parameter type info from a Java method node.

    @param method_node: Java method AST node.
    @returns: Dict with 'parameters' key containing type strings, or None.
    """
    params_node = method_node.child_by_field_name(cs.FIELD_PARAMETERS)
    if not params_node:
        return None

    param_types: list[str] = []
    for child in params_node.children:
        if child.type == "formal_parameter":
            type_node = child.child_by_field_name("type")
            if type_node and type_node.text:
                if type_text := safe_decode_text(type_node):
                    param_types.append(type_text)

    return {cs.FIELD_PARAMETERS: param_types} if param_types else None


def find_package_start_index(parts: list[str]) -> int | None:
    """
    Find the starting index of the Java package path in a QN parts list.

    For a module QN like 'project.com.example.MyClass', identifies
    that the package starts at index 1 (com.example.MyClass).

    @param parts: QN split by dots.
    @returns: Starting index or None if not identifiable.
    """
    # Common Java package prefixes
    java_package_prefixes = {
        "com", "org", "net", "io", "dev", "me",
        "java", "javax", "jakarta",
    }

    for i, part in enumerate(parts):
        if part.lower() in java_package_prefixes:
            return i

    # If no known prefix, return 0 for single-level or 1 for multi-level
    if len(parts) >= 2:
        return 0
    return None

