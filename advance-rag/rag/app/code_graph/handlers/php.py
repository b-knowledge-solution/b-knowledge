"""
Code Graph RAG - PHP Language Handler

Handles PHP-specific patterns: class method detection, anonymous/arrow function
naming, visibility-based export detection, and PHP attribute decorators.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from ..parsers.utils import safe_decode_text
from .base import BaseLanguageHandler

if TYPE_CHECKING:
    from tree_sitter import Node


class PhpHandler(BaseLanguageHandler):
    """PHP specific handler."""
    __slots__ = ()

    _CLASS_LIKE_TYPES = frozenset({
        cs.TS_CLASS_DECLARATION,
        cs.TS_INTERFACE_DECLARATION,
        cs.TS_PHP_TRAIT_DECLARATION,
        cs.TS_ENUM_DECLARATION,
    })

    def is_class_method(self, node: Node) -> bool:
        """Check if node is inside a PHP class/interface/trait."""
        parent = node.parent
        while parent:
            if parent.type in self._CLASS_LIKE_TYPES:
                return True
            parent = parent.parent
        return False

    def extract_function_name(self, node: Node) -> str | None:
        """Extract PHP function name, handling anonymous/arrow functions."""
        if node.type == cs.TS_PHP_ANONYMOUS_FUNCTION:
            return f"anonymous_{node.start_point[0]}_{node.start_point[1]}"
        if node.type == cs.TS_PHP_ARROW_FUNCTION:
            return f"arrow_{node.start_point[0]}_{node.start_point[1]}"
        name_node = node.child_by_field_name(cs.TS_FIELD_NAME)
        if name_node and name_node.text:
            return safe_decode_text(name_node)
        return None

    def is_function_exported(self, node: Node) -> bool:
        """Check if PHP method is exported (public visibility)."""
        if node.type != cs.TS_PHP_METHOD_DECLARATION:
            return True
        for child in node.children:
            if child.type == cs.TS_PHP_VISIBILITY_MODIFIER:
                text = safe_decode_text(child)
                return text == "public"
        return True

    def extract_decorators(self, node: Node) -> list[str]:
        """Extract PHP attribute decorators (#[...])."""
        decorators: list[str] = []
        for child in node.children:
            if child.type == cs.TS_PHP_ATTRIBUTE_LIST:
                for group in child.children:
                    if group.type == cs.TS_PHP_ATTRIBUTE_GROUP:
                        for attr in group.children:
                            if attr.type == cs.TS_PHP_ATTRIBUTE:
                                if text := safe_decode_text(attr):
                                    decorators.append(text)
        return decorators
