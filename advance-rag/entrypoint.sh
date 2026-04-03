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
