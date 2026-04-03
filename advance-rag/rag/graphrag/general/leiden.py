# Copyright (c) 2024 Microsoft Corporation.
# Licensed under the MIT License
"""Leiden community detection for GraphRAG knowledge graphs.

This module provides hierarchical community detection using the Leiden algorithm
(via graspologic) on knowledge graphs. It handles graph stabilization, node name
normalization, largest-connected-component extraction, and multi-level community
assignment with weight-based scoring.

The detected communities are used downstream for generating community reports
that summarize topical clusters within the knowledge graph.

Reference:
 - [graphrag](https://github.com/microsoft/graphrag)
"""

import logging
import html
from typing import Any, cast
from graspologic.partition import hierarchical_leiden
from graspologic.utils import largest_connected_component
import networkx as nx
from networkx import is_empty


def _stabilize_graph(graph: nx.Graph) -> nx.Graph:
    """Ensure an undirected graph with the same relationships will always be read the same way.

    Sorts nodes and edges deterministically so that identical graphs always
    produce the same node/edge ordering, preventing non-determinism in
    downstream algorithms.

    Args:
        graph: The input graph to stabilize.

    Returns:
        A new graph with deterministically ordered nodes and edges.
    """
    fixed_graph = nx.DiGraph() if graph.is_directed() else nx.Graph()

    sorted_nodes = graph.nodes(data=True)
    sorted_nodes = sorted(sorted_nodes, key=lambda x: x[0])

    fixed_graph.add_nodes_from(sorted_nodes)
    edges = list(graph.edges(data=True))

    # For undirected graphs, sort source/target within each edge to ensure
    # consistent ordering regardless of insertion order
    if not graph.is_directed():

        def _sort_source_target(edge):
            source, target, edge_data = edge
            if source > target:
                temp = source
                source = target
                target = temp
            return source, target, edge_data

        edges = [_sort_source_target(edge) for edge in edges]

    def _get_edge_key(source: Any, target: Any) -> str:
        return f"{source} -> {target}"

    edges = sorted(edges, key=lambda x: _get_edge_key(x[0], x[1]))

    fixed_graph.add_edges_from(edges)
    return fixed_graph


def normalize_node_names(graph: nx.Graph | nx.DiGraph) -> nx.Graph | nx.DiGraph:
    """Normalize node names by unescaping HTML entities, uppercasing, and stripping whitespace.

    Args:
        graph: The graph whose node names should be normalized.

    Returns:
        A new graph with renamed nodes.
    """
    node_mapping = {node: html.unescape(node.upper().strip()) for node in graph.nodes()}  # type: ignore
    return nx.relabel_nodes(graph, node_mapping)


def stable_largest_connected_component(graph: nx.Graph) -> nx.Graph:
    """Return the largest connected component of the graph with stable ordering.

    Extracts the largest connected component, normalizes node names, and
    stabilizes the graph for deterministic results.

    Args:
        graph: The input graph.

    Returns:
        The largest connected component with normalized, stably-ordered nodes and edges.
    """
    graph = graph.copy()
    graph = cast(nx.Graph, largest_connected_component(graph))
    graph = normalize_node_names(graph)
    return _stabilize_graph(graph)


def _compute_leiden_communities(
        graph: nx.Graph | nx.DiGraph,
        max_cluster_size: int,
        use_lcc: bool,
        seed=0xDEADBEEF,
) -> dict[int, dict[str, int]]:
    """Compute hierarchical Leiden community assignments.

    Runs the hierarchical Leiden algorithm and returns a nested dictionary
    mapping hierarchy levels to node-community assignments.

    Args:
        graph: The input graph.
        max_cluster_size: Maximum number of nodes per cluster.
        use_lcc: Whether to restrict to the largest connected component.
        seed: Random seed for reproducibility.

    Returns:
        Dictionary mapping level -> {node_name -> community_id}.
    """
    results: dict[int, dict[str, int]] = {}
    if is_empty(graph):
        return results
    if use_lcc:
        graph = stable_largest_connected_component(graph)

    community_mapping = hierarchical_leiden(
        graph, max_cluster_size=max_cluster_size, random_seed=seed
    )
    for partition in community_mapping:
        results[partition.level] = results.get(partition.level, {})
        results[partition.level][partition.node] = partition.cluster

    return results


def run(graph: nx.Graph, args: dict[str, Any]) -> dict[int, dict[str, dict]]:
    """Run Leiden community detection and return weighted community assignments.

    Computes hierarchical communities, groups nodes by community at each level,
    and assigns a normalized weight to each community based on the sum of
    node rank and weight attributes.

    Args:
        graph: The input knowledge graph.
        args: Configuration dictionary with optional keys:
            - ``max_cluster_size`` (int): Max nodes per cluster (default 12).
            - ``use_lcc`` (bool): Use largest connected component (default True).
            - ``verbose`` (bool): Enable debug logging (default False).
            - ``seed`` (int): Random seed (default 0xDEADBEEF).
            - ``levels`` (list[int]): Specific hierarchy levels to return (default all).

    Returns:
        Dictionary mapping level -> community_id -> {"weight": float, "nodes": list[str]}.
    """
    max_cluster_size = args.get("max_cluster_size", 12)
    use_lcc = args.get("use_lcc", True)
    if args.get("verbose", False):
        logging.debug(
            "Running leiden with max_cluster_size=%s, lcc=%s", max_cluster_size, use_lcc
        )
    nodes = set(graph.nodes())
    if not nodes:
        return {}

    node_id_to_community_map = _compute_leiden_communities(
        graph=graph,
        max_cluster_size=max_cluster_size,
        use_lcc=use_lcc,
        seed=args.get("seed", 0xDEADBEEF),
    )
    levels = args.get("levels")

    # If they don't pass in levels, use them all
    if levels is None:
        levels = sorted(node_id_to_community_map.keys())

    results_by_level: dict[int, dict[str, list[str]]] = {}
    for level in levels:
        result = {}
        results_by_level[level] = result
        for node_id, raw_community_id in node_id_to_community_map[level].items():
            if node_id not in nodes:
                logging.warning(f"Node {node_id} not found in the graph.")
                continue
            community_id = str(raw_community_id)
            if community_id not in result:
                result[community_id] = {"weight": 0, "nodes": []}
            result[community_id]["nodes"].append(node_id)
            # Community weight is the sum of (rank * weight) for all member nodes
            result[community_id]["weight"] += graph.nodes[node_id].get("rank", 0) * graph.nodes[node_id].get("weight", 1)
        # Normalize weights so the heaviest community has weight 1.0
        weights = [comm["weight"] for _, comm in result.items()]
        if not weights:
            continue
        max_weight = max(weights)
        if max_weight == 0:
            continue
        for _, comm in result.items():
            comm["weight"] /= max_weight

    return results_by_level


def add_community_info2graph(graph: nx.Graph, nodes: list[str], community_title):
    """Annotate graph nodes with their community membership title.

    Adds the community title to each node's "communities" attribute list,
    deduplicating entries.

    Args:
        graph: The knowledge graph to annotate.
        nodes: List of node names belonging to this community.
        community_title: The title/name of the community to add.
    """
    for n in nodes:
        if "communities" not in graph.nodes[n]:
            graph.nodes[n]["communities"] = []
        graph.nodes[n]["communities"].append(community_title)
        graph.nodes[n]["communities"] = list(set(graph.nodes[n]["communities"]))
