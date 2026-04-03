"""
Code Graph RAG - Java Language Handler

Handles Java-specific patterns: annotation decorator extraction and
method qualified name building with parameter signatures.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from .base import BaseLanguageHandler

if TYPE_CHECKING:
    from tree_sitter import Node


class JavaHandler(BaseLanguageHandler):
    """Java specific handler."""
    __slots__ = ()

    def extract_decorators(self, node: Node) -> list[str]:
        """Extract Java annotations from modifiers node."""
        from ..java import utils as java_utils
        return java_utils.extract_annotations(node)

    def build_method_qualified_name(
        self,
        class_qn: str,
        method_name: str,
        method_node: Node,
    ) -> str:
        """Build Java method QN including parameter type signature."""
        from ..java import utils as java_utils
        if (method_info := java_utils.extract_method_info(method_node)) and method_info.get(
            cs.FIELD_PARAMETERS
        ):
            param_sig = cs.SEPARATOR_COMMA_SPACE.join(method_info[cs.FIELD_PARAMETERS])
            return f"{class_qn}{cs.SEPARATOR_DOT}{method_name}({param_sig})"
        return f"{class_qn}{cs.SEPARATOR_DOT}{method_name}"
