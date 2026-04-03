"""
Code Graph RAG - Python Expression Analyzer

Analyzes complex Python expressions: chained method calls, attribute access,
comprehensions, and conditional expressions for call extraction.

Ported from codebase_rag/parsers/py/expression_analyzer.py.
"""
from __future__ import annotations

from loguru import logger
from typing import TYPE_CHECKING

from tree_sitter import Node

from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    pass




def extract_call_chain(node: Node) -> list[str]:
    """
    Extract a chain of method/function calls from an expression.

    Example: `foo.bar().baz()` → ['foo', 'bar', 'baz']

    @param node: AST expression node.
    @returns: List of called names in chain order.
    """
    chain: list[str] = []
    _walk_call_chain(node, chain)
    return chain


def _walk_call_chain(node: Node, chain: list[str]) -> None:
    """Recursively walk a call chain expression."""
    if node.type == "call":
        func = node.child_by_field_name("function")
        if func:
            if func.type == "attribute":
                attr = func.child_by_field_name("attribute")
                obj = func.child_by_field_name("object")
                if attr and attr.text:
                    chain.append(safe_decode_text(attr) or "")
                if obj:
                    _walk_call_chain(obj, chain)
            elif func.type == "identifier":
                if text := safe_decode_text(func):
                    chain.append(text)
    elif node.type == "attribute":
        attr = node.child_by_field_name("attribute")
        obj = node.child_by_field_name("object")
        if attr and attr.text:
            chain.append(safe_decode_text(attr) or "")
        if obj:
            _walk_call_chain(obj, chain)
    elif node.type == "identifier":
        if text := safe_decode_text(node):
            chain.append(text)


def analyze_comprehension(node: Node) -> dict[str, list[str]]:
    """
    Analyze a Python comprehension (list/dict/set/generator).

    @param node: Comprehension AST node.
    @returns: Dict with 'iterables' and 'conditions' lists.
    """
    result: dict[str, list[str]] = {"iterables": [], "conditions": []}

    for child in node.children:
        if child.type == "for_in_clause":
            iterable = child.child_by_field_name("iterable") or child.child_by_field_name("right")
            if iterable and iterable.text:
                if text := safe_decode_text(iterable):
                    result["iterables"].append(text)
        elif child.type == "if_clause":
            for cond_child in child.children:
                if cond_child.type not in ("if",) and cond_child.text:
                    if text := safe_decode_text(cond_child):
                        result["conditions"].append(text)

    return result


def extract_attribute_access(node: Node) -> list[str]:
    """
    Extract all attribute access chains from an expression.

    @param node: AST node.
    @returns: List of dot-separated attribute paths.
    """
    accesses: list[str] = []
    _walk_for_attributes(node, accesses)
    return accesses


def _walk_for_attributes(node: Node, accesses: list[str]) -> None:
    """Walk AST collecting attribute access patterns."""
    if node.type == "attribute":
        if text := safe_decode_text(node):
            accesses.append(text)
    for child in node.children:
        _walk_for_attributes(child, accesses)
