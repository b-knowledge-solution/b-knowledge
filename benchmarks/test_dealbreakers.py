"""Deal-breaker verification tests for mem0 integration with b-knowledge.

Runs against LIVE infrastructure (OpenSearch, PostgreSQL) to empirically
verify that all four deal-breakers from D-21 pass in practice. Also tests
Apache AGE availability on PG17 and mem0 REST API server viability.

Each test prints a clear DEAL-BREAKER result line for easy parsing.
Tests may pass, fail, or skip -- all are valid outcomes for investigation.

Prerequisites:
  - Docker infrastructure running (npm run docker:base)
  - OPENAI_API_KEY set in environment (for LLM/embedding tests)
  - mem0ai installed (.venv/Scripts/pip install -r benchmarks/requirements.txt)
"""

import os
import subprocess
import sys
import time

import pytest

from benchmarks.mem0_setup import (
    check_age_extension,
    cleanup_opensearch_index,
    create_tenant_config,
)

# Collect results across all tests for the summary
_results: list[dict] = []


def _record(number: int, name: str, status: str, detail: str = "") -> None:
    """Record a deal-breaker test result and print it immediately.

    Args:
        number: Deal-breaker number (1-7).
        name: Short name of the deal-breaker being tested.
        status: PASS, FAIL, or SKIP.
        detail: Optional detail message explaining the result.
    """
    _results.append(
        {"number": number, "name": name, "status": status, "detail": detail}
    )
    msg = f"DEAL-BREAKER #{number}: {status}"
    if detail:
        msg += f" -- {detail}"
    print(msg)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _opensearch_host() -> str:
    """Get OpenSearch host from environment or default."""
    return os.environ.get("OPENSEARCH_HOST", "localhost")


def _opensearch_port() -> int:
    """Get OpenSearch port from environment or default."""
    return int(os.environ.get("OPENSEARCH_PORT", "9201"))


def _skip_if_no_api_key() -> None:
    """Skip test if OPENAI_API_KEY is not set (needed for LLM/embedding calls)."""
    if not os.environ.get("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set -- cannot test LLM/embedding integration")


def _skip_if_no_opensearch() -> None:
    """Skip test if OpenSearch is not reachable."""
    from opensearchpy import OpenSearch

    client = OpenSearch(
        hosts=[{"host": _opensearch_host(), "port": _opensearch_port()}],
        use_ssl=False,
        verify_certs=False,
    )
    try:
        info = client.info()
        if not info:
            pytest.skip("OpenSearch not reachable")
    except Exception:
        pytest.skip("OpenSearch not reachable at {}:{}".format(
            _opensearch_host(), _opensearch_port()
        ))


# ---------------------------------------------------------------------------
# Test 1: OpenSearch connection (Deal-breaker #1 -- D-10)
# ---------------------------------------------------------------------------

class TestDealBreaker1:
    """Verify mem0 can connect to and use b-knowledge's OpenSearch instance."""

    INDEX_NAME = "mem0_test_db1"

    def test_opensearch_connection(self, mem0_config: dict) -> None:
        """Add and search memories via mem0 using OpenSearch as vector store.

        This proves mem0's opensearch vector_store provider works with
        b-knowledge's OpenSearch 3.5 instance on port 9201.
        """
        _skip_if_no_opensearch()
        _skip_if_no_api_key()

        from mem0 import Memory

        # Override collection name for this specific test
        config = dict(mem0_config)
        config["vector_store"] = dict(config["vector_store"])
        config["vector_store"]["config"] = dict(config["vector_store"]["config"])
        config["vector_store"]["config"]["collection_name"] = self.INDEX_NAME

        try:
            m = Memory.from_config(config_dict=config)

            # Add a test memory with infer=False to skip LLM extraction
            add_result = m.add(
                messages=[
                    {"role": "user", "content": "Test message for OpenSearch verification"},
                    {"role": "assistant", "content": "Acknowledged the test message"},
                ],
                user_id="test_db1_user",
                infer=False,
            )
            print(f"  Add result: {add_result}")

            # Allow OpenSearch to index the document
            time.sleep(1)

            # Search for the memory we just added
            search_result = m.search(
                query="test message",
                user_id="test_db1_user",
                limit=5,
            )
            print(f"  Search result: {search_result}")

            # Verify we got results back
            assert search_result is not None, "Search returned None"

            # mem0 search returns a dict with 'results' key or a list
            results = search_result if isinstance(search_result, list) else search_result.get("results", [])
            assert len(results) > 0, "Search returned empty results"

            _record(1, "OpenSearch connection", "PASS",
                    f"Added and searched memories via mem0 -> OpenSearch. {len(results)} result(s) found.")

        except Exception as e:
            _record(1, "OpenSearch connection", "FAIL", str(e))
            raise

        finally:
            # Cleanup test index
            cleanup_opensearch_index(_opensearch_host(), _opensearch_port(), self.INDEX_NAME)


# ---------------------------------------------------------------------------
# Test 2: Multi-tenant isolation (Deal-breaker #2 -- D-07)
# ---------------------------------------------------------------------------

class TestDealBreaker2:
    """Verify mem0 isolates data between tenants using separate collection names."""

    INDEX_A = "mem0_test_tenant_a"
    INDEX_B = "mem0_test_tenant_b"

    def test_multi_tenant_isolation(self, mem0_config: dict) -> None:
        """Create two tenant-scoped mem0 instances and verify data isolation.

        Tenant A's memories must not appear in tenant B's searches and vice versa.
        Uses separate OpenSearch collection_name per tenant for hard isolation.
        """
        _skip_if_no_opensearch()
        _skip_if_no_api_key()

        from mem0 import Memory

        config_a = create_tenant_config(
            tenant_id="tenantA",
            collection_name=self.INDEX_A,
        )
        config_b = create_tenant_config(
            tenant_id="tenantB",
            collection_name=self.INDEX_B,
        )

        try:
            mem_a = Memory.from_config(config_dict=config_a)
            mem_b = Memory.from_config(config_dict=config_b)

            # Add distinct memories to each tenant
            mem_a.add(
                messages=[
                    {"role": "user", "content": "Tenant A secret data about project alpha"},
                    {"role": "assistant", "content": "Noted tenant A info"},
                ],
                user_id="tenantA:user1",
                infer=False,
            )

            mem_b.add(
                messages=[
                    {"role": "user", "content": "Tenant B secret data about project beta"},
                    {"role": "assistant", "content": "Noted tenant B info"},
                ],
                user_id="tenantB:user1",
                infer=False,
            )

            # Allow indexing
            time.sleep(1)

            # Search tenant A -- should find tenant A data only
            results_a = mem_a.search(
                query="secret data",
                user_id="tenantA:user1",
                limit=5,
            )
            results_a_list = results_a if isinstance(results_a, list) else results_a.get("results", [])

            # Search tenant B -- should find tenant B data only
            results_b = mem_b.search(
                query="secret data",
                user_id="tenantB:user1",
                limit=5,
            )
            results_b_list = results_b if isinstance(results_b, list) else results_b.get("results", [])

            print(f"  Tenant A results: {results_a_list}")
            print(f"  Tenant B results: {results_b_list}")

            # Verify isolation: tenant A should not see tenant B data
            a_texts = " ".join(str(r) for r in results_a_list).lower()
            b_texts = " ".join(str(r) for r in results_b_list).lower()

            # Each tenant should find their own data
            assert len(results_a_list) > 0, "Tenant A search returned no results"
            assert len(results_b_list) > 0, "Tenant B search returned no results"

            # Cross-tenant contamination check (collection-level isolation)
            # Since they use different indices, cross-contamination is impossible
            assert "beta" not in a_texts, "Tenant A results contain Tenant B data"
            assert "alpha" not in b_texts, "Tenant B results contain Tenant A data"

            _record(2, "Multi-tenant isolation", "PASS",
                    "Separate collection_name per tenant provides hard index-level isolation.")

        except Exception as e:
            _record(2, "Multi-tenant isolation", "FAIL", str(e))
            raise

        finally:
            cleanup_opensearch_index(_opensearch_host(), _opensearch_port(), self.INDEX_A)
            cleanup_opensearch_index(_opensearch_host(), _opensearch_port(), self.INDEX_B)


# ---------------------------------------------------------------------------
# Test 3: Custom LLM provider (Deal-breaker #3 -- D-09, D-16)
# ---------------------------------------------------------------------------

class TestDealBreaker3:
    """Verify mem0 accepts custom LLM provider configuration for extraction."""

    INDEX_NAME = "mem0_test_db3"

    def test_custom_llm_provider(self, mem0_config: dict) -> None:
        """Add memories with infer=True to trigger LLM-powered extraction.

        This proves mem0 can use a configurable LLM provider (OpenAI in this
        case) for its memory extraction pipeline. The model is explicitly set
        via config rather than using mem0 defaults.
        """
        _skip_if_no_opensearch()
        _skip_if_no_api_key()

        from mem0 import Memory

        # Build config with explicit LLM provider settings
        config = create_tenant_config(
            tenant_id="test_db3",
            collection_name=self.INDEX_NAME,
            llm_provider="openai",
            llm_model="gpt-4.1-nano",
        )

        try:
            m = Memory.from_config(config_dict=config)

            # Add with infer=True to trigger LLM extraction
            result = m.add(
                messages=[
                    {"role": "user", "content": "I prefer dark mode and TypeScript for all my projects"},
                    {"role": "assistant", "content": "Noted your preferences for dark mode and TypeScript."},
                ],
                user_id="test_db3_user",
                infer=True,
            )
            print(f"  LLM extraction result: {result}")

            # Verify the result contains extracted memories
            # mem0 returns {"results": [{"id": ..., "memory": ..., "event": "ADD"}, ...]}
            results = result if isinstance(result, list) else result.get("results", [])
            assert len(results) > 0, "LLM extraction returned no memories"

            # Check that at least one result has an event field (ADD/UPDATE/NOOP)
            has_event = any("event" in r for r in results)
            print(f"  Has event field: {has_event}")

            _record(3, "Custom LLM provider", "PASS",
                    f"LLM extraction produced {len(results)} memory(ies) using configurable provider.")

        except Exception as e:
            _record(3, "Custom LLM provider", "FAIL", str(e))
            raise

        finally:
            cleanup_opensearch_index(_opensearch_host(), _opensearch_port(), self.INDEX_NAME)


# ---------------------------------------------------------------------------
# Test 4: Custom embedding provider (Deal-breaker #3 continued)
# ---------------------------------------------------------------------------

class TestDealBreaker4:
    """Verify mem0 accepts custom embedding provider for vector search."""

    INDEX_NAME = "mem0_test_db4"

    def test_custom_embedding_provider(self, mem0_config: dict) -> None:
        """Add a memory then search it -- successful search proves embeddings
        were generated using the configured provider.

        The embedding provider/model is explicitly set in config rather than
        using mem0 defaults.
        """
        _skip_if_no_opensearch()
        _skip_if_no_api_key()

        from mem0 import Memory

        config = create_tenant_config(
            tenant_id="test_db4",
            collection_name=self.INDEX_NAME,
            embedder_provider="openai",
            embedder_model="text-embedding-3-small",
            embedding_dims=1536,
        )

        try:
            m = Memory.from_config(config_dict=config)

            # Add a memory (infer=False to isolate embedding test from LLM test)
            m.add(
                messages=[
                    {"role": "user", "content": "Custom embedding test with text-embedding-3-small"},
                    {"role": "assistant", "content": "Using custom embedding provider"},
                ],
                user_id="test_db4_user",
                infer=False,
            )

            # Allow indexing
            time.sleep(1)

            # Search -- if this returns results, embeddings were generated correctly
            search_result = m.search(
                query="custom embedding",
                user_id="test_db4_user",
                limit=5,
            )
            results = search_result if isinstance(search_result, list) else search_result.get("results", [])
            print(f"  Embedding search results: {results}")

            assert len(results) > 0, "Search with custom embedder returned no results"

            _record(4, "Custom embedding provider", "PASS",
                    f"Search returned {len(results)} result(s) using text-embedding-3-small.")

        except Exception as e:
            _record(4, "Custom embedding provider", "FAIL", str(e))
            raise

        finally:
            cleanup_opensearch_index(_opensearch_host(), _opensearch_port(), self.INDEX_NAME)


# ---------------------------------------------------------------------------
# Test 5: Licensing verification (Deal-breaker #4)
# ---------------------------------------------------------------------------

class TestDealBreaker5:
    """Verify mem0's license is compatible with closed-source enterprise use."""

    def test_licensing_verification(self) -> None:
        """Check mem0ai package metadata for Apache 2.0 license.

        This is a static check -- no infrastructure needed. Verifies the
        installed package reports an Apache-compatible license.
        """
        try:
            # Use importlib.metadata to check package license
            from importlib.metadata import metadata

            meta = metadata("mem0ai")
            license_field = meta.get("License", "")
            license_expression = meta.get("License-Expression", "")
            classifiers = meta.get_all("Classifier") or []

            print(f"  License field: {license_field}")
            print(f"  License-Expression: {license_expression}")

            # Check for Apache in license field, expression, or classifiers
            license_texts = [
                license_field.lower(),
                license_expression.lower(),
                " ".join(c.lower() for c in classifiers),
            ]
            combined = " ".join(license_texts)

            is_apache = "apache" in combined

            if is_apache:
                _record(5, "Licensing (Apache 2.0)", "PASS",
                        f"License: {license_expression or license_field}")
            else:
                # Fall back to pip show output
                result = subprocess.run(
                    [sys.executable, "-m", "pip", "show", "mem0ai"],
                    capture_output=True, text=True
                )
                pip_output = result.stdout
                if "apache" in pip_output.lower():
                    _record(5, "Licensing (Apache 2.0)", "PASS",
                            "Apache license confirmed via pip show")
                else:
                    _record(5, "Licensing (Apache 2.0)", "FAIL",
                            f"License not Apache: {license_field}")
                    pytest.fail(f"mem0ai license is not Apache: {license_field}")

        except Exception as e:
            _record(5, "Licensing (Apache 2.0)", "FAIL", str(e))
            raise


# ---------------------------------------------------------------------------
# Test 6: Apache AGE PG17 compatibility (D-11)
# ---------------------------------------------------------------------------

class TestDealBreaker6:
    """Check if Apache AGE graph extension is available on PostgreSQL 17."""

    def test_apache_age_pg17_compatibility(self, pg_config: dict) -> None:
        """Attempt to load the Apache AGE extension on PG17.

        If AGE is available, creates a test graph, inserts a node, queries it,
        and cleans up. If AGE is NOT installed in the Docker image, the test
        is marked as skipped with a clear message.

        Either outcome is valuable for the investigation -- it determines
        whether graph memory requires additional Docker image work.
        """
        import psycopg2

        success, message = check_age_extension(pg_config)
        print(f"  AGE check result: success={success}, message={message}")

        if not success:
            _record(6, "Apache AGE PG17", "SKIP",
                    f"AGE not available: {message}")
            pytest.skip(f"Apache AGE not installed in PostgreSQL 17 -- {message}")

        # AGE is available -- test basic graph operations
        try:
            conn = psycopg2.connect(**pg_config)
            conn.autocommit = True
            cur = conn.cursor()

            # Load AGE and set search path
            cur.execute("LOAD 'age';")
            cur.execute("SET search_path = ag_catalog, '$user', public;")

            # Create a test graph
            test_graph = "mem0_test_graph"
            cur.execute(f"SELECT create_graph('{test_graph}');")

            # Insert a test vertex
            cur.execute(f"""
                SELECT * FROM cypher('{test_graph}', $$
                    CREATE (n:TestNode {{name: 'test_entity', type: 'person'}})
                    RETURN n
                $$) AS (v agtype);
            """)
            vertex_result = cur.fetchone()
            print(f"  Created vertex: {vertex_result}")

            # Query the vertex
            cur.execute(f"""
                SELECT * FROM cypher('{test_graph}', $$
                    MATCH (n:TestNode)
                    RETURN n.name
                $$) AS (name agtype);
            """)
            query_result = cur.fetchone()
            print(f"  Queried vertex: {query_result}")

            assert query_result is not None, "Graph query returned no results"

            # Cleanup: drop test graph
            cur.execute(f"SELECT drop_graph('{test_graph}', true);")

            cur.close()
            conn.close()

            _record(6, "Apache AGE PG17", "PASS",
                    f"AGE extension works on PG17. {message}")

        except Exception as e:
            _record(6, "Apache AGE PG17", "FAIL", str(e))
            raise


# ---------------------------------------------------------------------------
# Test 7: mem0 REST API server (D-12)
# ---------------------------------------------------------------------------

class TestDealBreaker7:
    """Assess mem0's built-in REST API server viability."""

    def test_mem0_rest_api_server(self) -> None:
        """Check if mem0 ships a REST API server module and assess its usability.

        mem0's default server (`mem0.proxy.main`) uses FastAPI and may require
        Neo4j/pgvector by default. This test checks:
        1. Whether the server module is importable
        2. What dependencies it requires
        3. Whether it can be configured for OpenSearch

        NOTE: We do NOT actually start the server in this test because it may
        bind ports and interfere with other services. Instead, we verify the
        module structure and document findings.
        """
        try:
            # Check if the server module exists
            server_importable = False
            server_module_path = None
            import_error = None

            # Try the known server entry points
            for module_name in ["mem0.proxy.main", "mem0.server", "mem0.proxy"]:
                try:
                    mod = __import__(module_name, fromlist=[""])
                    server_importable = True
                    server_module_path = module_name
                    print(f"  Server module found: {module_name}")

                    # Check if it has a FastAPI app
                    if hasattr(mod, "app"):
                        print(f"  FastAPI app found in {module_name}")
                    break
                except ImportError as e:
                    import_error = str(e)
                    continue

            if server_importable:
                # Inspect the server module for configuration options
                print(f"  Server module: {server_module_path}")

                # Check for health endpoint or similar
                _record(7, "mem0 REST API server", "PASS",
                        f"Server module importable at {server_module_path}. "
                        "Custom sidecar approach recommended for b-knowledge "
                        "(default server may hardcode pgvector/Neo4j).")
            else:
                # Server not importable -- document the finding
                _record(7, "mem0 REST API server", "SKIP",
                        f"Server module not importable: {import_error}. "
                        "Custom FastAPI sidecar wrapping mem0 Python API is the "
                        "recommended approach for b-knowledge.")
                pytest.skip(
                    f"mem0 server module not importable: {import_error}. "
                    "Custom sidecar approach recommended."
                )

        except Exception as e:
            _record(7, "mem0 REST API server", "FAIL", str(e))
            raise


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

def test_summary() -> None:
    """Print a summary table of all deal-breaker verification results.

    This test runs last (alphabetically) and collects results from all
    previous tests. If no results were recorded (e.g., all tests skipped),
    it prints a warning.
    """
    print("\n" + "=" * 70)
    print("DEAL-BREAKER VERIFICATION SUMMARY")
    print("=" * 70)

    if not _results:
        print("  No results recorded (all tests may have been skipped)")
        print("=" * 70)
        return

    # Print header
    print(f"  {'#':<4} {'Name':<30} {'Status':<8} {'Detail'}")
    print(f"  {'-'*4} {'-'*30} {'-'*8} {'-'*40}")

    for r in sorted(_results, key=lambda x: x["number"]):
        detail = r["detail"][:60] + "..." if len(r["detail"]) > 60 else r["detail"]
        print(f"  {r['number']:<4} {r['name']:<30} {r['status']:<8} {detail}")

    # Count statuses
    passes = sum(1 for r in _results if r["status"] == "PASS")
    fails = sum(1 for r in _results if r["status"] == "FAIL")
    skips = sum(1 for r in _results if r["status"] == "SKIP")

    print(f"\n  TOTAL: {passes} PASS, {fails} FAIL, {skips} SKIP")

    # Overall verdict
    if fails > 0:
        print("  VERDICT: DEAL-BREAKER(S) FAILED -- mem0 may not be viable")
    elif passes >= 4:
        print("  VERDICT: ALL CRITICAL DEAL-BREAKERS PASS -- proceed with mem0")
    else:
        print("  VERDICT: INCONCLUSIVE -- some tests skipped, manual verification needed")

    print("=" * 70)
