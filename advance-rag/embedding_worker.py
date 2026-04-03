"""Valkey Stream consumer for query-time embedding via Sentence Transformers.

Standalone Python process that reads embedding requests from the
``embed:requests`` Valkey Stream and responds with embedding vectors
via LPUSH to per-request response keys.

Protocol:
    - Producer (Node.js): XADD embed:requests * requestId {uuid} text {query}
    - Consumer (this worker): XREADGROUP GROUP embed-workers worker-{id} ...
    - Response: LPUSH embed:response:{requestId} {json_vector}
    - Cleanup: EXPIRE embed:response:{requestId} 60

Usage:
    python -m embedding_worker
"""

import json
import os
import signal
import socket
import sys
import time

# Load .env file before any other imports read environment variables
from dotenv import load_dotenv

load_dotenv()

# Ensure advance-rag root is on sys.path so config module resolves
_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _root)

import redis
from loguru import logger

import config

# ── Stream constants ────────────────────────────────────────────────
STREAM_KEY = "embed:requests"
GROUP_NAME = "embed-workers"
RESPONSE_PREFIX = "embed:response:"
BLOCK_MS = 5000
RESPONSE_TTL_SECONDS = 60
TRIM_INTERVAL = 100
TRIM_MAXLEN = 10000
HEALTH_KEY = "embed:worker:status"
HEALTH_TTL_SECONDS = 30
HEARTBEAT_INTERVAL = 15


def create_redis_client():
    """Create a Redis client using centralized config values.

    Returns:
        redis.Redis: Connected Redis client with string decoding enabled.
    """
    return redis.Redis(
        host=config.REDIS_HOST,
        port=config.REDIS_PORT,
        password=config.REDIS_PASSWORD or None,
        decode_responses=True,
    )


def ensure_consumer_group(r):
    """Create the consumer group on the stream (idempotent).

    If the group already exists, the BUSYGROUP error is caught and ignored.

    Args:
        r: Redis client instance.
    """
    try:
        r.xgroup_create(STREAM_KEY, GROUP_NAME, id="0", mkstream=True)
        logger.info("Created consumer group '{}' on stream '{}'", GROUP_NAME, STREAM_KEY)
    except redis.exceptions.ResponseError as e:
        # BUSYGROUP means the group already exists -- safe to ignore
        if "BUSYGROUP" in str(e):
            logger.debug("Consumer group '{}' already exists", GROUP_NAME)
        else:
            raise


def load_model():
    """Load the SentenceTransformers model using config settings.

    Uses LOCAL_EMBEDDING_PATH (offline / pre-downloaded) if set,
    otherwise falls back to LOCAL_EMBEDDING_MODEL (HuggingFace Hub download).

    Returns:
        SentenceTransformer: Loaded model ready for encoding.
    """
    from sentence_transformers import SentenceTransformer

    model_path = config.LOCAL_EMBEDDING_PATH or config.LOCAL_EMBEDDING_MODEL
    logger.info("Loading SentenceTransformers model: {}", model_path)

    model = SentenceTransformer(model_path, device="cpu")

    # Log model info for operational visibility
    embedding_dim = model.get_sentence_embedding_dimension()
    logger.info("Model loaded — embedding dimension: {}", embedding_dim)
    return model


def process_message(r, model, msg_id, data):
    """Process a single embedding request from the stream.

    Encodes the text with the loaded model, pushes the result vector to
    the per-request response key, sets a TTL for cleanup, and ACKs the
    stream message.

    Args:
        r: Redis client instance.
        model: Loaded SentenceTransformer model.
        msg_id: Stream message ID for acknowledgment.
        data: Message payload dict with 'requestId' and 'text' keys.
    """
    request_id = data["requestId"]
    text = data["text"]

    # Encode with loaded model (per D-12: individual processing, no micro-batching)
    embedding = model.encode([text], normalize_embeddings=True, show_progress_bar=False)
    vector = embedding[0].tolist()

    # Respond via LPUSH and set TTL for automatic cleanup
    response_key = f"{RESPONSE_PREFIX}{request_id}"
    r.lpush(response_key, json.dumps(vector))
    r.expire(response_key, RESPONSE_TTL_SECONDS)

    # Acknowledge message so it is not redelivered
    r.xack(STREAM_KEY, GROUP_NAME, msg_id)


def publish_health(r, model, status="ready"):
    """Publish worker health status to Valkey with TTL-based liveness.

    The key auto-expires after HEALTH_TTL_SECONDS. The worker must
    refresh it periodically via heartbeat to signal it is still alive.
    If the key is absent, the model is considered offline.

    Args:
        r: Redis client instance.
        model: Loaded SentenceTransformer model (or None if not loaded).
        status: One of 'loading', 'ready', 'offline'.
    """
    embedding_dim = model.get_sentence_embedding_dimension() if model else 0
    model_name = config.LOCAL_EMBEDDING_MODEL or ""
    health_data = json.dumps({
        "status": status,
        "model": model_name,
        "dimension": embedding_dim,
        "worker": f"{socket.gethostname()}-{os.getpid()}",
        "loaded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    # SET with TTL — key auto-expires if worker dies without cleanup
    r.set(HEALTH_KEY, health_data, ex=HEALTH_TTL_SECONDS)


def main():
    """Run the embedding worker consumer loop.

    Connects to Redis, ensures the consumer group exists, loads the
    SentenceTransformers model, and enters a XREADGROUP loop that
    processes embedding requests until SIGTERM/SIGINT is received.
    """
    r = create_redis_client()
    ensure_consumer_group(r)

    # Publish loading status before model load (can take minutes on first download)
    r.set(HEALTH_KEY, json.dumps({"status": "loading", "model": config.LOCAL_EMBEDDING_MODEL or ""}), ex=300)

    model = load_model()

    # Publish ready status after model is loaded
    publish_health(r, model, status="ready")

    # Generate unique worker ID based on hostname + PID
    worker_id = f"worker-{socket.gethostname()}-{os.getpid()}"
    logger.info("Starting embedding worker: {}", worker_id)

    shutdown_flag = False
    processed_count = 0
    last_heartbeat = time.time()

    def handle_shutdown(signum, frame):
        """Set shutdown flag on SIGTERM/SIGINT for graceful exit."""
        nonlocal shutdown_flag
        shutdown_flag = True
        logger.info("Signal {} received, shutting down gracefully...", signum)

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    while not shutdown_flag:
        try:
            messages = r.xreadgroup(
                GROUP_NAME,
                worker_id,
                {STREAM_KEY: ">"},
                count=1,
                block=BLOCK_MS,
            )

            # Refresh heartbeat periodically to signal liveness
            now = time.time()
            if now - last_heartbeat >= HEARTBEAT_INTERVAL:
                publish_health(r, model, status="ready")
                last_heartbeat = now

            # No messages within the block timeout -- loop again
            if not messages:
                continue

            for stream_name, entries in messages:
                for msg_id, data in entries:
                    process_message(r, model, msg_id, data)
                    processed_count += 1

                    # Periodically trim the stream to bound memory usage
                    if processed_count % TRIM_INTERVAL == 0:
                        r.xtrim(STREAM_KEY, maxlen=TRIM_MAXLEN, approximate=True)
                        logger.debug(
                            "Stream trimmed (approx maxlen={}), processed {} total",
                            TRIM_MAXLEN,
                            processed_count,
                        )

        except redis.exceptions.ConnectionError:
            logger.error("Redis connection lost, retrying in 3s...")
            time.sleep(3)
        except Exception as e:
            logger.exception("Error processing embedding request: {}", e)

    # Clean up health key on graceful shutdown
    r.delete(HEALTH_KEY)
    logger.info("Embedding worker shut down after processing {} requests", processed_count)


if __name__ == "__main__":
    # Validate config before starting the worker
    if not config.LOCAL_EMBEDDING_ENABLE:
        logger.error("LOCAL_EMBEDDING_ENABLE is not true. Exiting.")
        sys.exit(1)
    if not config.LOCAL_EMBEDDING_MODEL:
        logger.error("LOCAL_EMBEDDING_MODEL is required. Exiting.")
        sys.exit(1)

    main()
