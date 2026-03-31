
/**
 * @fileoverview Zod validation schemas for the Sync module.
 * @description Defines request validation schemas for connector CRUD,
 *   sync task creation, and query parameters.
 * @module modules/sync/schemas
 */
import { z } from 'zod'
import { hexIdWith } from '@/shared/utils/uuid.js'

/**
 * Supported connector source types.
 * @description Each value maps to a specific external data source integration.
 */
export const ConnectorSourceType = z.enum([
  'blob_storage',
  'notion',
  'confluence',
  'google_drive',
  'dropbox',
  'github',
  'gitlab',
  'bitbucket',
  'slack',
  'discord',
  'gmail',
  'imap',
  'jira',
  'asana',
  'airtable',
  'sharepoint',
  'teams',
  'moodle',
  'zendesk',
  'seafile',
  'rdbms',
  'webdav',
  'box',
  'dingtalk',
])

/**
 * UUID path parameter schema.
 * @description Validates that route params contain a valid UUID.
 */
export const uuidParamSchema = z.object({
  id: hexIdWith('Invalid UUID format'),
})

/**
 * Schema for creating a new connector.
 * @description Validates required fields and connector configuration.
 */
export const createConnectorSchema = z.object({
  /** Human-readable connector name */
  name: z.string().min(1, 'Name is required').max(255),
  /** External data source type */
  source_type: ConnectorSourceType,
  /** Target knowledge base ID to sync documents into */
  kb_id: hexIdWith('Invalid knowledge base ID'),
  /** Source-specific configuration (API keys, URLs, etc.) */
  config: z.record(z.unknown()).default({}),
  /** Optional description */
  description: z.string().max(2000).optional(),
  /** Cron expression for automatic sync scheduling */
  schedule: z.string().max(128).optional(),
})

/**
 * Schema for updating an existing connector.
 * @description All fields are optional for partial updates.
 */
export const updateConnectorSchema = createConnectorSchema.partial().extend({
  /** Connector status for pause/resume (not settable on create) */
  status: z.enum(['active', 'paused']).optional(),
})

/**
 * Schema for triggering a manual sync.
 * @description Optionally override the poll range start.
 */
export const triggerSyncSchema = z.object({
  /** Override poll range start timestamp (ISO 8601) */
  poll_range_start: z.string().datetime().optional(),
})

/**
 * Schema for listing sync logs query parameters.
 * @description Validates pagination and filter parameters.
 */
export const listSyncLogsQuerySchema = z.object({
  /** Page number (1-based) */
  page: z.coerce.number().int().min(1).default(1),
  /** Items per page */
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Filter by sync status */
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
})

/**
 * Schema for testing a connection to an external data source (SYN-FR-31).
 * @description Validates source type and configuration without requiring a full connector.
 */
export const testConnectionSchema = z.object({
  /** External data source type to test */
  source_type: ConnectorSourceType,
  /** Connection credentials and settings to validate */
  config: z.record(z.unknown()).default({}),
})

/**
 * Schema for delete connector query parameters.
 * @description Optionally cascade-delete synced documents.
 */
export const deleteConnectorQuerySchema = z.object({
  /** If true, also delete documents synced by this connector from the knowledge base */
  cascade_documents: z.coerce.boolean().default(false),
})
