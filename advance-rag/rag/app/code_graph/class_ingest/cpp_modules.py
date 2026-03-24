"""
Code Graph RAG - C++ Module Declaration Ingestion

Handles C++ module/namespace declarations and exported class discovery.

Ported from codebase_rag/parsers/class_ingest/cpp_modules.py.
"""
from __future__ import annotations

from loguru import logger
from pathlib import Path
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..models import GraphNode, GraphRelationship
from ..parsers.utils import safe_decode_text

if TYPE_CHECKING:
    from ..services import IngestorProtocol




def ingest_cpp_module_declarations(
    root_node: Node,
    module_qn: str,
    file_path: Path,
    repo_path: Path,
    project_name: str,
    ingestor: IngestorProtocol,
) -> None:
    """
    Ingest C++ namespace/module declarations as graph nodes.

    @param root_node: AST root node.
    @param module_qn: Module qualified name.
    @param file_path: Source file path.
    @param repo_path: Repository root path.
    @param project_name: Project name.
    @param ingestor: Graph ingestor.
    """
    for child in root_node.children:
        if child.type == cs.CppNodeType.NAMESPACE_DEFINITION:
            name_node = child.child_by_field_name(cs.FIELD_NAME)
            if name_node and name_node.text:
                ns_name = safe_decode_text(name_node)
                if ns_name:
                    ns_qn = f"{module_qn}{cs.SEPARATOR_DOT}{ns_name}"
                    ingestor.ensure_node(GraphNode(
                        labels=[cs.NodeLabel.PACKAGE],
                        properties={
                            cs.KEY_QUALIFIED_NAME: ns_qn,
                            cs.KEY_NAME: ns_name,
                            cs.KEY_PATH: file_path.relative_to(repo_path).as_posix(),
                        },
                    ))
                    ingestor.ensure_relationship(GraphRelationship(
                        source_label=cs.NodeLabel.MODULE,
                        source_key=cs.KEY_QUALIFIED_NAME,
                        source_value=module_qn,
                        target_label=cs.NodeLabel.PACKAGE,
                        target_key=cs.KEY_QUALIFIED_NAME,
                        target_value=ns_qn,
                        rel_type=cs.RelationshipType.CONTAINS_PACKAGE,
                    ))
                    logger.info(f"C++ namespace: {ns_name} ({ns_qn})")

                    # Recurse into the namespace body
                    if body := child.child_by_field_name(cs.FIELD_BODY):
                        ingest_cpp_module_declarations(
                            body, ns_qn, file_path, repo_path, project_name, ingestor
                        )


def find_cpp_exported_classes(root_node: Node) -> list[Node]:
    """
    Find C++ function_definition nodes that represent exported classes
    (extern declarations or top-level definitions).

    @param root_node: AST root node.
    @returns: List of exported class AST nodes.
    """
    exported: list[Node] = []
    for child in root_node.children:
        if child.type == cs.CppNodeType.FUNCTION_DEFINITION:
            text = safe_decode_text(child)
            if text and "extern" in text[:200]:
                exported.append(child)
    return exported
