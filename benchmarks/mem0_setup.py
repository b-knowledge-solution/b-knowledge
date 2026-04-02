"""mem0 initialization and configuration helpers for b-knowledge investigation.

Provides helper functions to create tenant-scoped mem0 configurations,
clean up test OpenSearch indices, and check Apache AGE extension
availability on PostgreSQL 17.
"""

import os

from opensearchpy import OpenSearch


def create_tenant_config(
    tenant_id: str,
    collection_name: str,
    llm_provider: str = "openai",
    llm_model: str = "gpt-4.1-nano",
    embedder_provider: str = "openai",
    embedder_model: str = "text-embedding-3-small",
    embedding_dims: int = 1536,
) -> dict:
    """Build a full mem0 config dict scoped to a specific tenant.

    Args:
        tenant_id: Unique identifier for the tenant (used in metadata, not in config directly).
        collection_name: OpenSearch index name for this tenant's memories.
        llm_provider: LLM provider name (e.g., "openai", "ollama", "litellm").
        llm_model: Model identifier for the LLM provider.
        embedder_provider: Embedding provider name (e.g., "openai", "ollama").
        embedder_model: Model identifier for the embedding provider.
        embedding_dims: Dimensionality of the embedding vectors.

    Returns:
        dict: Complete mem0 configuration dictionary ready for Memory.from_config().
    """
    return {
        "vector_store": {
            "provider": "opensearch",
            "config": {
                "host": os.environ.get("OPENSEARCH_HOST", "localhost"),
                "port": int(os.environ.get("OPENSEARCH_PORT", "9201")),
                "collection_name": collection_name,
                "embedding_model_dims": embedding_dims,
                "use_ssl": False,
                "verify_certs": False,
            },
        },
        "llm": {
            "provider": llm_provider,
            "config": {
                "model": llm_model,
                "temperature": 0.1,
                "api_key": os.environ.get("OPENAI_API_KEY"),
            },
        },
        "embedder": {
            "provider": embedder_provider,
            "config": {
                "model": embedder_model,
                "embedding_dims": embedding_dims,
                "api_key": os.environ.get("OPENAI_API_KEY"),
            },
        },
        "version": "v1.1",
    }


def cleanup_opensearch_index(host: str, port: int, index_name: str) -> None:
    """Delete a test OpenSearch index to clean up after investigation tests.

    Uses the opensearch-py client directly (not mem0) to ensure cleanup
    succeeds even if mem0 is in a bad state.

    Args:
        host: OpenSearch hostname (e.g., "localhost").
        port: OpenSearch port (e.g., 9201).
        index_name: Name of the index to delete.
    """
    client = OpenSearch(
        hosts=[{"host": host, "port": port}],
        use_ssl=False,
        verify_certs=False,
    )
    # Only attempt deletion if the index actually exists
    if client.indices.exists(index=index_name):
        client.indices.delete(index=index_name)
        print(f"  Cleaned up index: {index_name}")
    else:
        print(f"  Index not found (already clean): {index_name}")


def check_age_extension(pg_config: dict) -> tuple[bool, str]:
    """Check whether Apache AGE extension is available on PostgreSQL.

    Attempts to create the AGE extension. If the extension binary is not
    installed in the PostgreSQL Docker image, this will fail gracefully.

    Args:
        pg_config: PostgreSQL connection parameters dict with keys:
            host, port, dbname, user, password.

    Returns:
        Tuple of (success, message) where success is True if AGE is
        available and usable, False otherwise. Message contains details.
    """
    import psycopg2

    try:
        conn = psycopg2.connect(
            host=pg_config["host"],
            port=pg_config["port"],
            dbname=pg_config["dbname"],
            user=pg_config["user"],
            password=pg_config["password"],
        )
        conn.autocommit = True
        cur = conn.cursor()

        # Attempt to load the AGE extension
        cur.execute("CREATE EXTENSION IF NOT EXISTS age;")

        # Verify AGE is loaded by checking available extensions
        cur.execute(
            "SELECT extname, extversion FROM pg_extension WHERE extname = 'age';"
        )
        row = cur.fetchone()

        cur.close()
        conn.close()

        if row:
            return True, f"Apache AGE installed: version {row[1]}"
        else:
            return False, "CREATE EXTENSION succeeded but AGE not found in pg_extension"

    except psycopg2.OperationalError as e:
        return False, f"PostgreSQL connection failed: {e}"
    except psycopg2.errors.UndefinedFile as e:
        # Extension binary not installed in the PG image
        return False, f"Apache AGE extension not available: {e}"
    except psycopg2.Error as e:
        return False, f"PostgreSQL error: {e}"
