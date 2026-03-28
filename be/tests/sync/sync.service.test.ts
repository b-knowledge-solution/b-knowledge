/**
 * @fileoverview Unit tests for SyncService.
 * @description Covers connector CRUD, sync triggering, and sync log listing
 *   with all external dependencies mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConnectorCreate = vi.fn()
const mockConnectorFindById = vi.fn()
const mockConnectorFindAll = vi.fn()
const mockConnectorUpdate = vi.fn()
const mockConnectorDelete = vi.fn()
const mockSyncLogCreate = vi.fn()
const mockSyncLogFindAll = vi.fn()
const mockRedisLPush = vi.fn()
const mockSyncLogUpdate = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    connector: {
      create: (...args: any[]) => mockConnectorCreate(...args),
      findById: (...args: any[]) => mockConnectorFindById(...args),
      findAll: (...args: any[]) => mockConnectorFindAll(...args),
      update: (...args: any[]) => mockConnectorUpdate(...args),
      delete: (...args: any[]) => mockConnectorDelete(...args),
    },
    syncLog: {
      create: (...args: any[]) => mockSyncLogCreate(...args),
      findAll: (...args: any[]) => mockSyncLogFindAll(...args),
      update: (...args: any[]) => mockSyncLogUpdate(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock Redis service for queue operations
vi.mock('@/shared/services/redis.service.js', () => ({
  getRedisClient: () => ({
    lPush: (...args: any[]) => mockRedisLPush(...args),
    duplicate: () => ({
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    }),
  }),
}))

// Mock config for tenant ID
vi.mock('@/shared/config/index.js', () => ({
  config: {
    systemTenantId: 'test-tenant-id',
  },
}))

// Mock sync scheduler service
vi.mock('../../src/modules/sync/services/sync-scheduler.service.js', () => ({
  syncSchedulerService: {
    updateTask: vi.fn(),
    unregisterTask: vi.fn(),
  },
}))

// Import after mocks are set up
import { SyncService } from '../../src/modules/sync/services/sync.service'

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SyncService', () => {
  let service: SyncService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new SyncService()
  })

  // -------------------------------------------------------------------------
  // createConnector
  // -------------------------------------------------------------------------

  describe('createConnector', () => {
    /** @description Should create a connector with active status and user context */
    it('should create a connector with active status and user audit fields', async () => {
      const mockData = { name: 'Test Connector', source_type: 'notion', kb_id: 'kb-1' }
      const mockUser = { id: 'user-1', email: 'test@example.com' }
      const mockResult = { id: 'conn-1', ...mockData, status: 'active' }

      mockConnectorCreate.mockResolvedValue(mockResult)

      const result = await service.createConnector(mockData, mockUser)

      // Verify connector is created with active status and user audit fields
      expect(mockConnectorCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockData,
          status: 'active',
          created_by: 'user-1',
          updated_by: 'user-1',
        }),
      )
      expect(result).toEqual(mockResult)
    })

    /** @description Should create connector without user context (null audit fields) */
    it('should create connector with null audit fields when no user provided', async () => {
      const mockData = { name: 'No User Connector', source_type: 's3', kb_id: 'kb-2' }
      const mockResult = { id: 'conn-2', ...mockData, status: 'active' }

      mockConnectorCreate.mockResolvedValue(mockResult)

      const result = await service.createConnector(mockData)

      // Verify null is used for audit fields when no user context
      expect(mockConnectorCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          created_by: null,
          updated_by: null,
        }),
      )
      expect(result).toEqual(mockResult)
    })

    /** @description Should propagate errors from model layer */
    it('should throw when creation fails', async () => {
      mockConnectorCreate.mockRejectedValue(new Error('DB error'))

      await expect(service.createConnector({ name: 'Fail' })).rejects.toThrow('DB error')
    })
  })

  // -------------------------------------------------------------------------
  // getConnector
  // -------------------------------------------------------------------------

  describe('getConnector', () => {
    /** @description Should return connector when found */
    it('should return a connector by ID', async () => {
      const mockConnector = { id: 'conn-1', name: 'Test' }
      mockConnectorFindById.mockResolvedValue(mockConnector)

      const result = await service.getConnector('conn-1')

      expect(mockConnectorFindById).toHaveBeenCalledWith('conn-1')
      expect(result).toEqual(mockConnector)
    })

    /** @description Should return undefined when connector not found */
    it('should return undefined for non-existent connector', async () => {
      mockConnectorFindById.mockResolvedValue(undefined)

      const result = await service.getConnector('missing-id')

      expect(result).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // listConnectors
  // -------------------------------------------------------------------------

  describe('listConnectors', () => {
    /** @description Should list all connectors when no kb_id filter provided */
    it('should list all connectors without filter', async () => {
      const mockConnectors = [{ id: 'c1' }, { id: 'c2' }]
      mockConnectorFindAll.mockResolvedValue(mockConnectors)

      const result = await service.listConnectors()

      // Verify empty filter and descending order
      expect(mockConnectorFindAll).toHaveBeenCalledWith(
        {},
        { orderBy: { created_at: 'desc' } },
      )
      expect(result).toEqual(mockConnectors)
    })

    /** @description Should filter connectors by knowledge base ID */
    it('should filter by kb_id when provided', async () => {
      const mockConnectors = [{ id: 'c1', kb_id: 'kb-1' }]
      mockConnectorFindAll.mockResolvedValue(mockConnectors)

      const result = await service.listConnectors('kb-1')

      // Verify kb_id filter is applied
      expect(mockConnectorFindAll).toHaveBeenCalledWith(
        { kb_id: 'kb-1' },
        { orderBy: { created_at: 'desc' } },
      )
      expect(result).toEqual(mockConnectors)
    })
  })

  // -------------------------------------------------------------------------
  // updateConnector
  // -------------------------------------------------------------------------

  describe('updateConnector', () => {
    /** @description Should update connector fields selectively and stringify config */
    it('should update only provided fields and stringify config', async () => {
      const mockUpdated = { id: 'conn-1', name: 'Updated', config: '{"key":"val"}' }
      mockConnectorUpdate.mockResolvedValue(mockUpdated)

      const result = await service.updateConnector(
        'conn-1',
        { name: 'Updated', config: { key: 'val' } },
        { id: 'user-1', email: 'u@e.com' },
      )

      // Verify config is JSON-stringified and user audit field is set
      expect(mockConnectorUpdate).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({
          name: 'Updated',
          config: JSON.stringify({ key: 'val' }),
          updated_by: 'user-1',
        }),
      )
      expect(result).toEqual(mockUpdated)
    })

    /** @description Should not include undefined fields in update payload */
    it('should skip undefined fields in update payload', async () => {
      mockConnectorUpdate.mockResolvedValue({ id: 'conn-1' })

      await service.updateConnector('conn-1', { name: 'Only Name' })

      const calledWith = mockConnectorUpdate.mock.calls[0][1]
      // Only name should be in the payload, not source_type or config
      expect(calledWith).toEqual({ name: 'Only Name' })
      expect(calledWith).not.toHaveProperty('config')
      expect(calledWith).not.toHaveProperty('source_type')
    })

    /** @description Should return undefined when connector not found */
    it('should return undefined when connector not found', async () => {
      mockConnectorUpdate.mockResolvedValue(undefined)

      const result = await service.updateConnector('missing', { name: 'x' })

      expect(result).toBeUndefined()
    })

    /** @description Should propagate errors on update failure */
    it('should throw when update fails', async () => {
      mockConnectorUpdate.mockRejectedValue(new Error('Update failed'))

      await expect(service.updateConnector('c1', { name: 'x' })).rejects.toThrow('Update failed')
    })
  })

  // -------------------------------------------------------------------------
  // deleteConnector
  // -------------------------------------------------------------------------

  describe('deleteConnector', () => {
    /** @description Should delete connector by ID */
    it('should delete a connector by ID', async () => {
      mockConnectorDelete.mockResolvedValue(undefined)

      await service.deleteConnector('conn-1')

      expect(mockConnectorDelete).toHaveBeenCalledWith('conn-1')
    })

    /** @description Should propagate errors on delete failure */
    it('should throw when deletion fails', async () => {
      mockConnectorDelete.mockRejectedValue(new Error('Delete failed'))

      await expect(service.deleteConnector('conn-1')).rejects.toThrow('Delete failed')
    })
  })

  // -------------------------------------------------------------------------
  // triggerSync
  // -------------------------------------------------------------------------

  describe('triggerSync', () => {
    /** @description Should throw when connector not found */
    it('should throw when connector does not exist', async () => {
      mockConnectorFindById.mockResolvedValue(undefined)

      await expect(service.triggerSync('missing-id')).rejects.toThrow('Connector not found')
    })

    /** @description Should create sync log and push task to Redis queue */
    it('should create sync log entry and push task to Redis queue', async () => {
      const mockConnector = { id: 'conn-1', kb_id: 'kb-1', source_type: 'notion', config: '{}' }
      const mockSyncLog = { id: 'sl-1', connector_id: 'conn-1', status: 'running' }

      mockConnectorFindById.mockResolvedValue(mockConnector)
      mockSyncLogCreate.mockResolvedValue(mockSyncLog)
      mockRedisLPush.mockResolvedValue(1)

      const result = await service.triggerSync('conn-1')

      // Verify sync log created with running status and zero counters
      expect(mockSyncLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          connector_id: 'conn-1',
          kb_id: 'kb-1',
          status: 'running',
          docs_synced: 0,
          docs_failed: 0,
          progress: 0,
        }),
      )
      // Verify task was pushed to Redis queue
      expect(mockRedisLPush).toHaveBeenCalledWith(
        'rag_connector_sync',
        expect.any(String),
      )
      // Verify the Redis payload contains expected fields
      const payload = JSON.parse(mockRedisLPush.mock.calls[0][1])
      expect(payload).toMatchObject({
        sync_log_id: 'sl-1',
        connector_id: 'conn-1',
        kb_id: 'kb-1',
        source_type: 'notion',
      })
      expect(result).toEqual(mockSyncLog)
    })

    /** @description Should throw when sync log creation fails */
    it('should throw when sync log creation fails', async () => {
      mockConnectorFindById.mockResolvedValue({ id: 'conn-1', kb_id: 'kb-1' })
      mockSyncLogCreate.mockRejectedValue(new Error('DB write error'))

      await expect(service.triggerSync('conn-1')).rejects.toThrow('DB write error')
    })
  })

  // -------------------------------------------------------------------------
  // listSyncLogs
  // -------------------------------------------------------------------------

  describe('listSyncLogs', () => {
    /** @description Should list sync logs with default pagination */
    it('should list sync logs with default page and limit', async () => {
      const mockLogs = [{ id: 'sl-1' }, { id: 'sl-2' }]
      mockSyncLogFindAll.mockResolvedValue(mockLogs)

      const result = await service.listSyncLogs('conn-1')

      // Verify default pagination: page=1, limit=20, offset=0
      expect(mockSyncLogFindAll).toHaveBeenCalledWith(
        { connector_id: 'conn-1' },
        { orderBy: { created_at: 'desc' }, limit: 20, offset: 0 },
      )
      expect(result).toEqual(mockLogs)
    })

    /** @description Should apply pagination offset correctly */
    it('should calculate offset from page and limit', async () => {
      mockSyncLogFindAll.mockResolvedValue([])

      await service.listSyncLogs('conn-1', 3, 10)

      // Page 3 with limit 10 => offset 20
      expect(mockSyncLogFindAll).toHaveBeenCalledWith(
        { connector_id: 'conn-1' },
        { orderBy: { created_at: 'desc' }, limit: 10, offset: 20 },
      )
    })

    /** @description Should filter by status when provided */
    it('should include status filter in query', async () => {
      mockSyncLogFindAll.mockResolvedValue([])

      await service.listSyncLogs('conn-1', 1, 20, 'failed')

      // Verify status is added to filter object
      expect(mockSyncLogFindAll).toHaveBeenCalledWith(
        { connector_id: 'conn-1', status: 'failed' },
        expect.any(Object),
      )
    })

    /** @description Should not include status in filter when not provided */
    it('should omit status from filter when not specified', async () => {
      mockSyncLogFindAll.mockResolvedValue([])

      await service.listSyncLogs('conn-1', 1, 20)

      const filter = mockSyncLogFindAll.mock.calls[0][0]
      expect(filter).not.toHaveProperty('status')
    })
  })
})
