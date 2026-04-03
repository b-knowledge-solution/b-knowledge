"""
Code Graph RAG - Rust Language Handler

Handles Rust-specific patterns: attribute decorators (#[...]),
module path QN building, and impl block detection.
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


class RustHandler(BaseLanguageHandler):
    """Rust specific handler."""
    __slots__ = ()

    def extract_decorators(self, node: Node) -> list[str]:
        """Extract Rust outer + inner attributes as decorators."""
        # Outer attributes: previous siblings
        outer_decorators: list[str] = []
        sibling = node.prev_named_sibling
        while sibling and sibling.type == cs.TS_RS_ATTRIBUTE_ITEM:
            if attr_text := safe_decode_text(sibling):
                outer_decorators.append(attr_text)
            sibling = sibling.prev_named_sibling

        decorators = list(reversed(outer_decorators))

        # Inner attributes: inside the node body
        nodes_to_search = [node]
        if body_node := node.child_by_field_name(cs.FIELD_BODY):
            nodes_to_search.append(body_node)

        for search_node in nodes_to_search:
            decorators.extend(
                attr_text
                for child in search_node.children
                if child.type == cs.TS_RS_INNER_ATTRIBUTE_ITEM
                if (attr_text := safe_decode_text(child))
            )

        return decorators

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
        """Build Rust QN using module path walking."""
        from ..rs import utils as rs_utils
        if path_parts := rs_utils.build_module_path(node):
            return f"{module_qn}{cs.SEPARATOR_DOT}{cs.SEPARATOR_DOT.join(path_parts)}{cs.SEPARATOR_DOT}{func_name}"
        return f"{module_qn}{cs.SEPARATOR_DOT}{func_name}"

    def should_process_as_impl_block(self, node: Node) -> bool:
        """Check if node is an impl block."""
        return node.type == cs.TS_IMPL_ITEM

    def extract_impl_target(self, node: Node) -> str | None:
        """Extract the target type name from an impl block."""
        from ..rs import utils as rs_utils
        return rs_utils.extract_impl_target(node)
