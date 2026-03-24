"""Shared pytest fixtures for mem0 deal-breaker investigation.

Provides configuration fixtures that connect mem0 to b-knowledge's
existing OpenSearch and PostgreSQL infrastructure for testing.
"""

import os

import pytest


@pytest.fixture
def mem0_config() -> dict:
    """Build a mem0 configuration dict targeting b-knowledge infrastructure.

    Reads connection parameters from environment variables with sensible
    defaults matching docker-compose-base.yml settings.

    Returns:
        dict: Full mem0 configuration with vector_store, llm, and embedder
        sections pointing at the local OpenSearch, OpenAI LLM, and OpenAI
        embedder respectively.
    """
    return {
        "vector_store": {
            "provider": "opensearch",
            "config": {
                "host": os.environ.get("OPENSEARCH_HOST", "localhost"),
                "port": int(os.environ.get("OPENSEARCH_PORT", "9201")),
                "collection_name": "mem0_test_dealbreaker",
                "embedding_model_dims": 1536,
                "use_ssl": False,
                "verify_certs": False,
            },
        },
        "llm": {
            "provider": "openai",
            "config": {
                "model": os.environ.get("MEM0_LLM_MODEL", "gpt-4.1-nano"),
                "temperature": 0.1,
                "api_key": os.environ.get("OPENAI_API_KEY"),
            },
        },
        "embedder": {
            "provider": "openai",
            "config": {
                "model": os.environ.get(
                    "MEM0_EMBEDDER_MODEL", "text-embedding-3-small"
                ),
                "embedding_dims": 1536,
                "api_key": os.environ.get("OPENAI_API_KEY"),
            },
        },
        "version": "v1.1",
    }


@pytest.fixture
def pg_config() -> dict:
    """Build PostgreSQL connection parameters from environment variables.

    Defaults match docker-compose-base.yml and be/.env.example settings.

    Returns:
        dict: PostgreSQL connection parameters (host, port, dbname, user, password).
    """
    return {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": int(os.environ.get("DB_PORT", "5432")),
        "dbname": os.environ.get("DB_NAME", "knowledge_base"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", "change_me"),
    }
