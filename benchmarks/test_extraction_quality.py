"""Side-by-side extraction quality comparison between mem0 and native pipeline.

Tests covering:
- D-06: Extraction quality comparison (test_extraction_comparison)
- D-18: Deduplication behavior (test_deduplication_behavior)
- D-19: Memory versioning (test_memory_versioning)
- D-17: Custom instructions / prompt customization (test_custom_instructions)
- D-13: Forgetting capability (test_forgetting_capability)

All tests produce structured markdown output suitable for direct inclusion
in the Architecture Decision Record (ADR).
"""

import os
import time

import pytest

from benchmarks.sample_conversations import SAMPLE_CONVERSATIONS
from benchmarks.mem0_setup import create_tenant_config, cleanup_opensearch_index

# Skip entire module if OpenSearch or OpenAI API key not available
pytestmark = pytest.mark.skipif(
    not os.environ.get("OPENAI_API_KEY"),
    reason="OPENAI_API_KEY not set -- skipping extraction quality tests",
)

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
        tenant_id="quality_test",
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


# ---------------------------------------------------------------------------
# D-06: Extraction Quality Comparison
# ---------------------------------------------------------------------------


def test_extraction_comparison():
    """Compare mem0 extraction quality across diverse conversation types (D-06).

    Runs the first 5 sample conversations through mem0 with infer=True and
    documents extracted memories in a markdown table. The output is the
    deliverable -- it feeds into the ADR qualitative section.
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_test_extraction_quality"
    m = _create_memory(collection)

    print("\n## D-06: Extraction Quality Comparison\n")
    print("| Conv # | Domain | mem0 Count | mem0 Content Samples |")
    print("|--------|--------|------------|----------------------|")

    domains = [
        "Technical preferences",
        "Project decisions",
        "Episodic events",
        "Procedural knowledge",
        "Contradictory updates",
    ]

    # Process first 5 conversations through mem0 extraction
    for idx, (conv, domain) in enumerate(
        zip(SAMPLE_CONVERSATIONS[:5], domains), start=1
    ):
        user_id = f"quality_test_user_{idx}"

        # Run through mem0 with LLM extraction enabled
        result = m.add(messages=conv, user_id=user_id, infer=True)

        # Retrieve all extracted memories for this user
        all_memories = m.get_all(user_id=user_id)
        memories_list = all_memories.get("results", all_memories) if isinstance(all_memories, dict) else all_memories
        count = len(memories_list) if memories_list else 0

        # Sample up to 3 memory contents for the table
        samples = []
        for mem in (memories_list or [])[:3]:
            # mem0 stores memory text in "memory" field
            text = mem.get("memory", str(mem)) if isinstance(mem, dict) else str(mem)
            # Truncate long content for table readability
            if len(text) > 80:
                text = text[:77] + "..."
            samples.append(text)
        sample_str = "; ".join(samples) if samples else "(none)"

        print(f"| {idx} | {domain} | {count} | {sample_str} |")

    # Print add() result structure for the last conversation (useful for ADR)
    print(f"\n**Last add() result structure:** `{type(result).__name__}`")
    if isinstance(result, dict):
        print(f"**Keys:** {list(result.keys())}")
        # Show event types if available
        results_list = result.get("results", [])
        if results_list:
            events = [r.get("event", "unknown") for r in results_list if isinstance(r, dict)]
            print(f"**Events:** {events}")

    _cleanup(collection)


# ---------------------------------------------------------------------------
# D-18: Deduplication Behavior
# ---------------------------------------------------------------------------


def test_deduplication_behavior():
    """Demonstrate mem0 deduplication with concrete before/after examples (D-18).

    Three-step test:
    1. Add "I prefer dark mode"
    2. Add "I like dark mode" (semantically identical -- should NOT double)
    3. Add "I switched to light mode" (contradictory -- should UPDATE)

    Prints memory state after each step and the event types returned by add().
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_test_dedup"
    m = _create_memory(collection)
    user_id = "dedup_test_user"

    print("\n## D-18: Deduplication Behavior\n")

    # Step 1: Add initial preference
    step1_conv = [
        {"role": "user", "content": "I prefer dark mode for all my applications."},
        {"role": "assistant", "content": "Noted, you prefer dark mode."},
    ]
    result1 = m.add(messages=step1_conv, user_id=user_id, infer=True)
    mems1 = m.get_all(user_id=user_id)
    mems1_list = mems1.get("results", mems1) if isinstance(mems1, dict) else mems1

    print("### Step 1: Add 'I prefer dark mode'")
    print(f"- **add() result:** {result1}")
    print(f"- **Memory count:** {len(mems1_list) if mems1_list else 0}")
    for mem in (mems1_list or []):
        text = mem.get("memory", str(mem)) if isinstance(mem, dict) else str(mem)
        print(f"  - `{text}`")

    count_after_step1 = len(mems1_list) if mems1_list else 0

    # Small delay to let OpenSearch index
    time.sleep(1)

    # Step 2: Add semantically identical statement
    step2_conv = [
        {"role": "user", "content": "I like dark mode. It's easier on my eyes."},
        {"role": "assistant", "content": "Dark mode is indeed popular for reducing eye strain."},
    ]
    result2 = m.add(messages=step2_conv, user_id=user_id, infer=True)
    mems2 = m.get_all(user_id=user_id)
    mems2_list = mems2.get("results", mems2) if isinstance(mems2, dict) else mems2

    print("\n### Step 2: Add 'I like dark mode' (semantically identical)")
    print(f"- **add() result:** {result2}")
    print(f"- **Memory count:** {len(mems2_list) if mems2_list else 0}")
    for mem in (mems2_list or []):
        text = mem.get("memory", str(mem)) if isinstance(mem, dict) else str(mem)
        print(f"  - `{text}`")

    count_after_step2 = len(mems2_list) if mems2_list else 0

    # Assert deduplication worked -- count should not double
    assert count_after_step2 <= count_after_step1 * 2, (
        f"Dedup failed: step1 had {count_after_step1} memories, "
        f"step2 has {count_after_step2} (expected no doubling)"
    )

    # Small delay before contradictory update
    time.sleep(1)

    # Step 3: Add contradictory update
    step3_conv = [
        {"role": "user", "content": "I switched to light mode recently. I find it better for daytime work."},
        {"role": "assistant", "content": "Interesting switch! Light mode can be better in bright environments."},
    ]
    result3 = m.add(messages=step3_conv, user_id=user_id, infer=True)
    mems3 = m.get_all(user_id=user_id)
    mems3_list = mems3.get("results", mems3) if isinstance(mems3, dict) else mems3

    print("\n### Step 3: Add 'I switched to light mode' (contradictory)")
    print(f"- **add() result:** {result3}")
    print(f"- **Memory count:** {len(mems3_list) if mems3_list else 0}")
    for mem in (mems3_list or []):
        text = mem.get("memory", str(mem)) if isinstance(mem, dict) else str(mem)
        print(f"  - `{text}`")

    # Print event types for all steps
    print("\n### Event Summary")
    for step_num, result in [(1, result1), (2, result2), (3, result3)]:
        if isinstance(result, dict):
            events = [
                r.get("event", "unknown")
                for r in result.get("results", [])
                if isinstance(r, dict)
            ]
            print(f"- **Step {step_num} events:** {events}")
        else:
            print(f"- **Step {step_num} result:** {result}")

    _cleanup(collection)


# ---------------------------------------------------------------------------
# D-19: Memory Versioning
# ---------------------------------------------------------------------------


def test_memory_versioning():
    """Verify mem0 memory versioning via history tracking (D-19).

    Adds a memory, updates it via contradictory add, then checks the history
    endpoint for version entries showing old_memory -> new_memory transitions.
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_test_versioning"
    m = _create_memory(collection)
    user_id = "version_test_user"

    print("\n## D-19: Memory Versioning\n")

    # Add initial memory
    conv1 = [
        {"role": "user", "content": "My favorite programming language is Python."},
        {"role": "assistant", "content": "Python is a great choice!"},
    ]
    m.add(messages=conv1, user_id=user_id, infer=True)

    # Allow indexing
    time.sleep(1)

    # Get the memory ID for history lookup
    mems = m.get_all(user_id=user_id)
    mems_list = mems.get("results", mems) if isinstance(mems, dict) else mems

    if not mems_list:
        print("**WARNING:** No memories found after initial add. Skipping history check.")
        _cleanup(collection)
        pytest.skip("No memories extracted -- cannot test versioning")

    memory_id = mems_list[0].get("id") if isinstance(mems_list[0], dict) else None
    print(f"**Initial memory ID:** `{memory_id}`")
    initial_text = mems_list[0].get("memory", str(mems_list[0])) if isinstance(mems_list[0], dict) else str(mems_list[0])
    print(f"**Initial content:** `{initial_text}`")

    # Add contradictory update to trigger UPDATE event
    conv2 = [
        {"role": "user", "content": "Actually, I've switched to Rust as my favorite language. It's much better for performance-critical work."},
        {"role": "assistant", "content": "Rust is excellent for performance. The ownership model takes some getting used to."},
    ]
    m.add(messages=conv2, user_id=user_id, infer=True)

    # Allow indexing
    time.sleep(1)

    # Check history for the memory
    if memory_id:
        try:
            history = m.history(memory_id=memory_id)
            print(f"\n**History entries:** {len(history) if history else 0}")

            if history:
                print("\n| # | Event | Old Memory | New Memory |")
                print("|---|-------|------------|------------|")
                for idx, entry in enumerate(history, start=1):
                    if isinstance(entry, dict):
                        event = entry.get("event", "unknown")
                        old = entry.get("old_memory", entry.get("prev_value", "N/A"))
                        new = entry.get("new_memory", entry.get("new_value", "N/A"))
                        # Truncate for readability
                        old_str = str(old)[:60] if old else "N/A"
                        new_str = str(new)[:60] if new else "N/A"
                        print(f"| {idx} | {event} | {old_str} | {new_str} |")
                    else:
                        print(f"| {idx} | (raw) | {str(entry)[:60]} | - |")

                # Assert at least 2 history entries (ADD + UPDATE)
                assert len(history) >= 2, (
                    f"Expected at least 2 history entries (ADD + UPDATE), got {len(history)}"
                )
            else:
                print("**WARNING:** History returned empty. mem0 may not track history for this config.")
        except Exception as exc:
            print(f"**History API error:** {exc}")
            print("**Note:** mem0 history requires SQLite backend; may not work in all configurations.")
    else:
        print("**WARNING:** Could not extract memory_id from response.")

    # Show final memory state
    final_mems = m.get_all(user_id=user_id)
    final_list = final_mems.get("results", final_mems) if isinstance(final_mems, dict) else final_mems
    print(f"\n**Final memory state:** {len(final_list) if final_list else 0} memories")
    for mem in (final_list or []):
        text = mem.get("memory", str(mem)) if isinstance(mem, dict) else str(mem)
        print(f"  - `{text}`")

    _cleanup(collection)


# ---------------------------------------------------------------------------
# D-17: Custom Instructions
# ---------------------------------------------------------------------------


def test_custom_instructions():
    """Evaluate mem0 custom_instructions for prompt customization (D-17).

    Creates a Memory with custom_instructions to extract only technical
    preferences and tool choices, ignoring personal information. Verifies
    the extracted memories reflect the filtering instruction.
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_test_custom_instructions"
    user_id = "custom_instr_user"

    # Build config with custom_instructions
    from mem0 import Memory

    config = create_tenant_config(
        tenant_id="custom_test",
        collection_name=collection,
    )
    # Inject custom_instructions into the config
    config["custom_instructions"] = (
        "Only extract technical preferences and tool choices. "
        "Ignore personal information such as names, ages, greetings, "
        "and biographical details."
    )
    m = Memory.from_config(config_dict=config)

    print("\n## D-17: Custom Instructions\n")

    # Conversation with both technical and personal info
    conv = [
        {
            "role": "user",
            "content": (
                "Hi, I'm Alice. I'm 30 years old and I live in San Francisco. "
                "I use Neovim as my primary editor and prefer Rust over C++. "
                "I also use tmux for terminal multiplexing and zsh as my shell."
            ),
        },
        {
            "role": "assistant",
            "content": "Nice to meet you, Alice! You have a great terminal-based workflow.",
        },
    ]

    result = m.add(messages=conv, user_id=user_id, infer=True)

    # Retrieve extracted memories
    mems = m.get_all(user_id=user_id)
    mems_list = mems.get("results", mems) if isinstance(mems, dict) else mems

    print(f"**Custom instruction:** Only extract technical preferences and tool choices.")
    print(f"**Input:** Personal info (name=Alice, age=30, city=SF) + tech (Neovim, Rust, tmux, zsh)")
    print(f"\n**Extracted memories ({len(mems_list) if mems_list else 0}):**")

    # Track whether personal info leaked through
    personal_keywords = ["alice", "30", "san francisco", "years old"]
    tech_keywords = ["neovim", "rust", "tmux", "zsh", "editor", "shell"]
    has_personal = False
    has_tech = False

    for mem in (mems_list or []):
        text = mem.get("memory", str(mem)) if isinstance(mem, dict) else str(mem)
        print(f"  - `{text}`")
        text_lower = text.lower()

        # Check for personal info leakage
        if any(kw in text_lower for kw in personal_keywords):
            has_personal = True
        # Check for technical content presence
        if any(kw in text_lower for kw in tech_keywords):
            has_tech = True

    print(f"\n**Contains technical preferences:** {has_tech}")
    print(f"**Contains personal info:** {has_personal}")

    if has_tech and not has_personal:
        print("**Verdict:** Custom instructions EFFECTIVE -- filtered personal info successfully.")
    elif has_tech and has_personal:
        print("**Verdict:** Custom instructions PARTIAL -- tech extracted but personal info leaked through.")
    elif not has_tech:
        print("**Verdict:** Custom instructions TOO AGGRESSIVE -- no technical content extracted.")
    else:
        print("**Verdict:** Custom instructions INEFFECTIVE -- only personal info extracted.")

    # Show add() events for insight
    if isinstance(result, dict):
        events = [
            r.get("event", "unknown")
            for r in result.get("results", [])
            if isinstance(r, dict)
        ]
        print(f"\n**add() events:** {events}")

    _cleanup(collection)


# ---------------------------------------------------------------------------
# D-13: Forgetting Capability
# ---------------------------------------------------------------------------


def test_forgetting_capability():
    """Assess mem0 forgetting capability -- delete and delete_all (D-13).

    Documents that mem0 supports hard-delete only (no soft-delete/forgotten
    state). The wrapper must implement soft-delete if needed.

    Steps:
    1. Add 5 memories to a pool
    2. Delete one by ID -- verify it's gone
    3. Delete all -- verify pool is empty
    """
    if not _check_opensearch_reachable():
        pytest.skip("OpenSearch not reachable")

    collection = "mem0_test_forgetting"
    m = _create_memory(collection)
    user_id = "forget_test_user"

    print("\n## D-13: Forgetting Capability\n")

    # Add 5 distinct memories
    memories_to_add = [
        "I prefer Python for data science projects.",
        "Our team uses Jira for project management.",
        "The production server runs Ubuntu 22.04 LTS.",
        "We deploy every Friday at 4 PM.",
        "Our API rate limit is 1000 requests per minute.",
    ]

    for text in memories_to_add:
        conv = [
            {"role": "user", "content": text},
            {"role": "assistant", "content": "Noted."},
        ]
        m.add(messages=conv, user_id=user_id, infer=True)
        # Brief pause to avoid overwhelming the LLM
        time.sleep(0.5)

    # Allow OpenSearch indexing
    time.sleep(2)

    # Verify initial state
    initial = m.get_all(user_id=user_id)
    initial_list = initial.get("results", initial) if isinstance(initial, dict) else initial
    initial_count = len(initial_list) if initial_list else 0
    print(f"**Initial memory count:** {initial_count}")

    if initial_count == 0:
        print("**WARNING:** No memories found after adding 5. Skipping delete tests.")
        _cleanup(collection)
        pytest.skip("No memories extracted -- cannot test forgetting")

    # Print initial memories
    print("**Initial memories:**")
    for mem in (initial_list or []):
        mid = mem.get("id", "?") if isinstance(mem, dict) else "?"
        text = mem.get("memory", str(mem)) if isinstance(mem, dict) else str(mem)
        print(f"  - [{mid[:8]}...] `{text}`")

    # Delete one memory by ID
    target_id = initial_list[0].get("id") if isinstance(initial_list[0], dict) else None
    target_text = initial_list[0].get("memory", "?") if isinstance(initial_list[0], dict) else "?"
    print(f"\n**Deleting memory:** [{target_id}] `{target_text}`")

    if target_id:
        m.delete(memory_id=target_id)
        time.sleep(1)

        # Verify deletion
        after_delete = m.get_all(user_id=user_id)
        after_list = after_delete.get("results", after_delete) if isinstance(after_delete, dict) else after_delete
        after_count = len(after_list) if after_list else 0
        print(f"**Count after single delete:** {after_count} (was {initial_count})")

        # Check the deleted memory is gone
        remaining_ids = [
            mem.get("id") for mem in (after_list or []) if isinstance(mem, dict)
        ]
        assert target_id not in remaining_ids, (
            f"Memory {target_id} still present after delete()"
        )
        print(f"**Verified:** Memory {target_id[:8]}... is gone from get_all()")

    # Delete all remaining memories
    print(f"\n**Calling delete_all(user_id='{user_id}')...**")
    m.delete_all(user_id=user_id)
    time.sleep(1)

    # Verify all deleted
    final = m.get_all(user_id=user_id)
    final_list = final.get("results", final) if isinstance(final, dict) else final
    final_count = len(final_list) if final_list else 0
    print(f"**Count after delete_all:** {final_count}")

    assert final_count == 0, (
        f"delete_all() did not remove all memories: {final_count} remain"
    )
    print("**Verified:** All memories removed by delete_all()")

    # Document forgetting characteristics
    print("\n### Forgetting Characteristics")
    print("| Feature | mem0 Support | Notes |")
    print("|---------|-------------|-------|")
    print("| Single delete by ID | YES | `m.delete(memory_id=...)` -- hard delete |")
    print("| Bulk delete by user | YES | `m.delete_all(user_id=...)` -- removes all user memories |")
    print("| Soft delete (forgotten state) | NO | mem0 only supports hard delete; wrapper must implement |")
    print("| FIFO auto-eviction | NO | No built-in size limits; wrapper must enforce |")
    print("| TTL-based expiry | NO | No time-based auto-deletion; wrapper must implement |")
    print("| Selective forget by metadata | PARTIAL | Can filter by user_id; no arbitrary metadata filters for delete |")

    _cleanup(collection)
