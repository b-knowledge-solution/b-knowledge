"""
b-knowledge advance-rag configuration.

All config is driven by environment variables.
This module provides defaults and a central place to read them.
"""
import os

# Database (PostgreSQL)
DB_TYPE = os.getenv("DB_TYPE", "postgres")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "b_knowledge")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

# Redis
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

# Elasticsearch
ES_HOST = os.getenv("ES_HOST", "http://localhost:9200")
ES_PASSWORD = os.getenv("ES_PASSWORD", "")

# MinIO
MINIO_HOST = os.getenv("MINIO_HOST", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "")

# System tenant
SYSTEM_TENANT_ID = os.getenv(
    "SYSTEM_TENANT_ID", "00000000-0000-0000-0000-000000000001"
)

# Default models (used to initialize system tenant)
DEFAULT_EMBEDDING_MODEL = os.getenv("DEFAULT_EMBEDDING_MODEL", "")
DEFAULT_CHAT_MODEL = os.getenv("DEFAULT_CHAT_MODEL", "")
DEFAULT_RERANK_MODEL = os.getenv("DEFAULT_RERANK_MODEL", "")
DEFAULT_ASR_MODEL = os.getenv("DEFAULT_ASR_MODEL", "")
DEFAULT_IMAGE2TEXT_MODEL = os.getenv("DEFAULT_IMAGE2TEXT_MODEL", "")
DEFAULT_TTS_MODEL = os.getenv("DEFAULT_TTS_MODEL", "")

# FastAPI
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "9380"))
