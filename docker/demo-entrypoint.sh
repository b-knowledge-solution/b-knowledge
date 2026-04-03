#!/bin/bash
# demo-entrypoint.sh — Starts all B-Knowledge services in a single container.
#
# Launches nginx (frontend), Node.js backend, Python RAG task-executor,
# and Python converter worker. Uses tini as PID 1 for proper signal
# handling and zombie reaping.
#
# Startup order:
#   1. Generate advance-rag config from environment variables
#   2. Create runtime directories
#   3. Start nginx (static frontend + API reverse proxy)
#   4. Start backend (Node.js Express API)
#   5. Wait for backend health check
#   6. Start task-executor (Python RAG worker)
#   7. Start converter (Python LibreOffice worker)
#   8. Monitor all child processes

set -e

# ── Colour helpers for log output ────────────────────────────────────────────
log()  { echo "[demo-entrypoint] $*"; }
warn() { echo "[demo-entrypoint] WARNING: $*" >&2; }

# ── PID tracking for graceful shutdown ───────────────────────────────────────
NGINX_PID=""
BACKEND_PID=""
EXECUTOR_PID=""
CONVERTER_PID=""

# Forward SIGTERM/SIGINT to all child processes for graceful shutdown
cleanup() {
    log "Received shutdown signal — stopping all services..."
    # Send SIGTERM to all child processes
    for pid in $NGINX_PID $BACKEND_PID $EXECUTOR_PID $CONVERTER_PID; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
    # Wait for children to exit gracefully (max 15s)
    local timeout=15
    local elapsed=0
    while [ $elapsed -lt $timeout ]; do
        local alive=0
        for pid in $NGINX_PID $BACKEND_PID $EXECUTOR_PID $CONVERTER_PID; do
            if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
                alive=1
            fi
        done
        [ $alive -eq 0 ] && break
        sleep 1
        elapsed=$((elapsed + 1))
    done
    # Force kill any remaining processes
    for pid in $NGINX_PID $BACKEND_PID $EXECUTOR_PID $CONVERTER_PID; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    log "All services stopped."
    exit 0
}

trap cleanup SIGTERM SIGINT

# ── 1. Generate advance-rag config from environment variables ────────────────
# Replicates the config generation from advance-rag/entrypoint.sh
LOCAL_CONF="/app/advance-rag/conf/local.service_conf.yaml"
mkdir -p /app/advance-rag/conf

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DB="${REDIS_DB:-0}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-knowledge_base}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-}"

S3_ENDPOINT="${S3_ENDPOINT:-localhost}"
S3_PORT="${S3_PORT:-9000}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${S3_SECRET_KEY:-}"
S3_BUCKET="${S3_BUCKET:-knowledge}"
S3_PREFIX_PATH="${S3_PREFIX_PATH:-}"

VECTORDB_HOST="${VECTORDB_HOST:-http://localhost:9201}"
VECTORDB_USERNAME="${VECTORDB_USERNAME:-admin}"
VECTORDB_PASSWORD="${VECTORDB_PASSWORD:-}"

log "Writing ${LOCAL_CONF} from environment variables"
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

# ── 2. Create runtime directories ───────────────────────────────────────────
mkdir -p /app/logs /app/be/.data /app/be/config /app/converter/.data

# ── 3. Start nginx ──────────────────────────────────────────────────────────
log "Starting nginx..."
nginx -g 'daemon off;' &
NGINX_PID=$!
log "nginx started (PID: ${NGINX_PID})"

# ── 4. Start backend ────────────────────────────────────────────────────────
log "Starting backend..."
cd /app/be
node dist/app/index.js &
BACKEND_PID=$!
log "Backend started (PID: ${BACKEND_PID})"
cd /

# ── 5. Wait for backend health ──────────────────────────────────────────────
log "Waiting for backend health check..."
MAX_RETRIES=60
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
        log "Backend is healthy!"
        break
    fi
    # Check if backend process is still alive
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        log "ERROR: Backend process exited unexpectedly!"
        cleanup
        exit 1
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $((RETRY_COUNT % 10)) -eq 0 ]; then
        log "Still waiting for backend... (${RETRY_COUNT}/${MAX_RETRIES})"
    fi
    sleep 2
done

if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    log "ERROR: Backend failed to become healthy within $((MAX_RETRIES * 2)) seconds"
    cleanup
    exit 1
fi

# ── 6. Start task-executor (RAG worker) ─────────────────────────────────────
log "Starting task-executor..."
cd /app/advance-rag
python3 -m executor_wrapper &
EXECUTOR_PID=$!
log "Task-executor started (PID: ${EXECUTOR_PID})"
cd /

# ── 7. Start converter ─────────────────────────────────────────────────────
log "Starting converter..."
cd /app/converter
python3 -m src.worker &
CONVERTER_PID=$!
log "Converter started (PID: ${CONVERTER_PID})"
cd /

log "All services started successfully."
log "  nginx:          PID ${NGINX_PID}  (port 80)"
log "  backend:        PID ${BACKEND_PID}  (port 3001)"
log "  task-executor:  PID ${EXECUTOR_PID}"
log "  converter:      PID ${CONVERTER_PID}"

# ── 8. Monitor child processes ──────────────────────────────────────────────
# If any critical process (backend or nginx) exits, shut down everything.
while true; do
    # Check critical processes
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        log "ERROR: Backend process exited unexpectedly!"
        cleanup
        exit 1
    fi
    if ! kill -0 "$NGINX_PID" 2>/dev/null; then
        log "ERROR: nginx process exited unexpectedly!"
        cleanup
        exit 1
    fi
    # Non-critical: log warning if worker dies but don't exit
    if [ -n "$EXECUTOR_PID" ] && ! kill -0 "$EXECUTOR_PID" 2>/dev/null; then
        warn "Task-executor process exited — RAG processing unavailable"
        EXECUTOR_PID=""
    fi
    if [ -n "$CONVERTER_PID" ] && ! kill -0 "$CONVERTER_PID" 2>/dev/null; then
        warn "Converter process exited — document conversion unavailable"
        CONVERTER_PID=""
    fi
    sleep 5
done
