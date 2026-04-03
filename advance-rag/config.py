"""
b-knowledge advance-rag configuration.

All config is driven by environment variables.
This module provides defaults and a central place to read them.
"""
import os

# Centralized log directory (shared across all modules when set)
LOG_DIR = os.getenv("LOG_DIR", "")

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

# S3-compatible storage (RustFS / MinIO / etc.)
MINIO_HOST = os.getenv("S3_HOST", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "")
MINIO_SECRET_KEY = os.getenv("S3_SECRET_KEY", "")

# System tenant (hex UUID without dashes to fit varchar(32))
SYSTEM_TENANT_ID = os.getenv(
    "SYSTEM_TENANT_ID", "00000000000000000000000000000001"
).replace("-", "")

# Default models (used to initialize system tenant)
DEFAULT_EMBEDDING_MODEL = os.getenv("DEFAULT_EMBEDDING_MODEL", "")
DEFAULT_CHAT_MODEL = os.getenv("DEFAULT_CHAT_MODEL", "")
DEFAULT_RERANK_MODEL = os.getenv("DEFAULT_RERANK_MODEL", "")
DEFAULT_ASR_MODEL = os.getenv("DEFAULT_ASR_MODEL", "")
DEFAULT_IMAGE2TEXT_MODEL = os.getenv("DEFAULT_IMAGE2TEXT_MODEL", "")
DEFAULT_TTS_MODEL = os.getenv("DEFAULT_TTS_MODEL", "")

# Local embedding (Sentence Transformers)
LOCAL_EMBEDDING_ENABLE = os.getenv("LOCAL_EMBEDDING_ENABLE", "false").lower() in ("true", "1", "yes")
LOCAL_EMBEDDING_MODEL = os.getenv("LOCAL_EMBEDDING_MODEL", "")
LOCAL_EMBEDDING_PATH = os.getenv("LOCAL_EMBEDDING_PATH", "")

# FastAPI
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "9380"))
