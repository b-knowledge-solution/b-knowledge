"""
Code Graph RAG - Python Language Handler

Handles Python-specific decorator extraction from decorated_definition nodes.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from ..parsers.utils import safe_decode_text
from .base import BaseLanguageHandler

if TYPE_CHECKING:
    from tree_sitter import Node


class PythonHandler(BaseLanguageHandler):
    """Python-specific handler."""
    __slots__ = ()

    def extract_decorators(self, node: Node) -> list[str]:
        """Extract @decorators from a Python decorated_definition parent."""
        if not node.parent or node.parent.type != cs.TS_PY_DECORATED_DEFINITION:
            return []
        return [
            decorator_text
            for child in node.parent.children
            if child.type == cs.TS_PY_DECORATOR
            if (decorator_text := safe_decode_text(child))
        ]
