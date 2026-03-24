/**
 * @fileoverview Unit tests for Sync module Zod validation schemas.
 * @description Covers ConnectorSourceType, createConnectorSchema, updateConnectorSchema,
 *   triggerSyncSchema, listSyncLogsQuerySchema, and uuidParamSchema.
 */

import { describe, it, expect } from 'vitest'

import {
  ConnectorSourceType,
  uuidParamSchema,
  createConnectorSchema,
  updateConnectorSchema,
  triggerSyncSchema,
  listSyncLogsQuerySchema,
} from '../../src/modules/sync/schemas/sync.schemas'

// ---------------------------------------------------------------------------
// ConnectorSourceType
// ---------------------------------------------------------------------------

describe('ConnectorSourceType', () => {
  /** @description Should accept all valid source types */
  it('should accept valid source types', () => {
    const validTypes = [
      'blob_storage', 'notion', 'confluence', 'google_drive', 'dropbox',
      'github', 'gitlab', 'bitbucket', 'slack', 'discord', 'gmail',
      'imap', 'jira', 'asana', 'airtable', 'sharepoint', 'teams',
      'moodle', 'zendesk', 'seafile', 'rdbms', 'webdav', 'box', 'dingtalk',
    ]
    for (const type of validTypes) {
      expect(ConnectorSourceType.parse(type)).toBe(type)
    }
  })

  /** @description Should reject invalid source types */
  it('should reject unknown source types', () => {
    expect(() => ConnectorSourceType.parse('invalid_type')).toThrow()
    expect(() => ConnectorSourceType.parse('')).toThrow()
    expect(() => ConnectorSourceType.parse(123)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// uuidParamSchema
// ---------------------------------------------------------------------------

describe('uuidParamSchema', () => {
  /** @description Should accept a valid UUID */
  it('should accept a valid UUID', () => {
    const result = uuidParamSchema.parse({ id: '550e8400e29b41d4a716446655440000' })
    expect(result.id).toBe('550e8400e29b41d4a716446655440000')
  })

  /** @description Should reject invalid UUID format */
  it('should reject invalid UUID format', () => {
    expect(() => uuidParamSchema.parse({ id: 'not-a-uuid' })).toThrow('Invalid UUID format')
  })

  /** @description Should reject missing id field */
  it('should reject missing id', () => {
    expect(() => uuidParamSchema.parse({})).toThrow()
  })
})

// ---------------------------------------------------------------------------
// createConnectorSchema
// ---------------------------------------------------------------------------

describe('createConnectorSchema', () => {
  /** @description Should validate a complete valid payload */
  it('should accept a valid complete payload', () => {
    const payload = {
      name: 'My Connector',
      source_type: 'notion',
      kb_id: '550e8400e29b41d4a716446655440000',
      config: { api_key: 'secret' },
      description: 'A test connector',
      schedule: '0 * * * *',
    }
    const result = createConnectorSchema.parse(payload)
    expect(result.name).toBe('My Connector')
    expect(result.source_type).toBe('notion')
    expect(result.config).toEqual({ api_key: 'secret' })
  })

  /** @description Should apply default empty object for config when not provided */
  it('should default config to empty object', () => {
    const payload = {
      name: 'Minimal',
      source_type: 'github',
      kb_id: '550e8400e29b41d4a716446655440000',
    }
    const result = createConnectorSchema.parse(payload)
    // Config defaults to empty object
    expect(result.config).toEqual({})
  })

  /** @description Should reject empty name */
  it('should reject empty name', () => {
    expect(() => createConnectorSchema.parse({
      name: '',
      source_type: 'notion',
      kb_id: '550e8400e29b41d4a716446655440000',
    })).toThrow('Name is required')
  })

  /** @description Should reject name exceeding max length */
  it('should reject name exceeding 255 characters', () => {
    expect(() => createConnectorSchema.parse({
      name: 'x'.repeat(256),
      source_type: 'notion',
      kb_id: '550e8400e29b41d4a716446655440000',
    })).toThrow()
  })

  /** @description Should reject invalid kb_id UUID */
  it('should reject invalid kb_id format', () => {
    expect(() => createConnectorSchema.parse({
      name: 'Test',
      source_type: 'notion',
      kb_id: 'not-a-uuid',
    })).toThrow('Invalid knowledge base ID')
  })

  /** @description Should reject invalid source_type */
  it('should reject unknown source_type', () => {
    expect(() => createConnectorSchema.parse({
      name: 'Test',
      source_type: 'ftp',
      kb_id: '550e8400e29b41d4a716446655440000',
    })).toThrow()
  })

  /** @description Should reject description over 2000 chars */
  it('should reject description exceeding 2000 characters', () => {
    expect(() => createConnectorSchema.parse({
      name: 'Test',
      source_type: 'notion',
      kb_id: '550e8400e29b41d4a716446655440000',
      description: 'x'.repeat(2001),
    })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// updateConnectorSchema
// ---------------------------------------------------------------------------

describe('updateConnectorSchema', () => {
  /** @description Should accept partial updates (all fields optional) */
  it('should accept partial update with only name', () => {
    const result = updateConnectorSchema.parse({ name: 'Updated Name' })
    expect(result.name).toBe('Updated Name')
  })

  /** @description Should accept empty object (no-op update) */
  it('should accept empty object for no-op update', () => {
    const result = updateConnectorSchema.parse({})
    expect(result).toEqual({})
  })

  /** @description Should still validate field constraints */
  it('should still enforce constraints on provided fields', () => {
    // Empty name should still fail min(1) constraint
    expect(() => updateConnectorSchema.parse({ name: '' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// triggerSyncSchema
// ---------------------------------------------------------------------------

describe('triggerSyncSchema', () => {
  /** @description Should accept empty body (no override) */
  it('should accept empty body', () => {
    const result = triggerSyncSchema.parse({})
    expect(result.poll_range_start).toBeUndefined()
  })

  /** @description Should accept valid ISO 8601 datetime */
  it('should accept valid ISO 8601 poll_range_start', () => {
    const result = triggerSyncSchema.parse({ poll_range_start: '2025-01-01T00:00:00Z' })
    expect(result.poll_range_start).toBe('2025-01-01T00:00:00Z')
  })

  /** @description Should reject invalid datetime format */
  it('should reject non-ISO datetime string', () => {
    expect(() => triggerSyncSchema.parse({ poll_range_start: 'yesterday' })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// listSyncLogsQuerySchema
// ---------------------------------------------------------------------------

describe('listSyncLogsQuerySchema', () => {
  /** @description Should apply defaults for empty query */
  it('should use default page=1 and limit=20', () => {
    const result = listSyncLogsQuerySchema.parse({})
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
    expect(result.status).toBeUndefined()
  })

  /** @description Should coerce string numbers from query params */
  it('should coerce string numbers to integers', () => {
    const result = listSyncLogsQuerySchema.parse({ page: '3', limit: '50' })
    expect(result.page).toBe(3)
    expect(result.limit).toBe(50)
  })

  /** @description Should accept valid status filter values */
  it.each(['pending', 'running', 'completed', 'failed'])('should accept status "%s"', (status) => {
    const result = listSyncLogsQuerySchema.parse({ status })
    expect(result.status).toBe(status)
  })

  /** @description Should reject invalid status values */
  it('should reject invalid status value', () => {
    expect(() => listSyncLogsQuerySchema.parse({ status: 'cancelled' })).toThrow()
  })

  /** @description Should reject page less than 1 */
  it('should reject page < 1', () => {
    expect(() => listSyncLogsQuerySchema.parse({ page: '0' })).toThrow()
  })

  /** @description Should reject limit greater than 100 */
  it('should reject limit > 100', () => {
    expect(() => listSyncLogsQuerySchema.parse({ limit: '101' })).toThrow()
  })

  /** @description Should reject limit less than 1 */
  it('should reject limit < 1', () => {
    expect(() => listSyncLogsQuerySchema.parse({ limit: '0' })).toThrow()
  })
})
