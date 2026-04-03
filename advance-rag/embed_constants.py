"""Shared constants for the local embedding system.

Used by both embedding_worker.py and executor_wrapper.py to ensure
Valkey keys, factory names, and status values are never hardcoded
as string literals.

Cross-language note: The TypeScript backend mirrors these values in
be/src/shared/constants/embedding.ts — keep both files in sync.
"""


# ── Valkey Stream keys ─────────────────────────────────────────────
STREAM_KEY = "embed:requests"
RESPONSE_PREFIX = "embed:response:"
HEALTH_KEY = "embed:worker:status"

# ── Stream consumer group ──────────────────────────────────────────
GROUP_NAME = "embed-workers"

# ── Factory / provider identifiers ─────────────────────────────────
SENTENCE_TRANSFORMERS_FACTORY = "SentenceTransformers"
SYSTEM_API_KEY = "__system__"

# ── Embedding batch config ─────────────────────────────────────────
RESPONSE_TTL_SECONDS = 60
HEALTH_TTL_SECONDS = 30
HEARTBEAT_INTERVAL = 15
TRIM_INTERVAL = 100
TRIM_MAXLEN = 10000
BLOCK_MS = 5000


class WorkerStatus:
    """Status values published to the embed:worker:status Valkey key.

    These must match the TypeScript EmbeddingWorkerStatus enum in
    be/src/shared/constants/embedding.ts exactly.
    """

    READY = "ready"
    LOADING = "loading"
    OFFLINE = "offline"
