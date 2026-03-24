"""
Code Graph RAG - C++ Language Handler

Handles C++ specific patterns: function naming (including lambda),
qualified name building with namespace resolution, and export detection.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from ..parsers.utils import safe_decode_text
from .base import BaseLanguageHandler

if TYPE_CHECKING:
    from pathlib import Path

    from tree_sitter import Node

    from ..language_spec import LanguageSpec


class CppHandler(BaseLanguageHandler):
    """C++ specific handler."""
    __slots__ = ()

    def extract_function_name(self, node: Node) -> str | None:
        """Extract C++ function name, using cpp utils or lambda naming."""
        from ..cpp import utils as cpp_utils
        if func_name := cpp_utils.extract_function_name(node):
            return func_name

        if node.type == cs.TS_CPP_LAMBDA_EXPRESSION:
            return f"lambda_{node.start_point[0]}_{node.start_point[1]}"

        return None

    def build_function_qualified_name(
        self,
        node: Node,
        module_qn: str,
        func_name: str,
        lang_config: LanguageSpec | None,
        file_path: Path | None,
        repo_path: Path,
        project_name: str,
    ) -> str:
        """Build C++ qualified name using namespace resolution."""
        from ..cpp import utils as cpp_utils
        return cpp_utils.build_qualified_name(node, module_qn, func_name)

    def is_function_exported(self, node: Node) -> bool:
        """Check if C++ function is exported (public / extern)."""
        from ..cpp import utils as cpp_utils
        return cpp_utils.is_exported(node)

    def extract_base_class_name(self, base_node: Node) -> str | None:
        """Extract base class name, handling template types."""
        if base_node.type == cs.TS_TEMPLATE_TYPE:
            if (
                name_node := base_node.child_by_field_name(cs.TS_FIELD_NAME)
            ) and name_node.text:
                return safe_decode_text(name_node)

        return safe_decode_text(base_node) if base_node.text else None
