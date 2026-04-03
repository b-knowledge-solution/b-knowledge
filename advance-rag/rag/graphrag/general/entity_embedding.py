# Copyright (c) 2024 Microsoft Corporation.
# Licensed under the MIT License
"""Node embedding generation using Node2Vec for GraphRAG.

This module provides functionality to generate node embeddings for a knowledge
graph using the Node2Vec algorithm (via graspologic). These embeddings capture
structural similarity between nodes based on random walk patterns, and can be
used for downstream tasks such as community detection and entity clustering.

Reference:
 - [graphrag](https://github.com/microsoft/graphrag)
"""

from typing import Any
import numpy as np
import networkx as nx
from dataclasses import dataclass
from rag.graphrag.general.leiden import stable_largest_connected_component
import graspologic as gc


@dataclass
class NodeEmbeddings:
    """Container for Node2Vec embedding results.

    Attributes:
        nodes: List of node names corresponding to each embedding row.
        embeddings: 2D numpy array of shape (num_nodes, dimensions) with embeddings.
    """

    nodes: list[str]
    embeddings: np.ndarray


def embed_node2vec(
    graph: nx.Graph | nx.DiGraph,
    dimensions: int = 1536,
    num_walks: int = 10,
    walk_length: int = 40,
    window_size: int = 2,
    iterations: int = 3,
    random_seed: int = 86,
) -> NodeEmbeddings:
    """Generate node embeddings using the Node2Vec algorithm.

    Performs random walks on the graph and trains a skip-gram model to produce
    dense vector representations for each node.

    Args:
        graph: The input graph (directed or undirected).
        dimensions: Dimensionality of the output embeddings.
        num_walks: Number of random walks per node.
        walk_length: Length of each random walk.
        window_size: Context window size for the skip-gram model.
        iterations: Number of training iterations.
        random_seed: Seed for reproducibility.

    Returns:
        NodeEmbeddings containing node names and their embedding vectors.
    """
    # Generate embedding via graspologic's Node2Vec implementation
    lcc_tensors = gc.embed.node2vec_embed(  # type: ignore
        graph=graph,
        dimensions=dimensions,
        window_size=window_size,
        iterations=iterations,
        num_walks=num_walks,
        walk_length=walk_length,
        random_seed=random_seed,
    )
    return NodeEmbeddings(embeddings=lcc_tensors[0], nodes=lcc_tensors[1])


def run(graph: nx.Graph, args: dict[str, Any]) -> dict:
    """Run the Node2Vec embedding pipeline on a graph.

    Optionally restricts to the largest connected component, generates
    embeddings, and returns them as a sorted dictionary mapping node names
    to embedding vectors.

    Args:
        graph: The input knowledge graph.
        args: Configuration dictionary with optional keys:
            - ``use_lcc`` (bool): Whether to use only the largest connected component (default True).
            - ``dimensions`` (int): Embedding dimensionality (default 1536).
            - ``num_walks`` (int): Random walks per node (default 10).
            - ``walk_length`` (int): Walk length (default 40).
            - ``window_size`` (int): Skip-gram window size (default 2).
            - ``iterations`` (int): Training iterations (default 3).
            - ``random_seed`` (int): Random seed (default 86).

    Returns:
        Dictionary mapping node names to embedding vectors, sorted by node name.
    """
    if args.get("use_lcc", True):
        graph = stable_largest_connected_component(graph)

    # Create graph embedding using Node2Vec
    embeddings = embed_node2vec(
        graph=graph,
        dimensions=args.get("dimensions", 1536),
        num_walks=args.get("num_walks", 10),
        walk_length=args.get("walk_length", 40),
        window_size=args.get("window_size", 2),
        iterations=args.get("iterations", 3),
        random_seed=args.get("random_seed", 86),
    )

    # Pair node names with their embeddings and sort for deterministic output
    pairs = zip(embeddings.nodes, embeddings.embeddings.tolist(), strict=True)
    sorted_pairs = sorted(pairs, key=lambda x: x[0])

    return dict(sorted_pairs)
