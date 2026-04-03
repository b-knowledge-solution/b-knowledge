"""
Code Graph RAG - Memgraph Client

Bolt-protocol client for writing code knowledge graph to Memgraph.
Implements IngestorProtocol with batched writes.
"""
from __future__ import annotations

import os
from loguru import logger

from .models import GraphNode, GraphRelationship
from . import logs as ls



# Batch size for Memgraph writes
BATCH_SIZE = 1000


class MemgraphIngestor:
    """
    Writes code graph nodes and relationships to Memgraph via Bolt protocol.
    Implements IngestorProtocol with batched MERGE operations.

    @param bolt_url: Bolt protocol URL (e.g., 'bolt://localhost:7687').
    @param kb_id: Knowledge base ID for tenant isolation.
    """

    def __init__(self, bolt_url: str | None = None, kb_id: str = "") -> None:
        self.bolt_url = bolt_url or os.environ.get("MEMGRAPH_BOLT_URL", "bolt://localhost:7687")
        self.kb_id = kb_id
        self._driver = None
        self._node_batch: list[GraphNode] = []
        self._rel_batch: list[GraphRelationship] = []

    def _get_driver(self):
        """Lazy-initialize the neo4j driver."""
        if self._driver is None:
            try:
                import neo4j
                logger.info(ls.LOG_MEMGRAPH_CONNECTING.format(self.bolt_url))
                self._driver = neo4j.GraphDatabase.driver(self.bolt_url)
            except ImportError:
                raise ImportError(
                    "neo4j package is required for Memgraph. "
                    "Install with: pip install neo4j>=5.0.0"
                )
        return self._driver

    def ensure_node(self, node: GraphNode) -> None:
        """
        Add a node to the write batch.
        Automatically adds kb_id property for tenant isolation.

        @param node: GraphNode to write to Memgraph.
        """
        # Inject kb_id into properties
        node.properties["kb_id"] = self.kb_id
        self._node_batch.append(node)

        # Auto-flush when batch is full
        if len(self._node_batch) >= BATCH_SIZE:
            self._flush_nodes()

    def ensure_relationship(self, rel: GraphRelationship) -> None:
        """
        Add a relationship to the write batch.

        @param rel: GraphRelationship to write to Memgraph.
        """
        self._rel_batch.append(rel)

        # Auto-flush when batch is full
        if len(self._rel_batch) >= BATCH_SIZE:
            self._flush_relationships()

    def flush(self) -> None:
        """Flush all remaining batched nodes and relationships to Memgraph."""
        if self._node_batch:
            self._flush_nodes()
        if self._rel_batch:
            self._flush_relationships()

    def _flush_nodes(self) -> None:
        """Write batched nodes to Memgraph using MERGE."""
        if not self._node_batch:
            return

        driver = self._get_driver()
        logger.info(ls.LOG_MEMGRAPH_FLUSHING.format(len(self._node_batch), 0))

        with driver.session() as session:
            for node in self._node_batch:
                try:
                    # Build label string (e.g., ":Function:Method")
                    labels = ":".join(node.labels)
                    # Use qualified_name as unique key
                    qn = node.properties.get("qualified_name", node.node_id)

                    cypher = f"""
                        MERGE (n:{labels} {{qualified_name: $qn, kb_id: $kb_id}})
                        SET n += $props
                    """
                    session.run(cypher, {
                        "qn": qn,
                        "kb_id": self.kb_id,
                        "props": {k: v for k, v in node.properties.items()
                                  if v is not None},
                    })
                except Exception as e:
                    logger.warning(ls.LOG_MEMGRAPH_ERROR.format(str(e)))

        self._node_batch.clear()

    def _flush_relationships(self) -> None:
        """Write batched relationships to Memgraph using MERGE."""
        if not self._rel_batch:
            return

        driver = self._get_driver()
        logger.info(ls.LOG_MEMGRAPH_FLUSHING.format(0, len(self._rel_batch)))

        with driver.session() as session:
            for rel in self._rel_batch:
                try:
                    cypher = f"""
                        MATCH (a {{qualified_name: $from_qn, kb_id: $kb_id}})
                        MATCH (b {{qualified_name: $to_qn, kb_id: $kb_id}})
                        MERGE (a)-[r:{rel.rel_type}]->(b)
                    """
                    params = {
                        "from_qn": rel.from_id,
                        "to_qn": rel.to_id,
                        "kb_id": self.kb_id,
                    }
                    # Add edge properties if any
                    if rel.properties:
                        props_str = ", ".join(
                            f"r.{k} = ${k}" for k in rel.properties
                            if rel.properties[k] is not None
                        )
                        if props_str:
                            cypher += f" SET {props_str}"
                            params.update({
                                k: v for k, v in rel.properties.items()
                                if v is not None
                            })

                    session.run(cypher, params)
                except Exception as e:
                    logger.warning(ls.LOG_MEMGRAPH_ERROR.format(str(e)))

        self._rel_batch.clear()

    def clear_kb(self) -> None:
        """
        Delete all nodes and relationships for this kb_id.
        Used before re-ingesting a knowledge base.
        """
        driver = self._get_driver()
        with driver.session() as session:
            session.run(
                "MATCH (n {kb_id: $kb_id}) DETACH DELETE n",
                {"kb_id": self.kb_id},
            )
        logger.info(f"Cleared code graph for kb_id={self.kb_id}")

    def close(self) -> None:
        """Close the Bolt driver connection."""
        if self._driver is not None:
            self._driver.close()
            self._driver = None
