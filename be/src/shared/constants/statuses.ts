/**
 * @description Status constants for all domain entities
 */

/** Agent lifecycle statuses */
export const AgentStatus = {
  PUBLISHED: 'published',
  DRAFT: 'draft',
} as const

export type AgentStatusType = (typeof AgentStatus)[keyof typeof AgentStatus]

/** Dataset statuses */
export const DatasetStatus = {
  ACTIVE: 'active',
  DELETED: 'deleted',
} as const

export type DatasetStatusType = (typeof DatasetStatus)[keyof typeof DatasetStatus]

/**
 * @description Document category version lifecycle statuses from the
 * `document_category_versions` table.
 */
export const DocumentCategoryVersionStatus = {
  ACTIVE: 'active',
  SYNCING: 'syncing',
  ARCHIVED: 'archived',
} as const

export type DocumentCategoryVersionStatusType =
  (typeof DocumentCategoryVersionStatus)[keyof typeof DocumentCategoryVersionStatus]

/**
 * @description Version statuses whose underlying datasets are searchable by
 * grant-based retrieval in Phase 6.
 */
export const SEARCHABLE_VERSION_STATUSES = [
  DocumentCategoryVersionStatus.ACTIVE,
  DocumentCategoryVersionStatus.SYNCING,
] as const

/** RAG task processing statuses */
export const TaskStatus = {
  DONE: 'done',
  FAILED: 'failed',
  RUNNING: 'running',
} as const

export type TaskStatusType = (typeof TaskStatus)[keyof typeof TaskStatus]

/** LLM provider statuses */
export const ProviderStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DELETED: 'deleted',
} as const

export type ProviderStatusType = (typeof ProviderStatus)[keyof typeof ProviderStatus]

/** Data connector statuses */
export const ConnectorStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  ERROR: 'error',
} as const

export type ConnectorStatusType = (typeof ConnectorStatus)[keyof typeof ConnectorStatus]

/** Sync job statuses */
export const SyncStatus = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  RUNNING: 'running',
  PENDING: 'pending',
} as const

export type SyncStatusType = (typeof SyncStatus)[keyof typeof SyncStatus]

/** Health check statuses */
export const HealthStatus = {
  OK: 'ok',
  DEGRADED: 'degraded',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  NOT_CONFIGURED: 'not_configured',
} as const

export type HealthStatusType = (typeof HealthStatus)[keyof typeof HealthStatus]

/** Agent execution message types */
export const StreamMessageType = {
  DONE: 'done',
  ERROR: 'error',
} as const

export type StreamMessageTypeValue = (typeof StreamMessageType)[keyof typeof StreamMessageType]
