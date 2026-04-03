/**
 * @description Constants for the local embedding system (Phase 11).
 * Shared between llm-provider service, embedding-stream service,
 * llm-client service, and model-provider model.
 *
 * Cross-language note: Python mirrors these values in
 * advance-rag/embed_constants.py — keep both files in sync.
 */

// ── Valkey Stream keys ─────────────────────────────────────────────

/** Stream key for embedding requests (XADD from Node.js, XREADGROUP from Python) */
export const EMBED_REQUEST_STREAM = 'embed:requests'

/** Response key prefix — full key is `embed:response:{requestId}` */
export const EMBED_RESPONSE_PREFIX = 'embed:response:'

/** Health heartbeat key — Python worker publishes TTL-based status here */
export const EMBED_WORKER_STATUS_KEY = 'embed:worker:status'

// ── Factory / provider identifiers ─────────────────────────────────

/** Factory name for the local Sentence Transformers embedding provider */
export const SENTENCE_TRANSFORMERS_FACTORY = 'SentenceTransformers'

/** Sentinel API key value used for system-managed providers (not a real key) */
export const SYSTEM_API_KEY_SENTINEL = '__system__'

/** Default max token context length for SentenceTransformers embedding models */
export const SENTENCE_TRANSFORMERS_MAX_TOKENS = 2048

// ── Embedding worker status values ─────────────────────────────────

/** Status values published to embed:worker:status Valkey key */
export const EmbeddingWorkerStatus = {
  READY: 'ready',
  LOADING: 'loading',
  OFFLINE: 'offline',
} as const

export type EmbeddingWorkerStatusType = (typeof EmbeddingWorkerStatus)[keyof typeof EmbeddingWorkerStatus]

// ── BRPOP config ───────────────────────────────────────────────────

/** Timeout in seconds for BRPOP wait on response keys */
export const BRPOP_TIMEOUT_SECONDS = 30
