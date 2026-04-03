/**
 * @description Constants for the local embedding system UI.
 * Used by LLM provider page and dataset settings components.
 *
 * Values must match be/src/shared/constants/embedding.ts and
 * advance-rag/embed_constants.py exactly.
 */

/** Status values for the embedding worker health badge */
export const EmbeddingWorkerStatus = {
  READY: 'ready',
  LOADING: 'loading',
  OFFLINE: 'offline',
} as const

export type EmbeddingWorkerStatusType = (typeof EmbeddingWorkerStatus)[keyof typeof EmbeddingWorkerStatus]
