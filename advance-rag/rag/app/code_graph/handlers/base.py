"""
Code Graph RAG - Base Language Handler

Default (no-op) implementations for the LanguageHandler protocol.
Language-specific handlers override only what they need.

Ported from codebase_rag/parsers/handlers/base.py.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from .. import constants as cs
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from pathlib import Path

    from tree_sitter import Node

    from ..language_spec import LanguageSpec


class BaseLanguageHandler:
    """Default handler — returns safe no-op values for every hook."""
    __slots__ = ()

    def is_inside_method_with_object_literals(self, node: Node) -> bool:
        return False

    def is_class_method(self, node: Node) -> bool:
        return False

    def is_export_inside_function(self, node: Node) -> bool:
        return False

    def extract_function_name(self, node: Node) -> str | None:
        """Extract function name from AST 'name' field."""
        if (name_node := node.child_by_field_name(cs.TS_FIELD_NAME)) and name_node.text:
            return safe_decode_text(name_node)
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
        return f"{module_qn}{cs.SEPARATOR_DOT}{func_name}"

    def is_function_exported(self, node: Node) -> bool:
        return False

    def should_process_as_impl_block(self, node: Node) -> bool:
        return False

    def extract_impl_target(self, node: Node) -> str | None:
        return None

    def build_method_qualified_name(
        self,
        class_qn: str,
        method_name: str,
        method_node: Node,
    ) -> str:
        return f"{class_qn}{cs.SEPARATOR_DOT}{method_name}"

    def extract_base_class_name(self, base_node: Node) -> str | None:
        return safe_decode_text(base_node) if base_node.text else None

    def extract_decorators(self, node: Node) -> list[str]:
        return []

    def build_nested_function_qn(
        self,
        func_node: Node,
        module_qn: str,
        func_name: str,
        lang_config: LanguageSpec,
    ) -> str | None:
        """Build nested function QN by walking ancestor chain."""
        if (
            path_parts := self._collect_ancestor_path_parts(func_node, lang_config)
        ) is None:
            return None
        return self._format_nested_qn(module_qn, path_parts, func_name)

    def _collect_ancestor_path_parts(
        self,
        func_node: Node,
        lang_config: LanguageSpec,
    ) -> list[str] | None:
        path_parts: list[str] = []
        current = func_node.parent

        while current and current.type not in lang_config.module_node_types:
            if current.type in lang_config.function_node_types:
                if name := self._extract_node_name(current):
                    path_parts.append(name)
            elif current.type in lang_config.class_node_types:
                return None
            current = current.parent

        path_parts.reverse()
        return path_parts

    def _extract_node_name(self, node: Node) -> str | None:
        if (name_node := node.child_by_field_name(cs.TS_FIELD_NAME)) and name_node.text:
            return safe_decode_text(name_node)
        return None

    def _format_nested_qn(
        self, module_qn: str, path_parts: list[str], func_name: str
    ) -> str:
        if path_parts:
            return f"{module_qn}{cs.SEPARATOR_DOT}{cs.SEPARATOR_DOT.join(path_parts)}{cs.SEPARATOR_DOT}{func_name}"
        return f"{module_qn}{cs.SEPARATOR_DOT}{func_name}"
