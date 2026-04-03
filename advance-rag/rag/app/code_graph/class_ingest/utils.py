"""
Code Graph RAG - Class Ingest Utilities

Small helper functions shared across the class ingestion sub-package.
Ported from codebase_rag/parsers/class_ingest/utils.py.
"""
from __future__ import annotations

from tree_sitter import Node

from ..parsers.utils import safe_decode_with_fallback


def decode_node_stripped(node: Node) -> str:
    """Decode node text and strip whitespace."""
    return safe_decode_with_fallback(node).strip() if node.text else ""


def find_child_by_type(node: Node, node_type: str) -> Node | None:
    """Find first direct child with the given AST node type."""
    return next((c for c in node.children if c.type == node_type), None)
