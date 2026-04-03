"""
Code Graph RAG - Schema Builder

Builds Memgraph schema constraints and indexes for the code knowledge graph.
Creates uniqueness constraints and indexes for performance.

Ported from codebase_rag/services/schema_builder.py.
"""
from __future__ import annotations

from loguru import logger

from .constants import NodeLabel, RelationshipType



# Node labels that should have qualified_name uniqueness constraints
_INDEXED_LABELS = [
    NodeLabel.PROJECT,
    NodeLabel.FOLDER,
    NodeLabel.PACKAGE,
    NodeLabel.MODULE,
    NodeLabel.FILE,
    NodeLabel.FUNCTION,
    NodeLabel.METHOD,
    NodeLabel.CLASS,
    NodeLabel.INTERFACE,
    NodeLabel.ENUM,
    NodeLabel.TRAIT,
    NodeLabel.STRUCT,
    NodeLabel.TYPE,
    NodeLabel.UNION,
]


def build_schema_queries() -> list[str]:
    """
    Generate Cypher queries to create indexes and constraints.

    @returns: List of Cypher query strings.
    """
    queries: list[str] = []

    # Uniqueness constraints on qualified_name for each node label
    for label in _INDEXED_LABELS:
        queries.append(
            f"CREATE CONSTRAINT ON (n:{label}) ASSERT n.qualified_name IS UNIQUE;"
        )

    # Index on kb_id for multi-tenancy filtering
    for label in _INDEXED_LABELS:
        queries.append(
            f"CREATE INDEX ON :{label}(kb_id);"
        )

    # Index on name for search
    for label in _INDEXED_LABELS:
        queries.append(
            f"CREATE INDEX ON :{label}(name);"
        )

    # Dependency label
    queries.append(
        "CREATE INDEX ON :Dependency(qualified_name);"
    )
    queries.append(
        "CREATE INDEX ON :Dependency(name);"
    )

    return queries


def apply_schema(session_run_fn) -> int:
    """
    Apply schema constraints and indexes via a session.run function.

    @param session_run_fn: Function that takes a Cypher query string and executes it.
    @returns: Number of queries applied.
    """
    queries = build_schema_queries()
    applied = 0
    for query in queries:
        try:
            session_run_fn(query)
            applied += 1
        except Exception as e:
            # Constraints/indexes may already exist
            logger.debug(f"Schema query skipped (may exist): {e}")

    logger.info(f"Applied {applied}/{len(queries)} schema queries")
    return applied
