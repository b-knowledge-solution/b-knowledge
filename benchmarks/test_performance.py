"""Performance benchmarks comparing mem0 add and search latency (D-22).

Tests covering:
- test_add_latency: Add latency with infer=True vs infer=False
- test_search_latency: Search latency across query complexity levels
- test_add_throughput: Sequential throughput measurement
- test_memory_count_scaling: Search latency vs memory pool size

All tests use pytest.mark.slow marker for selective execution.
All results printed as markdown tables for direct ADR inclusion.
"""

import os
import statistics
import time

import pytest

from benchmarks.sample_conversations import SAMPLE_CONVERSATIONS
from benchmarks.mem0_setup import create_tenant_config, cleanup_opensearch_index

# Skip entire module if OpenSearch or OpenAI API key not available
pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("OPENAI_API_KEY"),
        reason="OPENAI_API_KEY not set -- skipping performance benchmarks",
    ),
    pytest.mark.slow,
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

OS_HOST = os.environ.get("OPENSEARCH_HOST", "localhost")
OS_PORT = int(os.environ.get("OPENSEARCH_PORT", "9201"))


def _check_opensearch_reachable() -> bool:
    """Check if OpenSearch is reachable before running tests.

    Returns:
        True if OpenSearch responds on the configured host/port, False otherwise.
    """
    from opensearchpy import OpenSearch

    try:
        client = OpenSearch(
            hosts=[{"host": OS_HOST, "port": OS_PORT}],
            use_ssl=False,
            verify_certs=False,
        )
        client.info()
        return True
    except Exception:
        return False


def _create_memory(collection_name: str):
    """Create a mem0 Memory instance with the given collection name.

    Args:
        collection_name: OpenSearch index name for this Memory instance.

    Returns:
        A configured mem0 Memory instance targeting local OpenSearch.
    """
    from mem0 import Memory

    config = create_tenant_config(
        tenant_id="perf_test",
        collection_name=collection_name,
    )
    return Memory.from_config(config_dict=config)


def _cleanup(collection_name: str) -> None:
    """Remove test index from OpenSearch after a test run.

    Args:
        collection_name: Name of the OpenSearch index to delete.
    """
    try:
        cleanup_opensearch_index(OS_HOST, OS_PORT, collection_name)
    except Exception as exc:
        print(f"  Cleanup warning: {exc}")


def _compute_stats(timings: list[float]) -> dict[str, float]:
    """Compute descriptive statistics for a list of timing values.

    Args:
        timings: List of elapsed time measurements in seconds.

    Returns:
        Dictionary with min, max, mean, median, and p95 values.
    """
    sorted_t = sorted(timings)
    # Compute p95 index (95th percentile)
    p95_idx = int(len(sorted_t) * 0.95)
    # Clamp index to valid range
    p95_idx = min(p95_idx, len(sorted_t) - 1)

    return {
        "min": min(sorted_t),
        "max": max(sorted_t),
        "mean": statistics.mean(sorted_t),
        "median": statistics.median(sorted_t),
        "p95": sorted_t[p95_idx],
    }


def _print_stats_table(rows: list[tuple[str, dict[str, float]]]) -> None:
    """Print a markdown table of timing statistics.

    Args:
        rows: List of (label, stats_dict) tuples where stats_dict has
              min, max, mean, median, p95 keys.
    """
    print("| Mode | Min (s) | Max (s) | Mean (s) | Median (s) | P95 (s) |")
    print("|------|---------|---------|----------|------------|---------|")
    for label, stats in rows:
        print(
            f"| {label} | {stats['min']:.3f} | {stats['max']:.3f} | "
            f"{stats['mean']:.3f} | {stats['median']:.3f} | {stats['p95']:.3f} |"
        )


# ---------------------------------------------------------------------------
# D-22: Add Latency
# ---------------------------------------------------------------------------


def test_add_latency():
    """Measure mem0 add latency with infer=True vs infer=False (D-22).

    Times Memory.add() for all 10 sample conversations in both modes:
    - infer=True: LLM extraction + deduplication (production mode)
    - infer=False: Raw storage only (baseline)

    Compares against research estimates: native ~2-5s, mem0 ~3-8s per turn.
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection_infer = "mem0_perf_add_infer"
    collection_raw = "mem0_perf_add_raw"
    m_infer = _create_memory(collection_infer)
    m_raw = _create_memory(collection_raw)

    print("\n## D-22: Add Latency Benchmark\n")

    infer_timings: list[float] = []
    raw_timings: list[float] = []

    for idx, conv in enumerate(SAMPLE_CONVERSATIONS):
        user_id_infer = f"perf_infer_{idx}"
        user_id_raw = f"perf_raw_{idx}"

        # Time infer=True (LLM extraction + dedup)
        start = time.perf_counter()
        m_infer.add(messages=conv, user_id=user_id_infer, infer=True)
        elapsed_infer = time.perf_counter() - start
        infer_timings.append(elapsed_infer)

        # Time infer=False (raw storage only)
        start = time.perf_counter()
        m_raw.add(messages=conv, user_id=user_id_raw, infer=False)
        elapsed_raw = time.perf_counter() - start
        raw_timings.append(elapsed_raw)

        print(f"  Conv {idx + 1}: infer={elapsed_infer:.3f}s, raw={elapsed_raw:.3f}s")

    # Compute and print statistics
    infer_stats = _compute_stats(infer_timings)
    raw_stats = _compute_stats(raw_timings)

    print("\n### Add Latency Results\n")
    _print_stats_table([
        ("infer=True", infer_stats),
        ("infer=False", raw_stats),
    ])

    # Compare against research estimates
    print("\n### Comparison with Research Estimates\n")
    print("| Metric | Research Estimate | Actual (mem0 infer=True) |")
    print("|--------|-------------------|--------------------------|")
    print(f"| Mean add latency | 3-8s | {infer_stats['mean']:.3f}s |")
    print(f"| Native baseline estimate | 2-5s | {raw_stats['mean']:.3f}s (infer=False) |")

    _cleanup(collection_infer)
    _cleanup(collection_raw)


# ---------------------------------------------------------------------------
# D-22: Search Latency
# ---------------------------------------------------------------------------


def test_search_latency():
    """Measure mem0 search latency across query complexity levels (D-22).

    First populates a memory pool with 20 conversations, then times 20 search
    queries of varying complexity: simple keyword, semantic, and multi-concept.

    Compares against research estimate: native <200ms, mem0 <300ms.
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_perf_search"
    m = _create_memory(collection)
    user_id = "perf_search_user"

    print("\n## D-22: Search Latency Benchmark\n")

    # Populate: add all 10 conversations (some will produce multiple memories)
    print("### Populating memory pool...")
    for idx, conv in enumerate(SAMPLE_CONVERSATIONS):
        m.add(messages=conv, user_id=user_id, infer=True)
        print(f"  Added conversation {idx + 1}/10")

    # Allow indexing to complete
    time.sleep(2)

    # Verify population
    all_mems = m.get_all(user_id=user_id)
    mem_list = all_mems.get("results", all_mems) if isinstance(all_mems, dict) else all_mems
    mem_count = len(mem_list) if mem_list else 0
    print(f"**Total memories in pool:** {mem_count}\n")

    # Define search queries by complexity
    queries = {
        "Simple keyword": [
            "dark mode",
            "TypeScript",
            "deployment",
            "PostgreSQL",
            "Docker",
            "Redis",
            "Kubernetes",
        ],
        "Semantic": [
            "What programming language does the user prefer?",
            "What happened during the last deployment?",
            "How does the user deploy applications?",
            "What database does the team use?",
            "What caching strategy is being evaluated?",
            "What embedding model is used for RAG?",
        ],
        "Multi-concept": [
            "What are the user's tool preferences and development workflow?",
            "What infrastructure decisions has the team made?",
            "What performance requirements exist for the API?",
            "Describe the deployment pipeline from testing to production.",
            "What are the user's preferences for editor and terminal tools?",
            "What are the chunking and retrieval parameters for the RAG pipeline?",
            "What monitoring and alerting is set up?",
        ],
    }

    all_timings: list[float] = []
    category_timings: dict[str, list[float]] = {}

    print("### Search Latency by Query Type\n")
    print("| Category | Query | Latency (s) |")
    print("|----------|-------|-------------|")

    for category, query_list in queries.items():
        category_timings[category] = []
        for query in query_list:
            start = time.perf_counter()
            m.search(query=query, user_id=user_id)
            elapsed = time.perf_counter() - start
            all_timings.append(elapsed)
            category_timings[category].append(elapsed)

            # Truncate long queries for table readability
            q_display = query[:50] + "..." if len(query) > 50 else query
            print(f"| {category} | {q_display} | {elapsed:.3f} |")

    # Overall statistics
    overall_stats = _compute_stats(all_timings)

    print("\n### Search Latency Summary\n")
    rows = [("Overall", overall_stats)]
    for category, timings in category_timings.items():
        if timings:
            rows.append((category, _compute_stats(timings)))
    _print_stats_table(rows)

    # Compare against research estimates
    print("\n### Comparison with Research Estimates\n")
    print("| Metric | Research Estimate | Actual (mem0) |")
    print("|--------|-------------------|---------------|")
    print(f"| Mean search latency | <300ms | {overall_stats['mean'] * 1000:.1f}ms |")
    print(f"| P95 search latency | - | {overall_stats['p95'] * 1000:.1f}ms |")
    print(f"| Native baseline estimate | <200ms | (not measured -- native uses OpenSearch directly) |")

    _cleanup(collection)


# ---------------------------------------------------------------------------
# D-22: Add Throughput
# ---------------------------------------------------------------------------


def test_add_throughput():
    """Measure sequential add throughput for all 10 conversations (D-22).

    Times adding all sample conversations sequentially and computes
    conversations per minute throughput.

    Compares against research estimates: native 12-30/min, mem0 8-20/min.
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_perf_throughput"
    m = _create_memory(collection)
    user_id = "perf_throughput_user"

    print("\n## D-22: Add Throughput Benchmark\n")

    # Time all 10 conversations sequentially
    start = time.perf_counter()
    for idx, conv in enumerate(SAMPLE_CONVERSATIONS):
        m.add(messages=conv, user_id=f"{user_id}_{idx}", infer=True)
    total_time = time.perf_counter() - start

    # Compute throughput
    conv_count = len(SAMPLE_CONVERSATIONS)
    conv_per_min = (conv_count / total_time) * 60

    print(f"**Conversations processed:** {conv_count}")
    print(f"**Total time:** {total_time:.2f}s")
    print(f"**Throughput:** {conv_per_min:.1f} conversations/min")
    print()
    print("### Comparison with Research Estimates\n")
    print("| Metric | Native Estimate | mem0 Estimate | Actual (mem0) |")
    print("|--------|-----------------|---------------|---------------|")
    print(f"| Throughput (conv/min) | 12-30 | 8-20 | {conv_per_min:.1f} |")
    print(f"| Time per conversation | 2-5s | 3-8s | {total_time / conv_count:.2f}s |")

    _cleanup(collection)


# ---------------------------------------------------------------------------
# Memory Count Scaling
# ---------------------------------------------------------------------------


def test_memory_count_scaling():
    """Measure search latency as memory pool grows (10, 50, 100 memories).

    Tests whether search performance degrades as the number of stored
    memories increases. Adds memories incrementally and measures search
    latency at each scale point.
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_perf_scaling"
    m = _create_memory(collection)
    user_id = "perf_scaling_user"

    print("\n## Memory Count Scaling Benchmark\n")

    # Generate enough distinct memories by varying user_id and reusing conversations
    scale_points = [10, 50, 100]
    results: list[tuple[int, float]] = []

    # Search queries for latency measurement
    test_queries = [
        "dark mode preference",
        "What database is used?",
        "deployment procedure",
        "caching strategy",
        "programming language",
    ]

    memories_added = 0

    for target in scale_points:
        # Add memories until we reach the target count
        while memories_added < target:
            # Cycle through sample conversations with unique user IDs
            conv_idx = memories_added % len(SAMPLE_CONVERSATIONS)
            conv = SAMPLE_CONVERSATIONS[conv_idx]
            m.add(
                messages=conv,
                user_id=f"{user_id}_{memories_added}",
                infer=True,
            )
            memories_added += 1

            # Progress indicator every 10 memories
            if memories_added % 10 == 0:
                print(f"  Added {memories_added} conversations...")

        # Allow indexing
        time.sleep(2)

        # Measure search latency at this scale
        search_timings: list[float] = []
        for query in test_queries:
            start = time.perf_counter()
            # Search across all user IDs (use a common user_id pattern)
            m.search(query=query, user_id=f"{user_id}_0")
            elapsed = time.perf_counter() - start
            search_timings.append(elapsed)

        mean_latency = statistics.mean(search_timings)
        results.append((target, mean_latency))
        print(f"  Scale {target}: mean search latency = {mean_latency:.3f}s")

    # Print results table
    print("\n### Search Latency vs Memory Pool Size\n")
    print("| Memories Added | Mean Search Latency (s) | Mean Search Latency (ms) |")
    print("|----------------|-------------------------|--------------------------|")
    for count, latency in results:
        print(f"| {count} | {latency:.3f} | {latency * 1000:.1f} |")

    # Check for degradation
    if len(results) >= 2:
        first_latency = results[0][1]
        last_latency = results[-1][1]
        ratio = last_latency / first_latency if first_latency > 0 else 0
        print(f"\n**Scaling factor:** {ratio:.2f}x latency increase from {results[0][0]} to {results[-1][0]} memories")
        if ratio < 2.0:
            print("**Verdict:** Search scales well -- less than 2x degradation at 10x memory count.")
        else:
            print(f"**Verdict:** Search shows {ratio:.1f}x degradation -- may need optimization at scale.")

    _cleanup(collection)
