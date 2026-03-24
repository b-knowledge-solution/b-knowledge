"""
Code Graph RAG - Language Handler Protocol

Defines the protocol (interface) that all language-specific handlers must implement.
Ported from codebase_rag/parsers/handlers/protocol.py.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from pathlib import Path

    from tree_sitter import Node

    from ...language_spec import LanguageSpec


class LanguageHandler(Protocol):
    """Protocol defining the interface for language-specific AST handlers."""
    __slots__ = ()

    def is_inside_method_with_object_literals(self, node: Node) -> bool: ...

    def is_class_method(self, node: Node) -> bool: ...

    def is_export_inside_function(self, node: Node) -> bool: ...

    def extract_function_name(self, node: Node) -> str | None: ...

    def build_function_qualified_name(
        self,
        node: Node,
        module_qn: str,
        func_name: str,
        lang_config: LanguageSpec | None,
        file_path: Path | None,
        repo_path: Path,
        project_name: str,
    ) -> str: ...

    def is_function_exported(self, node: Node) -> bool: ...

    def should_process_as_impl_block(self, node: Node) -> bool: ...

    def extract_impl_target(self, node: Node) -> str | None: ...

    def build_method_qualified_name(
        self,
        class_qn: str,
        method_name: str,
        method_node: Node,
    ) -> str: ...

    def extract_base_class_name(self, base_node: Node) -> str | None: ...

    def build_nested_function_qn(
        self,
        func_node: Node,
        module_qn: str,
        func_name: str,
        lang_config: LanguageSpec,
    ) -> str | None: ...

    def extract_decorators(self, node: Node) -> list[str]: ...
