"""
Code Graph RAG - Class Relationship Building

Creates DEFINES, INHERITS, IMPLEMENTS, and EXPORTS relationships
between classes and their parent types in the graph.

Ported from codebase_rag/parsers/class_ingest/relationships.py.
"""
from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING

from tree_sitter import Node

from .. import constants as cs
from ..models import GraphRelationship
from ..types_defs import NodeType
from . import parent_extraction as pe

if TYPE_CHECKING:
    from ..services import IngestorProtocol
    from ..types_defs import FunctionRegistryTrieProtocol
    from ..import_processor import ImportProcessor


def create_class_relationships(
    class_node: Node,
    class_qn: str,
    module_qn: str,
    node_type: str,
    is_exported: bool,
    language: cs.SupportedLanguage,
    class_inheritance: dict[str, list[str]],
    ingestor: IngestorProtocol,
    import_processor: ImportProcessor | None,
    resolve_to_qn: Callable[[str, str], str],
    function_registry: FunctionRegistryTrieProtocol,
) -> None:
    """
    Create all graph relationships for a class node.

    @param class_node: AST class node.
    @param class_qn: Class qualified name.
    @param module_qn: Module QN.
    @param node_type: NodeType string.
    @param is_exported: Whether the class is exported.
    @param language: Source language.
    @param class_inheritance: Mutable dict tracking inheritance chains.
    @param ingestor: Graph ingestor.
    @param import_processor: Import processor.
    @param resolve_to_qn: QN resolver function.
    @param function_registry: Function registry.
    """
    parent_classes = pe.extract_parent_classes(
        class_node, module_qn, import_processor, resolve_to_qn
    )
    class_inheritance[class_qn] = parent_classes

    # Module DEFINES class
    ingestor.ensure_relationship(GraphRelationship(
        source_label=cs.NodeLabel.MODULE,
        source_key=cs.KEY_QUALIFIED_NAME,
        source_value=module_qn,
        target_label=node_type,
        target_key=cs.KEY_QUALIFIED_NAME,
        target_value=class_qn,
        rel_type=cs.RelationshipType.DEFINES,
    ))

    # Exported class (C++)
    if is_exported and language == cs.SupportedLanguage.CPP:
        ingestor.ensure_relationship(GraphRelationship(
            source_label=cs.NodeLabel.MODULE,
            source_key=cs.KEY_QUALIFIED_NAME,
            source_value=module_qn,
            target_label=node_type,
            target_key=cs.KEY_QUALIFIED_NAME,
            target_value=class_qn,
            rel_type=cs.RelationshipType.EXPORTS,
        ))

    # Inheritance relationships
    for parent_class_qn in parent_classes:
        create_inheritance_relationship(
            node_type, class_qn, parent_class_qn, function_registry, ingestor
        )

    # Implements interfaces (Java/TS)
    if class_node.type == cs.TS_CLASS_DECLARATION:
        for interface_qn in pe.extract_implemented_interfaces(
            class_node, module_qn, resolve_to_qn
        ):
            create_implements_relationship(node_type, class_qn, interface_qn, ingestor)


def create_inheritance_relationship(
    child_node_type: str,
    child_qn: str,
    parent_qn: str,
    function_registry: FunctionRegistryTrieProtocol,
    ingestor: IngestorProtocol,
) -> None:
    """Create an INHERITS relationship between child and parent class."""
    parent_type = function_registry.get(parent_qn, NodeType.CLASS) or NodeType.CLASS
    ingestor.ensure_relationship(GraphRelationship(
        source_label=child_node_type,
        source_key=cs.KEY_QUALIFIED_NAME,
        source_value=child_qn,
        target_label=parent_type,
        target_key=cs.KEY_QUALIFIED_NAME,
        target_value=parent_qn,
        rel_type=cs.RelationshipType.INHERITS,
    ))


def create_implements_relationship(
    class_type: str,
    class_qn: str,
    interface_qn: str,
    ingestor: IngestorProtocol,
) -> None:
    """Create an IMPLEMENTS relationship between class and interface."""
    ingestor.ensure_relationship(GraphRelationship(
        source_label=class_type,
        source_key=cs.KEY_QUALIFIED_NAME,
        source_value=class_qn,
        target_label=cs.NodeLabel.INTERFACE,
        target_key=cs.KEY_QUALIFIED_NAME,
        target_value=interface_qn,
        rel_type=cs.RelationshipType.IMPLEMENTS,
    ))
