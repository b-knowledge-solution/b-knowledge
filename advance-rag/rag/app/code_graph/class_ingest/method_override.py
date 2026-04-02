"""
Code Graph RAG - Method Override Detection

BFS-based detection of method overrides through class inheritance chains.
Creates OVERRIDES relationships in the graph.

Ported from codebase_rag/parsers/class_ingest/method_override.py.
"""
from __future__ import annotations

from loguru import logger
from collections import deque
from typing import TYPE_CHECKING

from .. import constants as cs
from ..models import GraphRelationship
from ..types_defs import NodeType

if TYPE_CHECKING:
    from ..services import IngestorProtocol
    from ..types_defs import FunctionRegistryTrieProtocol




def process_all_method_overrides(
    function_registry: FunctionRegistryTrieProtocol,
    class_inheritance: dict[str, list[str]],
    ingestor: IngestorProtocol,
) -> None:
    """
    Scan all methods in the function registry and detect overrides
    by walking inheritance chains via BFS.

    @param function_registry: Map of qualified_name → NodeType string.
    @param class_inheritance: Map of class_qn → [parent_class_qn].
    @param ingestor: Graph ingestor to create OVERRIDES edges.
    """
    logger.info("Pass 4: Detecting method overrides...")

    for method_qn in list(function_registry.keys()):
        if (
            function_registry[method_qn] == NodeType.METHOD
            and cs.SEPARATOR_DOT in method_qn
        ):
            parts = method_qn.rsplit(cs.SEPARATOR_DOT, 1)
            if len(parts) == 2:
                class_qn, method_name = parts
                check_method_overrides(
                    method_qn,
                    method_name,
                    class_qn,
                    function_registry,
                    class_inheritance,
                    ingestor,
                )


def check_method_overrides(
    method_qn: str,
    method_name: str,
    class_qn: str,
    function_registry: FunctionRegistryTrieProtocol,
    class_inheritance: dict[str, list[str]],
    ingestor: IngestorProtocol,
) -> None:
    """
    Check if a method overrides a parent method via BFS through inheritance.

    @param method_qn: The method's qualified name.
    @param method_name: The method's simple name.
    @param class_qn: The owning class's qualified name.
    @param function_registry: Function registry.
    @param class_inheritance: Inheritance map.
    @param ingestor: Graph ingestor.
    """
    if class_qn not in class_inheritance:
        return

    queue = deque([class_qn])
    visited = {class_qn}

    while queue:
        current_class = queue.popleft()

        if current_class != class_qn:
            parent_method_qn = f"{current_class}.{method_name}"

            if parent_method_qn in function_registry:
                ingestor.ensure_relationship(GraphRelationship(
                    source_label=cs.NodeLabel.METHOD,
                    source_key=cs.KEY_QUALIFIED_NAME,
                    source_value=method_qn,
                    target_label=cs.NodeLabel.METHOD,
                    target_key=cs.KEY_QUALIFIED_NAME,
                    target_value=parent_method_qn,
                    rel_type=cs.RelationshipType.OVERRIDES,
                ))
                logger.debug(f"Override: {method_qn} → {parent_method_qn}")
                return

        if current_class in class_inheritance:
            for parent_class_qn in class_inheritance[current_class]:
                if parent_class_qn not in visited:
                    visited.add(parent_class_qn)
                    queue.append(parent_class_qn)
