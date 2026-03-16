# Copyright (c) 2024 Microsoft Corporation.
# Licensed under the MIT License

from common.misc_utils import thread_pool_exec

"""GraphRAG utility functions and data structures.

This module provides shared utilities used across the GraphRAG pipeline, including:

- **GraphChange**: Dataclass tracking node/edge additions, updates, and removals.
- **Template substitution**: ``perform_variable_replacements`` for prompt templating.
- **String cleaning**: ``clean_str`` removes HTML escapes and control characters.
- **LLM/embedding caching**: Redis-backed caches for LLM responses and embeddings.
- **Graph operations**: Merging graphs, converting nodes/edges to searchable chunks,
  reading/writing graphs from/to the document store, and rebuilding from subgraphs.
- **Entity/relationship parsing**: Extracting structured entity and relationship
  records from LLM output.
- **Miscellaneous helpers**: Hashing, tuple merging, entity type retrieval, etc.

Reference:
 - [graphrag](https://github.com/microsoft/graphrag)
 - [LightRag](https://github.com/HKUDS/LightRAG)
"""

import asyncio
import dataclasses
import html
import json
import logging
import os
import re
import time
from collections import defaultdict
from hashlib import md5
from typing import Any, Callable, Set, Tuple

import networkx as nx
import numpy as np
import xxhash
from networkx.readwrite import json_graph

from common.misc_utils import get_uuid
from common.connection_utils import timeout
from rag.nlp import rag_tokenizer, search
from rag.utils.redis_conn import REDIS_CONN
from common import settings
from common.doc_store.doc_store_base import OrderByExpr

# Separator used to join multiple descriptions for the same entity or edge
GRAPH_FIELD_SEP = "<SEP>"

# Type alias for error handler callbacks
ErrorHandlerFn = Callable[[BaseException | None, str | None, dict | None], None]

# Semaphore to limit concurrent LLM chat requests
chat_limiter = asyncio.Semaphore(int(os.environ.get("MAX_CONCURRENT_CHATS", 10)))


@dataclasses.dataclass
class GraphChange:
    """Tracks incremental changes to a knowledge graph.

    Used during graph merging and entity resolution to record which nodes
    and edges have been added, updated, or removed, so that only the
    affected chunks need to be re-indexed in the document store.

    Attributes:
        removed_nodes: Set of node names that were removed.
        added_updated_nodes: Set of node names that were added or updated.
        removed_edges: Set of (source, target) edge tuples that were removed.
        added_updated_edges: Set of (source, target) edge tuples that were added or updated.
    """
    removed_nodes: Set[str] = dataclasses.field(default_factory=set)
    added_updated_nodes: Set[str] = dataclasses.field(default_factory=set)
    removed_edges: Set[Tuple[str, str]] = dataclasses.field(default_factory=set)
    added_updated_edges: Set[Tuple[str, str]] = dataclasses.field(default_factory=set)


def perform_variable_replacements(input: str, history: list[dict] | None = None, variables: dict | None = None) -> str:
    """Perform variable replacements on the input string and in a chat log.

    Replaces all occurrences of ``{key}`` in the input and in any system-role
    history entries with the corresponding value from the variables dict.

    Args:
        input: The template string containing ``{key}`` placeholders.
        history: Optional chat history; system messages will also be templated.
        variables: Dictionary mapping variable names to replacement values.

    Returns:
        The input string with all variables replaced.
    """
    if history is None:
        history = []
    if variables is None:
        variables = {}
    result = input

    def replace_all(input: str) -> str:
        result = input
        for k, v in variables.items():
            result = result.replace(f"{{{k}}}", str(v))
        return result

    result = replace_all(result)
    for i, entry in enumerate(history):
        if entry.get("role") == "system":
            entry["content"] = replace_all(entry.get("content") or "")

    return result


def clean_str(input: Any) -> str:
    """Clean an input string by removing HTML escapes, control characters, and other unwanted characters.

    Args:
        input: The string to clean (non-strings are returned as-is).

    Returns:
        The cleaned string with HTML entities unescaped and control chars removed.
    """
    # If we get non-string input, just give it back
    if not isinstance(input, str):
        return input

    result = html.unescape(input.strip())
    # https://stackoverflow.com/questions/4324790/removing-control-characters-from-a-string-in-python
    return re.sub(r"[\"\x00-\x1f\x7f-\x9f]", "", result)


def dict_has_keys_with_types(data: dict, expected_fields: list[tuple[str, type]]) -> bool:
    """Return True if the given dictionary has the given keys with the given types.

    Args:
        data: The dictionary to validate.
        expected_fields: List of (key_name, expected_type) tuples.

    Returns:
        True if all expected keys exist with the correct types.
    """
    for field, field_type in expected_fields:
        if field not in data:
            return False

        value = data[field]
        if not isinstance(value, field_type):
            return False
    return True


def get_llm_cache(llmnm, txt, history, genconf):
    """Retrieve a cached LLM response from Redis.

    Computes a hash key from the LLM name, prompt text, history, and generation
    config, then looks up the cached response.

    Args:
        llmnm: LLM model name.
        txt: System prompt text.
        history: Chat history.
        genconf: Generation configuration parameters.

    Returns:
        The cached response string, or None if not found.
    """
    hasher = xxhash.xxh64()
    hasher.update((str(llmnm)+str(txt)+str(history)+str(genconf)).encode("utf-8"))

    k = hasher.hexdigest()
    bin = REDIS_CONN.get(k)
    if not bin:
        return None
    return bin


def set_llm_cache(llmnm, txt, v, history, genconf):
    """Store an LLM response in the Redis cache with a 24-hour TTL.

    Args:
        llmnm: LLM model name.
        txt: System prompt text.
        v: The LLM response to cache.
        history: Chat history.
        genconf: Generation configuration parameters.
    """
    hasher = xxhash.xxh64()
    hasher.update((str(llmnm)+str(txt)+str(history)+str(genconf)).encode("utf-8"))
    k = hasher.hexdigest()
    REDIS_CONN.set(k, v.encode("utf-8"), 24 * 3600)


def get_embed_cache(llmnm, txt):
    """Retrieve a cached embedding vector from Redis.

    Args:
        llmnm: Embedding model name.
        txt: The text that was embedded.

    Returns:
        Numpy array of the cached embedding, or None if not found.
    """
    hasher = xxhash.xxh64()
    hasher.update(str(llmnm).encode("utf-8"))
    hasher.update(str(txt).encode("utf-8"))

    k = hasher.hexdigest()
    bin = REDIS_CONN.get(k)
    if not bin:
        return
    return np.array(json.loads(bin))


def set_embed_cache(llmnm, txt, arr):
    """Store an embedding vector in the Redis cache with a 24-hour TTL.

    Args:
        llmnm: Embedding model name.
        txt: The text that was embedded.
        arr: The embedding vector (numpy array or list).
    """
    hasher = xxhash.xxh64()
    hasher.update(str(llmnm).encode("utf-8"))
    hasher.update(str(txt).encode("utf-8"))

    k = hasher.hexdigest()
    arr = json.dumps(arr.tolist() if isinstance(arr, np.ndarray) else arr)
    REDIS_CONN.set(k, arr.encode("utf-8"), 24 * 3600)


def get_tags_from_cache(kb_ids):
    """Retrieve cached entity type tags for the given knowledge base IDs.

    Args:
        kb_ids: Knowledge base identifiers.

    Returns:
        Cached tags data, or None if not found.
    """
    hasher = xxhash.xxh64()
    hasher.update(str(kb_ids).encode("utf-8"))

    k = hasher.hexdigest()
    bin = REDIS_CONN.get(k)
    if not bin:
        return
    return bin


def set_tags_to_cache(kb_ids, tags):
    """Store entity type tags in the Redis cache with a 10-minute TTL.

    Args:
        kb_ids: Knowledge base identifiers.
        tags: The tags data to cache.
    """
    hasher = xxhash.xxh64()
    hasher.update(str(kb_ids).encode("utf-8"))

    k = hasher.hexdigest()
    REDIS_CONN.set(k, json.dumps(tags).encode("utf-8"), 600)


def tidy_graph(graph: nx.Graph, callback, check_attribute: bool = True):
    """Ensure all nodes and edges in the graph have essential attributes.

    Removes nodes and edges missing required attributes ("description", "source_id")
    and adds empty "keywords" lists to edges that lack them.

    Args:
        graph: The graph to tidy (modified in place).
        callback: Progress callback for reporting purged items.
        check_attribute: Whether to validate and purge items with missing attributes.
    """

    def is_valid_item(node_attrs: dict) -> bool:
        """Check if a node/edge has all required attributes."""
        valid_node = True
        for attr in ["description", "source_id"]:
            if attr not in node_attrs:
                valid_node = False
                break
        return valid_node

    # Purge nodes missing essential attributes
    if check_attribute:
        purged_nodes = []
        for node, node_attrs in graph.nodes(data=True):
            if not is_valid_item(node_attrs):
                purged_nodes.append(node)
        for node in purged_nodes:
            graph.remove_node(node)
        if purged_nodes and callback:
            callback(msg=f"Purged {len(purged_nodes)} nodes from graph due to missing essential attributes.")

    # Purge edges missing essential attributes and ensure keywords exist
    purged_edges = []
    for source, target, attr in graph.edges(data=True):
        if check_attribute:
            if not is_valid_item(attr):
                purged_edges.append((source, target))
        if "keywords" not in attr:
            attr["keywords"] = []
    for source, target in purged_edges:
        graph.remove_edge(source, target)
    if purged_edges and callback:
        callback(msg=f"Purged {len(purged_edges)} edges from graph due to missing essential attributes.")


def get_from_to(node1, node2):
    """Return a canonically ordered (smaller, larger) node pair.

    Ensures consistent edge key ordering regardless of direction.

    Args:
        node1: First node name.
        node2: Second node name.

    Returns:
        Tuple of (node1, node2) sorted lexicographically.
    """
    if node1 < node2:
        return (node1, node2)
    else:
        return (node2, node1)


def graph_merge(g1: nx.Graph, g2: nx.Graph, change: GraphChange):
    """Merge graph g2 into g1 in place.

    For overlapping nodes, descriptions and source_ids are concatenated.
    For overlapping edges, weights are summed and descriptions/keywords/source_ids
    are concatenated. Node ranks are recomputed based on degree.

    Args:
        g1: The target graph to merge into (modified in place).
        g2: The source graph to merge from.
        change: GraphChange tracker to record affected nodes and edges.

    Returns:
        The merged graph g1.
    """
    # Merge nodes: add new or concatenate descriptions for existing
    for node_name, attr in g2.nodes(data=True):
        change.added_updated_nodes.add(node_name)
        if not g1.has_node(node_name):
            g1.add_node(node_name, **attr)
            continue
        node = g1.nodes[node_name]
        node["description"] += GRAPH_FIELD_SEP + attr["description"]
        # A node's source_id indicates which chunks it came from.
        node["source_id"] += attr["source_id"]

    # Merge edges: add new or combine weights/descriptions for existing
    for source, target, attr in g2.edges(data=True):
        change.added_updated_edges.add(get_from_to(source, target))
        edge = g1.get_edge_data(source, target)
        if edge is None:
            g1.add_edge(source, target, **attr)
            continue
        edge["weight"] += attr.get("weight", 0)
        edge["description"] += GRAPH_FIELD_SEP + attr["description"]
        edge["keywords"] += attr["keywords"]
        # A edge's source_id indicates which chunks it came from.
        edge["source_id"] += attr["source_id"]

    # Update node rank based on degree
    for node_degree in g1.degree:
        g1.nodes[str(node_degree[0])]["rank"] = int(node_degree[1])
    # A graph's source_id indicates which documents it came from.
    if "source_id" not in g1.graph:
        g1.graph["source_id"] = []
    g1.graph["source_id"] += g2.graph.get("source_id", [])
    return g1


def compute_args_hash(*args):
    """Compute an MD5 hash of the given arguments for caching purposes.

    Args:
        *args: Arbitrary arguments to hash.

    Returns:
        Hex digest string of the MD5 hash.
    """
    return md5(str(args).encode()).hexdigest()


def handle_single_entity_extraction(
    record_attributes: list[str],
    chunk_key: str,
):
    """Parse a single entity extraction record from LLM output.

    Validates that the record has the correct format and minimum number of
    fields, then extracts and cleans entity name, type, and description.

    Args:
        record_attributes: List of delimited fields from a single record.
        chunk_key: Identifier of the source chunk for provenance tracking.

    Returns:
        Dictionary with entity_name, entity_type, description, and source_id,
        or None if the record is invalid.
    """
    if len(record_attributes) < 4 or record_attributes[0] != '"entity"':
        return None
    # add this record as a node in the G
    entity_name = clean_str(record_attributes[1].upper())
    if not entity_name.strip():
        return None
    entity_type = clean_str(record_attributes[2].upper())
    entity_description = clean_str(record_attributes[3])
    entity_source_id = chunk_key
    return dict(
        entity_name=entity_name.upper(),
        entity_type=entity_type.upper(),
        description=entity_description,
        source_id=entity_source_id,
    )


def handle_single_relationship_extraction(record_attributes: list[str], chunk_key: str):
    """Parse a single relationship extraction record from LLM output.

    Validates that the record has the correct format and minimum number of
    fields, then extracts source, target, description, keywords, and weight.

    Args:
        record_attributes: List of delimited fields from a single record.
        chunk_key: Identifier of the source chunk for provenance tracking.

    Returns:
        Dictionary with src_id, tgt_id, weight, description, keywords, source_id,
        and metadata, or None if the record is invalid.
    """
    if len(record_attributes) < 5 or record_attributes[0] != '"relationship"':
        return None
    # add this record as edge
    source = clean_str(record_attributes[1].upper())
    target = clean_str(record_attributes[2].upper())
    edge_description = clean_str(record_attributes[3])

    edge_keywords = clean_str(record_attributes[4])
    edge_source_id = chunk_key
    weight = float(record_attributes[-1]) if is_float_regex(record_attributes[-1]) else 1.0
    # Sort source/target for canonical edge ordering
    pair = sorted([source.upper(), target.upper()])
    return dict(
        src_id=pair[0],
        tgt_id=pair[1],
        weight=weight,
        description=edge_description,
        keywords=edge_keywords,
        source_id=edge_source_id,
        metadata={"created_at": time.time()},
    )


def pack_user_ass_to_openai_messages(*args: str):
    """Pack alternating user/assistant strings into OpenAI-format message dicts.

    Args:
        *args: Alternating user and assistant message content strings.

    Returns:
        List of {"role": ..., "content": ...} message dictionaries.
    """
    roles = ["user", "assistant"]
    return [{"role": roles[i % 2], "content": content} for i, content in enumerate(args)]


def split_string_by_multi_markers(content: str, markers: list[str]) -> list[str]:
    """Split a string by multiple markers.

    Args:
        content: The string to split.
        markers: List of delimiter strings to split on.

    Returns:
        List of non-empty, stripped substrings.
    """
    if not markers:
        return [content]
    results = re.split("|".join(re.escape(marker) for marker in markers), content)
    return [r.strip() for r in results if r.strip()]


def is_float_regex(value):
    """Check if a string represents a valid floating-point number.

    Args:
        value: The string to check.

    Returns:
        True if the string matches a float pattern.
    """
    return bool(re.match(r"^[-+]?[0-9]*\.?[0-9]+$", value))


def chunk_id(chunk):
    """Compute a deterministic hash ID for a chunk based on its content and KB ID.

    Args:
        chunk: Dictionary with "content_with_weight" and "kb_id" keys.

    Returns:
        Hex digest string of the xxHash64 hash.
    """
    return xxhash.xxh64((chunk["content_with_weight"] + chunk["kb_id"]).encode("utf-8")).hexdigest()


async def graph_node_to_chunk(kb_id, embd_mdl, ent_name, meta, chunks):
    """Convert a graph entity node into an indexable document chunk.

    Creates a search-ready chunk with tokenized content, entity metadata,
    and an embedding vector. Uses Redis caching for embedding lookups.

    Args:
        kb_id: Knowledge base identifier.
        embd_mdl: Embedding model for generating vector representations.
        ent_name: Entity name (used as the embedding input).
        meta: Node attribute dictionary (entity_type, description, source_id).
        chunks: Shared list to append the created chunk to.
    """
    global chat_limiter
    enable_timeout_assertion = os.environ.get("ENABLE_TIMEOUT_ASSERTION")
    chunk = {
        "id": get_uuid(),
        "important_kwd": [ent_name],
        "title_tks": rag_tokenizer.tokenize(ent_name),
        "entity_kwd": ent_name,
        "knowledge_graph_kwd": "entity",
        "entity_type_kwd": meta["entity_type"],
        "content_with_weight": json.dumps(meta, ensure_ascii=False),
        "content_ltks": rag_tokenizer.tokenize(meta["description"]),
        "source_id": meta["source_id"],
        "kb_id": kb_id,
        "available_int": 0,
    }
    chunk["content_sm_ltks"] = rag_tokenizer.fine_grained_tokenize(chunk["content_ltks"])
    # Try to retrieve embedding from cache first
    ebd = get_embed_cache(embd_mdl.llm_name, ent_name)
    if ebd is None:
        async with chat_limiter:
            timeout = 3 if enable_timeout_assertion else 30000000
            ebd, _ = await asyncio.wait_for(
                thread_pool_exec(embd_mdl.encode, [ent_name]),
                timeout=timeout
            )
        ebd = ebd[0]
        set_embed_cache(embd_mdl.llm_name, ent_name, ebd)
    assert ebd is not None
    # Store embedding with dimension-aware field name
    chunk["q_%d_vec" % len(ebd)] = ebd
    chunks.append(chunk)


@timeout(3, 3)
async def get_relation(tenant_id, kb_id, from_ent_name, to_ent_name, size=1):
    """Retrieve relation data between entities from the document store.

    Args:
        tenant_id: Tenant identifier for index routing.
        kb_id: Knowledge base identifier (string or list).
        from_ent_name: Source entity name(s).
        to_ent_name: Target entity name(s).
        size: Maximum number of results to return.

    Returns:
        If size==1: a single relation dict, or empty list if not found.
        If size>1: list of relation dicts.
    """
    ents = from_ent_name
    if isinstance(ents, str):
        ents = [from_ent_name]
    if isinstance(to_ent_name, str):
        to_ent_name = [to_ent_name]
    ents.extend(to_ent_name)
    ents = list(set(ents))
    conds = {"fields": ["content_with_weight"], "size": size, "from_entity_kwd": ents, "to_entity_kwd": ents, "knowledge_graph_kwd": ["relation"]}
    res = []
    es_res = await settings.retriever.search(conds, search.index_name(tenant_id), [kb_id] if isinstance(kb_id, str) else kb_id)
    for id in es_res.ids:
        try:
            if size == 1:
                return json.loads(es_res.field[id]["content_with_weight"])
            res.append(json.loads(es_res.field[id]["content_with_weight"]))
        except Exception:
            continue
    return res


async def graph_edge_to_chunk(kb_id, embd_mdl, from_ent_name, to_ent_name, meta, chunks):
    """Convert a graph relationship edge into an indexable document chunk.

    Creates a search-ready chunk with tokenized content, relationship metadata,
    and an embedding vector. The embedding text is "source->target: description".

    Args:
        kb_id: Knowledge base identifier.
        embd_mdl: Embedding model for generating vector representations.
        from_ent_name: Source entity name.
        to_ent_name: Target entity name.
        meta: Edge attribute dictionary (description, keywords, weight, source_id).
        chunks: Shared list to append the created chunk to.
    """
    enable_timeout_assertion = os.environ.get("ENABLE_TIMEOUT_ASSERTION")
    chunk = {
        "id": get_uuid(),
        "from_entity_kwd": from_ent_name,
        "to_entity_kwd": to_ent_name,
        "knowledge_graph_kwd": "relation",
        "content_with_weight": json.dumps(meta, ensure_ascii=False),
        "content_ltks": rag_tokenizer.tokenize(meta["description"]),
        "important_kwd": meta["keywords"],
        "source_id": meta["source_id"],
        "weight_int": int(meta["weight"]),
        "kb_id": kb_id,
        "available_int": 0,
    }
    chunk["content_sm_ltks"] = rag_tokenizer.fine_grained_tokenize(chunk["content_ltks"])
    # Embed the relationship as "source->target" with description
    txt = f"{from_ent_name}->{to_ent_name}"
    ebd = get_embed_cache(embd_mdl.llm_name, txt)
    if ebd is None:
        async with chat_limiter:
            timeout = 3 if enable_timeout_assertion else 300000000
            ebd, _ = await asyncio.wait_for(
                thread_pool_exec(
                    embd_mdl.encode,
                    [txt + f": {meta['description']}"]
                ),
                timeout=timeout
            )
        ebd = ebd[0]
        set_embed_cache(embd_mdl.llm_name, txt, ebd)
    assert ebd is not None
    chunk["q_%d_vec" % len(ebd)] = ebd
    chunks.append(chunk)


async def does_graph_contains(tenant_id, kb_id, doc_id):
    """Check whether a document is already included in the knowledge graph.

    Args:
        tenant_id: Tenant identifier for index routing.
        kb_id: Knowledge base identifier.
        doc_id: Document identifier to check.

    Returns:
        True if the document is already represented in the graph.
    """
    # Get doc_ids of graph
    fields = ["source_id"]
    condition = {
        "knowledge_graph_kwd": ["graph"],
        "removed_kwd": "N",
    }
    res = await thread_pool_exec(
        settings.docStoreConn.search,
        fields, [], condition, [], OrderByExpr(),
        0, 1, search.index_name(tenant_id), [kb_id]
    )
    fields2 = settings.docStoreConn.get_fields(res, fields)
    graph_doc_ids = set()
    for chunk_id in fields2.keys():
        graph_doc_ids = set(fields2[chunk_id]["source_id"])
    return doc_id in graph_doc_ids


async def get_graph_doc_ids(tenant_id, kb_id) -> list[str]:
    """Get the list of document IDs that contributed to a knowledge graph.

    Args:
        tenant_id: Tenant identifier for index routing.
        kb_id: Knowledge base identifier.

    Returns:
        List of document IDs in the graph's source_id field.
    """
    conds = {"fields": ["source_id"], "removed_kwd": "N", "size": 1, "knowledge_graph_kwd": ["graph"]}
    res = await settings.retriever.search(conds, search.index_name(tenant_id), [kb_id])
    doc_ids = []
    if res.total == 0:
        return doc_ids
    for id in res.ids:
        doc_ids = res.field[id]["source_id"]
    return doc_ids


async def get_graph(tenant_id, kb_id, exclude_rebuild=None):
    """Load the knowledge graph from the document store.

    If the graph is marked as removed, it will be rebuilt from subgraphs
    (excluding the specified document IDs).

    Args:
        tenant_id: Tenant identifier for index routing.
        kb_id: Knowledge base identifier.
        exclude_rebuild: Document ID(s) to exclude when rebuilding the graph.

    Returns:
        A NetworkX graph, or None if no graph exists.
    """
    conds = {"fields": ["content_with_weight", "removed_kwd", "source_id"], "size": 1, "knowledge_graph_kwd": ["graph"]}
    res = await settings.retriever.search(conds, search.index_name(tenant_id), [kb_id])
    if not res.total == 0:
        for id in res.ids:
            try:
                if res.field[id]["removed_kwd"] == "N":
                    # Graph is active; deserialize from JSON
                    g = json_graph.node_link_graph(json.loads(res.field[id]["content_with_weight"]), edges="edges")
                    if "source_id" not in g.graph:
                        g.graph["source_id"] = res.field[id]["source_id"]
                else:
                    # Graph is marked as removed; rebuild from subgraphs
                    g = await rebuild_graph(tenant_id, kb_id, exclude_rebuild)
                return g
            except Exception:
                continue
    result = None
    return result


async def set_graph(tenant_id: str, kb_id: str, embd_mdl, graph: nx.Graph, change: GraphChange, callback):
    """Persist the knowledge graph and its changes to the document store.

    This function:
    1. Deletes the old graph and subgraph chunks.
    2. Removes deleted nodes and edges from the index.
    3. Serializes the full graph and per-document subgraphs as chunks.
    4. Generates embeddings for added/updated nodes and edges.
    5. Bulk-inserts all chunks into the document store.

    Args:
        tenant_id: Tenant identifier for index routing.
        kb_id: Knowledge base identifier.
        embd_mdl: Embedding model for vector generation.
        graph: The full knowledge graph to persist.
        change: GraphChange tracking which items need to be indexed.
        callback: Progress callback for status reporting.
    """
    global chat_limiter
    start = asyncio.get_running_loop().time()

    # Delete old graph and subgraph chunks
    await thread_pool_exec(
        settings.docStoreConn.delete,
        {"knowledge_graph_kwd": ["graph", "subgraph"]},
        search.index_name(tenant_id),
        kb_id
    )

    # Delete removed entity chunks from the index
    if change.removed_nodes:
        await thread_pool_exec(
            settings.docStoreConn.delete,
            {"knowledge_graph_kwd": ["entity"], "entity_kwd": sorted(change.removed_nodes)},
            search.index_name(tenant_id),
            kb_id
        )

    # Delete removed relation chunks from the index
    if change.removed_edges:

        async def del_edges(from_node, to_node):
            async with chat_limiter:
                await thread_pool_exec(
                    settings.docStoreConn.delete,
                    {"knowledge_graph_kwd": ["relation"], "from_entity_kwd": from_node, "to_entity_kwd": to_node},
                    search.index_name(tenant_id),
                    kb_id
                )

        tasks = []
        for from_node, to_node in change.removed_edges:
            tasks.append(asyncio.create_task(del_edges(from_node, to_node)))

        try:
            await asyncio.gather(*tasks, return_exceptions=False)
        except Exception as e:
            logging.error(f"Error while deleting edges: {e}")
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            raise

    now = asyncio.get_running_loop().time()
    if callback:
        callback(msg=f"set_graph removed {len(change.removed_nodes)} nodes and {len(change.removed_edges)} edges from index in {now - start:.2f}s.")
    start = now

    # Serialize the full graph as a single chunk
    chunks = [
        {
            "id": get_uuid(),
            "content_with_weight": json.dumps(nx.node_link_data(graph, edges="edges"), ensure_ascii=False),
            "knowledge_graph_kwd": "graph",
            "kb_id": kb_id,
            "source_id": graph.graph.get("source_id", []),
            "available_int": 0,
            "removed_kwd": "N",
        }
    ]

    # Generate per-document subgraph chunks for incremental rebuild support
    for source in graph.graph["source_id"]:
        subgraph = graph.subgraph([n for n in graph.nodes if source in graph.nodes[n]["source_id"]]).copy()
        subgraph.graph["source_id"] = [source]
        for n in subgraph.nodes:
            subgraph.nodes[n]["source_id"] = [source]
        chunks.append(
            {
                "id": get_uuid(),
                "content_with_weight": json.dumps(nx.node_link_data(subgraph, edges="edges"), ensure_ascii=False),
                "knowledge_graph_kwd": "subgraph",
                "kb_id": kb_id,
                "source_id": [source],
                "available_int": 0,
                "removed_kwd": "N",
            }
        )

    # Generate embedding chunks for added/updated nodes
    tasks = []
    for ii, node in enumerate(change.added_updated_nodes):
        node_attrs = graph.nodes[node]
        tasks.append(asyncio.create_task(
            graph_node_to_chunk(kb_id, embd_mdl, node, node_attrs, chunks)
        ))
        if ii % 100 == 9 and callback:
            callback(msg=f"Get embedding of nodes: {ii}/{len(change.added_updated_nodes)}")
    try:
        await asyncio.gather(*tasks, return_exceptions=False)
    except Exception as e:
        logging.error(f"Error in get_embedding_of_nodes: {e}")
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise

    # Generate embedding chunks for added/updated edges
    tasks = []
    for ii, (from_node, to_node) in enumerate(change.added_updated_edges):
        edge_attrs = graph.get_edge_data(from_node, to_node)
        if not edge_attrs:
            continue
        tasks.append(asyncio.create_task(
            graph_edge_to_chunk(kb_id, embd_mdl, from_node, to_node, edge_attrs, chunks)
        ))
        if ii % 100 == 9 and callback:
            callback(msg=f"Get embedding of edges: {ii}/{len(change.added_updated_edges)}")
    try:
        await asyncio.gather(*tasks, return_exceptions=False)
    except Exception as e:
        logging.error(f"Error in get_embedding_of_edges: {e}")
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise

    now = asyncio.get_running_loop().time()
    if callback:
        callback(msg=f"set_graph converted graph change to {len(chunks)} chunks in {now - start:.2f}s.")
    start = now

    # Bulk insert chunks into the document store
    enable_timeout_assertion = os.environ.get("ENABLE_TIMEOUT_ASSERTION")
    es_bulk_size = 4
    for b in range(0, len(chunks), es_bulk_size):
        timeout = 3 if enable_timeout_assertion else 30000000
        doc_store_result = await asyncio.wait_for(
            thread_pool_exec(
                settings.docStoreConn.insert,
                chunks[b : b + es_bulk_size],
                search.index_name(tenant_id),
                kb_id
            ),
            timeout=timeout
        )
        if b % 100 == es_bulk_size and callback:
            callback(msg=f"Insert chunks: {b}/{len(chunks)}")
        if doc_store_result:
            error_message = f"Insert chunk error: {doc_store_result}, please check log file and Elasticsearch/Infinity status!"
            raise Exception(error_message)
    now = asyncio.get_running_loop().time()
    if callback:
        callback(msg=f"set_graph added/updated {len(change.added_updated_nodes)} nodes and {len(change.added_updated_edges)} edges from index in {now - start:.2f}s.")


def is_continuous_subsequence(subseq, seq):
    """Check if subseq forms a continuous 2-element subsequence within seq.

    Used for detecting cycles in tuple merging operations.

    Args:
        subseq: A 2-element tuple to search for.
        seq: The sequence to search within.

    Returns:
        True if subseq appears as consecutive elements in seq.
    """
    def find_all_indexes(tup, value):
        indexes = []
        start = 0
        while True:
            try:
                index = tup.index(value, start)
                indexes.append(index)
                start = index + 1
            except ValueError:
                break
        return indexes

    index_list = find_all_indexes(seq, subseq[0])
    for idx in index_list:
        if idx != len(seq) - 1:
            if seq[idx + 1] == subseq[-1]:
                return True
    return False


def merge_tuples(list1, list2):
    """Merge two lists of tuples by extending list1 tuples with matching list2 continuations.

    For each tuple in list1, finds tuples in list2 that start where the first
    tuple ends, and creates extended tuples. Avoids creating cycles.

    Args:
        list1: List of tuples to extend.
        list2: List of tuples providing continuations.

    Returns:
        List of merged tuples.
    """
    result = []
    for tup in list1:
        last_element = tup[-1]
        # Self-loop detection
        if last_element in tup[:-1]:
            result.append(tup)
        else:
            matching_tuples = [t for t in list2 if t[0] == last_element]
            already_match_flag = 0
            for match in matching_tuples:
                matchh = (match[1], match[0])
                # Skip if this would create a cycle
                if is_continuous_subsequence(match, tup) or is_continuous_subsequence(matchh, tup):
                    continue
                already_match_flag = 1
                merged_tuple = tup + match[1:]
                result.append(merged_tuple)
            if not already_match_flag:
                result.append(tup)
    return result


async def get_entity_type2samples(idxnms, kb_ids: list):
    """Retrieve entity type to sample entities mapping from the document store.

    Used to build the answer-type pool for MiniRAG-style query analysis.

    Args:
        idxnms: Index names for searching.
        kb_ids: Knowledge base identifiers.

    Returns:
        Dictionary mapping entity type names to lists of sample entity names.
    """
    es_res = await settings.retriever.search({"knowledge_graph_kwd": "ty2ents", "kb_id": kb_ids, "size": 10000, "fields": ["content_with_weight"]},idxnms,kb_ids)

    res = defaultdict(list)
    for id in es_res.ids:
        smp = es_res.field[id].get("content_with_weight")
        if not smp:
            continue
        try:
            smp = json.loads(smp)
        except Exception as e:
            logging.exception(e)

        for ty, ents in smp.items():
            res[ty].extend(ents)
    return res


def flat_uniq_list(arr, key):
    """Flatten and deduplicate a specific key from a list of dicts.

    If the value for the key is a list, it is flattened; otherwise treated
    as a single element. Results are deduplicated via set conversion.

    Args:
        arr: List of dictionaries.
        key: The key to extract and flatten.

    Returns:
        Deduplicated list of values.
    """
    res = []
    for a in arr:
        a = a[key]
        if isinstance(a, list):
            res.extend(a)
        else:
            res.append(a)
    return list(set(res))


async def rebuild_graph(tenant_id, kb_id, exclude_rebuild=None):
    """Rebuild a knowledge graph from stored subgraphs.

    Iterates over all subgraph chunks in the document store and composes
    them into a single graph, excluding subgraphs from specified documents.

    Args:
        tenant_id: Tenant identifier for index routing.
        kb_id: Knowledge base identifier.
        exclude_rebuild: Document ID(s) to exclude from the rebuilt graph.

    Returns:
        The rebuilt NetworkX graph, or None if no subgraphs exist.
    """
    graph = nx.Graph()
    flds = ["knowledge_graph_kwd", "content_with_weight", "source_id"]
    bs = 256
    # Paginate through subgraph chunks
    for i in range(0, 1024 * bs, bs):
        es_res = await thread_pool_exec(
            settings.docStoreConn.search,
            flds, [], {"kb_id": kb_id, "knowledge_graph_kwd": ["subgraph"]},
            [], OrderByExpr(), i, bs, search.index_name(tenant_id), [kb_id]
        )
        # tot = settings.docStoreConn.get_total(es_res)
        es_res = settings.docStoreConn.get_fields(es_res, flds)

        if len(es_res) == 0:
            break

        for id, d in es_res.items():
            assert d["knowledge_graph_kwd"] == "subgraph"
            # Skip subgraphs belonging to excluded documents
            if isinstance(exclude_rebuild, list):
                if sum([n in d["source_id"] for n in exclude_rebuild]):
                    continue
            elif exclude_rebuild in d["source_id"]:
                continue

            # Compose subgraph into the main graph, merging overlapping nodes
            next_graph = json_graph.node_link_graph(json.loads(d["content_with_weight"]), edges="edges")
            merged_graph = nx.compose(graph, next_graph)
            merged_source = {n: graph.nodes[n]["source_id"] + next_graph.nodes[n]["source_id"] for n in graph.nodes & next_graph.nodes}
            nx.set_node_attributes(merged_graph, merged_source, "source_id")
            if "source_id" in graph.graph:
                merged_graph.graph["source_id"] = graph.graph["source_id"] + next_graph.graph["source_id"]
            else:
                merged_graph.graph["source_id"] = next_graph.graph["source_id"]
            graph = merged_graph

    if len(graph.nodes) == 0:
        return None
    graph.graph["source_id"] = sorted(graph.graph["source_id"])
    return graph
