
/**
 * @fileoverview Type definitions for the Sync module entities.
 * @description Defines interfaces matching the connectors and sync_logs database tables.
 * @module modules/sync/models/types
 */

/**
 * Connector interface representing a record in the 'connectors' table.
 * @description An external data source connection configuration.
 */
export interface Connector {
  /** Unique UUID for the connector */
  id: string
  /** Human-readable connector name */
  name: string
  /** External data source type (e.g., 'github', 'slack', 'google_drive') */
  source_type: string
  /** Target knowledge base ID to sync documents into */
  kb_id: string
  /** Source-specific configuration (API keys, OAuth tokens, URLs, etc.) */
  config: Record<string, unknown>
  /** Optional description */
  description: string | null
  /** Cron expression for automatic sync scheduling */
  schedule: string | null
  /** Current connector status */
  status: 'active' | 'paused' | 'error'
  /** Timestamp of last successful sync */
  last_synced_at: Date | null
  /** User ID who created this connector */
  created_by: string | null
  /** User ID who last updated this connector */
  updated_by: string | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}

/**
 * SyncLog interface representing a record in the 'sync_logs' table.
 * @description Tracks individual sync task executions and their outcomes.
 */
export interface SyncLog {
  /** Unique UUID for the sync log entry */
  id: string
  /** Reference to the connector that triggered the sync */
  connector_id: string
  /** Target knowledge base ID */
  kb_id: string
  /** Sync task status */
  status: 'pending' | 'running' | 'completed' | 'failed'
  /** Number of documents synced in this run */
  docs_synced: number
  /** Number of documents that failed to sync */
  docs_failed: number
  /** Number of unchanged documents skipped during delta sync */
  docs_skipped: number
  /** Number of orphaned documents deleted during delta sync */
  docs_deleted: number
  /** Progress percentage (0-100) */
  progress: number
  /** Human-readable progress or error message */
  message: string | null
  /** Timestamp when sync started */
  started_at: Date | null
  /** Timestamp when sync completed */
  finished_at: Date | null
  /** Timestamp of record creation */
  created_at: Date
  /** Timestamp of last update */
  updated_at: Date
}
