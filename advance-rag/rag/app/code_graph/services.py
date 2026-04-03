"""
Code Graph RAG - Services

Ingestor protocol and Memgraph implementation for writing
code graph nodes and relationships to the graph database.
"""
from __future__ import annotations

import os
from loguru import logger
from typing import Protocol

from .models import GraphNode, GraphRelationship





class IngestorProtocol(Protocol):
    """
    Protocol for graph database ingestors.
    Implementations batch nodes and relationships for efficient writes.
    """
    def ensure_node(self, node: GraphNode) -> None: ...
    def ensure_relationship(self, rel: GraphRelationship) -> None: ...
    def flush(self) -> None: ...
    def close(self) -> None: ...


class InMemoryIngestor:
    """
    In-memory ingestor for testing.
    Stores nodes and relationships in lists.

    @description Used for unit tests — no Memgraph required.
    """

    def __init__(self) -> None:
        self.nodes: list[GraphNode] = []
        self.relationships: list[GraphRelationship] = []

    def ensure_node(self, node: GraphNode) -> None:
        """Add a node to the in-memory store."""
        self.nodes.append(node)

    def ensure_relationship(self, rel: GraphRelationship) -> None:
        """Add a relationship to the in-memory store."""
        self.relationships.append(rel)

    def flush(self) -> None:
        """No-op for in-memory store."""
        pass

    def close(self) -> None:
        """No-op for in-memory store."""
        pass
