/**
 * @description Status constants for all domain entities in the frontend
 */

/** Agent lifecycle statuses */
export const AgentStatus = {
  PUBLISHED: 'published',
  DRAFT: 'draft',
} as const

export type AgentStatusType = (typeof AgentStatus)[keyof typeof AgentStatus]

/** Data connector statuses */
export const ConnectorStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  ERROR: 'error',
} as const

export type ConnectorStatusType = (typeof ConnectorStatus)[keyof typeof ConnectorStatus]

/** File upload statuses */
export const UploadStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  UPLOADING: 'uploading',
  PENDING: 'pending',
} as const

export type UploadStatusType = (typeof UploadStatus)[keyof typeof UploadStatus]

/** Job/conversion statuses */
export const JobStatus = {
  FINISHED: 'finished',
  FAILED: 'failed',
  CONVERTING: 'converting',
  WAITING: 'waiting',
  PENDING: 'pending',
} as const

export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus]

/** Agent run/debug step statuses */
export const RunStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  SKIPPED: 'skipped',
} as const

export type RunStatusType = (typeof RunStatus)[keyof typeof RunStatus]

/** Version/dataset lifecycle statuses */
export const VersionStatus = {
  PARSING: 'parsing',
  READY: 'ready',
  ERROR: 'error',
  ARCHIVED: 'archived',
} as const

export type VersionStatusType = (typeof VersionStatus)[keyof typeof VersionStatus]

/**
 * @description Document run status values from the RAG backend
 * These are numeric strings ('0', '1', '2') used by the Python worker
 */
export const DocumentRunStatus = {
  NOT_STARTED: '0',
  PARSING: '1',
  CANCELLED: '2',
} as const

export type DocumentRunStatusType = (typeof DocumentRunStatus)[keyof typeof DocumentRunStatus]

/** Knowledge graph build statuses */
export const GraphStatus = {
  NOT_STARTED: 'not_started',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
} as const

export type GraphStatusType = (typeof GraphStatus)[keyof typeof GraphStatus]

/** Sync job statuses */
export const SyncStatus = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  RUNNING: 'running',
  PENDING: 'pending',
} as const

export type SyncStatusType = (typeof SyncStatus)[keyof typeof SyncStatus]

/** Pipeline stage statuses */
export const PipelineStatus = {
  COMPLETE: 'complete',
  ERROR: 'error',
  RUNNING: 'running',
} as const

export type PipelineStatusType = (typeof PipelineStatus)[keyof typeof PipelineStatus]

/** Health/system service statuses */
export const HealthStatus = {
  OK: 'ok',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  NOT_CONFIGURED: 'not_configured',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  ONLINE: 'online',
} as const

export type HealthStatusType = (typeof HealthStatus)[keyof typeof HealthStatus]

/** Document source types */
export const DocumentSource = {
  LOCAL: 'local',
  IMPORTED: 'imported',
  CONVERTED: 'converted',
} as const

export type DocumentSourceType = (typeof DocumentSource)[keyof typeof DocumentSource]

/** Document processing statuses (uppercase from Python worker) */
export const DocumentProcessStatus = {
  RUNNING: 'RUNNING',
  UNSTART: 'UNSTART',
} as const

export type DocumentProcessStatusType = (typeof DocumentProcessStatus)[keyof typeof DocumentProcessStatus]

/** Stream event types */
export const StreamEventType = {
  DONE: 'done',
  ERROR: 'error',
} as const

export type StreamEventTypeValue = (typeof StreamEventType)[keyof typeof StreamEventType]

/** Chat pipeline modes */
export const PipelineMode = {
  DEEP_RESEARCH: 'deep_research',
} as const

export type PipelineModeType = (typeof PipelineMode)[keyof typeof PipelineMode]

/** Filter preset values */
export const FilterPreset = {
  ALL: 'all',
  CUSTOM: 'custom',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
} as const

export type FilterPresetType = (typeof FilterPreset)[keyof typeof FilterPreset]
