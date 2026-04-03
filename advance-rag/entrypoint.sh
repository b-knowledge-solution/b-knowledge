#!/bin/bash
# entrypoint.sh — selects and starts the appropriate advance-rag worker process.
#
# Controlled via the WORKER_MODE environment variable:
#   task-executor    (default) — document parsing & RAG task executor.
#                                When LOCAL_EMBEDDING_ENABLE=true the embedding
#                                stream consumer is started as a daemon thread
#                                inside executor_wrapper.py automatically — no
#                                separate process or WORKER_MODE change needed.
#   connector-sync             — connector sync worker + web crawl worker (co-started).
#   embedding                  — standalone sentence-transformers embedding worker.
#   web-crawl                  — standalone web crawl worker only.
#
# Uses exec (single-process modes) or wait (multi-process modes) so the
# container receives signals correctly.

set -e

WORKER_MODE="${WORKER_MODE:-task-executor}"

# ── Generate conf/local.service_conf.yaml from environment variables ──────────
# service_conf.yaml hardcodes localhost for all services. At runtime in Docker
# the real hostnames come from environment variables. conf/local.service_conf.yaml
# is merged on top of the base file by config_utils.read_config(), so we write
# it here (overwriting any stale file from a previous run) to ensure the live
# env vars always win — regardless of what is baked into the image.
LOCAL_CONF="/app/conf/local.service_conf.yaml"

# Redis host in service_conf.yaml is "host:port" on a single field.
# REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB come from Docker env_file.
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DB="${REDIS_DB:-0}"

# PostgreSQL
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-knowledge_base}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

# S3-compatible storage (MinIO / RustFS)
S3_ENDPOINT="${S3_ENDPOINT:-localhost}"
S3_PORT="${S3_PORT:-9000}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${S3_SECRET_KEY:-}"
S3_BUCKET="${S3_BUCKET:-knowledge}"
S3_PREFIX_PATH="${S3_PREFIX_PATH:-}"

# OpenSearch / VectorDB
VECTORDB_HOST="${VECTORDB_HOST:-http://localhost:9201}"
VECTORDB_USERNAME="${VECTORDB_USERNAME:-admin}"
VECTORDB_PASSWORD="${VECTORDB_PASSWORD:-}"

# Warn when VECTORDB_HOST still points to localhost — almost certainly wrong in Docker
if echo "${VECTORDB_HOST}" | grep -qE 'localhost|127\.0\.0\.1'; then
  echo "[entrypoint] WARNING: VECTORDB_HOST=${VECTORDB_HOST} — this is likely wrong inside Docker. Set VECTORDB_HOST=http://opensearch:9201 in docker/.env"
fi

echo "[entrypoint] Writing ${LOCAL_CONF} from environment variables"
cat > "${LOCAL_CONF}" <<EOF
redis:
  host: '${REDIS_HOST}:${REDIS_PORT}'
  password: '${REDIS_PASSWORD}'
  db: ${REDIS_DB}
postgres:
  host: '${DB_HOST}'
  port: ${DB_PORT}
  name: '${DB_NAME}'
  user: '${DB_USER}'
  password: '${DB_PASSWORD}'
minio:
  host: '${S3_ENDPOINT}:${S3_PORT}'
  user: '${S3_ACCESS_KEY}'
  password: '${S3_SECRET_KEY}'
  bucket: '${S3_BUCKET}'
  prefix_path: '${S3_PREFIX_PATH}'
os:
  hosts: '${VECTORDB_HOST}'
  username: '${VECTORDB_USERNAME}'
  password: '${VECTORDB_PASSWORD}'
EOF

echo "[entrypoint] Starting advance-rag worker: ${WORKER_MODE}"

case "${WORKER_MODE}" in
  task-executor)
    # executor_wrapper.py co-starts the embedding stream consumer as a daemon
    # thread when LOCAL_EMBEDDING_ENABLE=true — no extra process required.
    exec python -m executor_wrapper
    ;;
  connector-sync)
    # Start web crawl worker alongside the connector sync worker.
    # Both read from Redis queues and run indefinitely, so we background both,
    # forward SIGTERM/SIGINT to each child, then wait for all to finish.
    python -m web_crawl_worker &
    WEB_CRAWL_PID=$!
    python -m connector_sync_worker &
    CONNECTOR_PID=$!

    # Forward termination signals to both child processes for graceful shutdown
    trap 'kill "$WEB_CRAWL_PID" "$CONNECTOR_PID" 2>/dev/null; exit' SIGTERM SIGINT

    # Block until both workers exit
    wait "$WEB_CRAWL_PID" "$CONNECTOR_PID"
    ;;
  embedding)
    exec python -m embedding_worker
    ;;
  web-crawl)
    exec python -m web_crawl_worker
    ;;
  *)
    echo "[entrypoint] ERROR: Unknown WORKER_MODE '${WORKER_MODE}'"
    echo "Valid values: task-executor, connector-sync, embedding, web-crawl"
    exit 1
    ;;
esac
