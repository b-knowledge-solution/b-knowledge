/**
 * @fileoverview Unit tests for SyncService.
 * @description Covers connector CRUD, sync triggering, and sync log listing
 *   with all external dependencies mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEncrypt = vi.fn((val: string) => `encrypted:${val}`)
const mockDecrypt = vi.fn((val: string) => val.startsWith('encrypted:') ? val.slice(10) : val)

vi.mock('@/shared/services/crypto.service.js', () => ({
  cryptoService: {
    encrypt: (...args: any[]) => mockEncrypt(...args),
    decrypt: (...args: any[]) => mockDecrypt(...args),
    isEnabled: () => true,
  },
}))

const mockConnectorCreate = vi.fn()
const mockConnectorFindById = vi.fn()
const mockConnectorFindAll = vi.fn()
const mockConnectorUpdate = vi.fn()
const mockConnectorDelete = vi.fn()
const mockConnectorGetKnex = vi.fn()
const mockSyncLogCreate = vi.fn()
const mockSyncLogFindAll = vi.fn()
const mockRedisLPush = vi.fn()
const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()
const mockSyncLogUpdate = vi.fn()
const mockDocumentDelete = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    connector: {
      create: (...args: any[]) => mockConnectorCreate(...args),
      findById: (...args: any[]) => mockConnectorFindById(...args),
      findAll: (...args: any[]) => mockConnectorFindAll(...args),
      update: (...args: any[]) => mockConnectorUpdate(...args),
      delete: (...args: any[]) => mockConnectorDelete(...args),
      getKnex: (...args: any[]) => mockConnectorGetKnex(...args),
    },
    syncLog: {
      create: (...args: any[]) => mockSyncLogCreate(...args),
      findAll: (...args: any[]) => mockSyncLogFindAll(...args),
      update: (...args: any[]) => mockSyncLogUpdate(...args),
    },
    document: {
      delete: (...args: any[]) => mockDocumentDelete(...args),
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

// Mock Redis subscriber (shared reference so tests can override .subscribe)
const mockRedisSubscriber = {
  connect: vi.fn().mockResolvedValue(undefined),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
}

// Mock Redis service for queue operations (wrapped in fn so tests can swap return)
const mockGetRedisClient = vi.fn(() => ({
  lPush: (...args: any[]) => mockRedisLPush(...args),
  set: (...args: any[]) => mockRedisSet(...args),
  del: (...args: any[]) => mockRedisDel(...args),
  duplicate: () => mockRedisSubscriber,
}))

vi.mock('@/shared/services/redis.service.js', () => ({
  getRedisClient: (...args: any[]) => mockGetRedisClient(...args),
}))

// Mock config for tenant ID
vi.mock('@/shared/config/index.js', () => ({
  config: {
    systemTenantId: 'test-tenant-id',
    opensearch: {
      systemTenantId: 'test-tenant-id',
    },
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
    // Restore crypto mock implementations after clearAllMocks
    mockEncrypt.mockImplementation((val: string) => `encrypted:${val}`)
    mockDecrypt.mockImplementation((val: string) => val.startsWith('encrypted:') ? val.slice(10) : val)
    // Restore mock implementations cleared by global resetAllMocks
    mockGetRedisClient.mockReturnValue({
      lPush: (...args: any[]) => mockRedisLPush(...args),
      set: (...args: any[]) => mockRedisSet(...args),
      del: (...args: any[]) => mockRedisDel(...args),
      duplicate: () => mockRedisSubscriber,
    })
    mockRedisSubscriber.connect.mockResolvedValue(undefined)
    mockRedisSubscriber.subscribe.mockResolvedValue(undefined)
    mockRedisSubscriber.unsubscribe.mockResolvedValue(undefined)
    mockRedisSubscriber.quit.mockResolvedValue(undefined)
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

    /** @description Should encrypt config before storing in database */
    it('should encrypt config before storage', async () => {
      const configObj = { access_token: 'my-secret', host: 'example.com' }
      const mockData = { name: 'Encrypted Connector', source_type: 'github', kb_id: 'kb-1', config: configObj }
      const mockResult = { id: 'conn-3', ...mockData, status: 'active' }

      mockConnectorCreate.mockResolvedValue(mockResult)

      await service.createConnector(mockData)

      // Verify encrypt was called with the JSON-stringified config
      expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify(configObj))
      // Verify the create call received the encrypted config string
      expect(mockConnectorCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          config: `encrypted:${JSON.stringify(configObj)}`,
        }),
      )
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

    /** @description Should decrypt config when retrieving connector */
    it('should decrypt config and parse back to object', async () => {
      const originalConfig = { access_token: 'my-secret', host: 'example.com' }
      const encryptedConfig = `encrypted:${JSON.stringify(originalConfig)}`
      const mockConnector = { id: 'conn-1', name: 'Test', config: encryptedConfig }

      mockConnectorFindById.mockResolvedValue(mockConnector)

      const result = await service.getConnector('conn-1')

      // Verify decrypt was called with the encrypted config string
      expect(mockDecrypt).toHaveBeenCalledWith(encryptedConfig)
      // Verify config was parsed back to an object
      expect(result!.config).toEqual(originalConfig)
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

      // Verify config is encrypted (encrypt wraps the JSON-stringified value) and user audit field is set
      expect(mockConnectorUpdate).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({
          name: 'Updated',
          config: `encrypted:${JSON.stringify({ key: 'val' })}`,
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
      // Lock acquisition succeeds
      mockRedisSet.mockResolvedValue('OK')

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

    /** @description Should acquire Redis distributed lock with NX before syncing */
    it('should acquire Redis SET NX lock before creating sync task', async () => {
      const mockConnector = { id: 'conn-1', kb_id: 'kb-1', source_type: 'notion', config: '{}' }
      const mockSyncLog = { id: 'sl-1', connector_id: 'conn-1', status: 'running' }

      mockConnectorFindById.mockResolvedValue(mockConnector)
      mockSyncLogCreate.mockResolvedValue(mockSyncLog)
      mockRedisLPush.mockResolvedValue(1)
      // Lock acquisition succeeds
      mockRedisSet.mockResolvedValue('OK')

      await service.triggerSync('conn-1')

      // Verify Redis SET with NX (set-if-not-exists) was called for lock
      expect(mockRedisSet).toHaveBeenCalledWith(
        'connector_sync_lock:conn-1',
        '1',
        expect.objectContaining({ NX: true, EX: 3600 }),
      )
    })

    /** @description Should throw when lock acquisition fails (sync already in progress) */
    it('should throw when Redis lock acquisition fails', async () => {
      const mockConnector = { id: 'conn-1', kb_id: 'kb-1', source_type: 'notion', config: '{}' }

      mockConnectorFindById.mockResolvedValue(mockConnector)
      // Lock acquisition fails — another sync is already running
      mockRedisSet.mockResolvedValue(null)

      await expect(service.triggerSync('conn-1')).rejects.toThrow(
        'Sync already in progress for this connector',
      )
    })

    /** @description Should throw when sync log creation fails */
    it('should throw when sync log creation fails', async () => {
      mockConnectorFindById.mockResolvedValue({ id: 'conn-1', kb_id: 'kb-1', config: '{}' })
      mockSyncLogCreate.mockRejectedValue(new Error('DB write error'))
      // Lock acquisition succeeds
      mockRedisSet.mockResolvedValue('OK')

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

  // -------------------------------------------------------------------------
  // subscribeToSyncProgress — delta sync field forwarding
  // -------------------------------------------------------------------------

  describe('subscribeToSyncProgress', () => {
    /** @description Should forward docs_skipped and docs_deleted from progress events */
    it('should forward delta sync fields to sync log update', async () => {
      // Capture the subscribe callback to simulate Redis messages
      let subscribeCb: ((message: string) => void) | undefined
      mockRedisSubscriber.subscribe.mockImplementation((_channel: string, cb: (msg: string) => void) => {
        subscribeCb = cb
        return Promise.resolve()
      })

      await service.subscribeToSyncProgress('conn-1', 'sl-1')

      // Simulate a progress event with delta sync fields
      const progressEvent = JSON.stringify({
        progress: 80,
        message: 'Syncing 8/10 files',
        docs_synced: 8,
        docs_failed: 1,
        docs_skipped: 5,
        docs_deleted: 3,
      })

      // Fire the subscriber callback
      expect(subscribeCb).toBeDefined()
      await subscribeCb!(progressEvent)

      // Verify sync log was updated with delta sync fields
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          progress: 80,
          docs_synced: 8,
          docs_failed: 1,
          docs_skipped: 5,
          docs_deleted: 3,
        }),
      )
    })

    /** @description Should default docs_skipped and docs_deleted to 0 when absent */
    it('should default delta fields to 0 when not in progress event', async () => {
      let subscribeCb: ((message: string) => void) | undefined
      mockRedisSubscriber.subscribe.mockImplementation((_channel: string, cb: (msg: string) => void) => {
        subscribeCb = cb
        return Promise.resolve()
      })

      await service.subscribeToSyncProgress('conn-1', 'sl-1')

      // Simulate event WITHOUT delta fields (backward compat)
      await subscribeCb!(JSON.stringify({ progress: 50, message: 'Old worker' }))

      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          docs_skipped: 0,
          docs_deleted: 0,
        }),
      )
    })

    /** @description Should update connector last_synced_at on completed status */
    it('should update connector last_synced_at on completed status', async () => {
      let subscribeCb: ((message: string) => void) | undefined
      mockRedisSubscriber.subscribe.mockImplementation((_channel: string, cb: (msg: string) => void) => {
        subscribeCb = cb
        return Promise.resolve()
      })

      mockConnectorUpdate.mockResolvedValue({ id: 'conn-1' })

      await service.subscribeToSyncProgress('conn-1', 'sl-1')

      // Simulate completed event with delta stats
      await subscribeCb!(JSON.stringify({
        status: 'completed',
        progress: 100,
        message: 'Done',
        docs_synced: 10,
        docs_failed: 0,
        docs_skipped: 5,
        docs_deleted: 2,
      }))

      // Verify connector last_synced_at updated
      expect(mockConnectorUpdate).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ last_synced_at: expect.any(Date) }),
      )

      // Verify sync log has completed status and delta fields
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          status: 'completed',
          docs_skipped: 5,
          docs_deleted: 2,
          finished_at: expect.any(Date),
        }),
      )
    })

    /** @description Should return a cleanup function that unsubscribes */
    it('should return cleanup function', async () => {
      const cleanup = await service.subscribeToSyncProgress('conn-1', 'sl-1')

      // Execute cleanup
      await cleanup()

      expect(mockRedisSubscriber.unsubscribe).toHaveBeenCalledWith('connector:conn-1:progress')
      expect(mockRedisSubscriber.quit).toHaveBeenCalled()
    })

    /** @description Should return no-op when Redis not available */
    it('should return no-op cleanup when Redis not available', async () => {
      mockGetRedisClient.mockReturnValueOnce(null)

      const cleanup = await service.subscribeToSyncProgress('conn-1', 'sl-1')

      // Should not throw
      await cleanup()
    })

    /** @description Should release Redis lock on completed status */
    it('should release Redis lock when sync completes', async () => {
      let subscribeCb: ((message: string) => void) | undefined
      mockRedisSubscriber.subscribe.mockImplementation((_channel: string, cb: (msg: string) => void) => {
        subscribeCb = cb
        return Promise.resolve()
      })

      mockConnectorUpdate.mockResolvedValue({ id: 'conn-1' })
      mockRedisDel.mockResolvedValue(1)

      await service.subscribeToSyncProgress('conn-1', 'sl-1')

      // Simulate completed event
      await subscribeCb!(JSON.stringify({
        status: 'completed',
        progress: 100,
        message: 'Done',
        docs_synced: 10,
        docs_failed: 0,
      }))

      // Verify Redis DEL was called to release the sync lock
      expect(mockRedisDel).toHaveBeenCalledWith('connector_sync_lock:conn-1')
    })

    /** @description Should release Redis lock on failed status */
    it('should release Redis lock when sync fails', async () => {
      let subscribeCb: ((message: string) => void) | undefined
      mockRedisSubscriber.subscribe.mockImplementation((_channel: string, cb: (msg: string) => void) => {
        subscribeCb = cb
        return Promise.resolve()
      })

      mockRedisDel.mockResolvedValue(1)

      await service.subscribeToSyncProgress('conn-1', 'sl-1')

      // Simulate failed event
      await subscribeCb!(JSON.stringify({
        status: 'failed',
        progress: 50,
        message: 'Network timeout',
        docs_synced: 3,
        docs_failed: 2,
      }))

      // Verify Redis DEL was called to release the sync lock
      expect(mockRedisDel).toHaveBeenCalledWith('connector_sync_lock:conn-1')
    })
  })

  // -------------------------------------------------------------------------
  // deleteConnector — cascade delete
  // -------------------------------------------------------------------------

  describe('deleteConnector — cascade', () => {
    /** @description Should cascade-delete documents when cascadeDocuments is true */
    it('should delete synced documents when cascadeDocuments is true', async () => {
      const mockConnector = { id: 'conn-1', kb_id: 'kb-1', source_type: 'notion', config: '{"host":"x"}' }
      mockConnectorFindById.mockResolvedValue({ ...mockConnector })
      mockConnectorDelete.mockResolvedValue(undefined)
      mockDocumentDelete.mockResolvedValue(undefined)

      await service.deleteConnector('conn-1', true)

      // Verify document delete was called with kb_id filter
      expect(mockDocumentDelete).toHaveBeenCalledWith({ kb_id: 'kb-1' })
      // Verify the connector itself was also deleted
      expect(mockConnectorDelete).toHaveBeenCalledWith('conn-1')
    })

    /** @description Should not delete documents when cascadeDocuments is false (default) */
    it('should not delete documents when cascadeDocuments is false', async () => {
      mockConnectorDelete.mockResolvedValue(undefined)

      await service.deleteConnector('conn-1', false)

      // Verify document delete was NOT called
      expect(mockDocumentDelete).not.toHaveBeenCalled()
      // Verify connector was still deleted
      expect(mockConnectorDelete).toHaveBeenCalledWith('conn-1')
    })

    /** @description Should not delete documents when cascadeDocuments is omitted (defaults to false) */
    it('should default cascadeDocuments to false', async () => {
      mockConnectorDelete.mockResolvedValue(undefined)

      await service.deleteConnector('conn-1')

      // Verify document delete was NOT called
      expect(mockDocumentDelete).not.toHaveBeenCalled()
      expect(mockConnectorDelete).toHaveBeenCalledWith('conn-1')
    })
  })

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------

  describe('testConnection', () => {
    /** @description Should push test task to rag_connector_test Redis queue */
    it('should push task to rag_connector_test queue', async () => {
      const configObj = { access_token: 'tok-123', host: 'https://api.example.com' }

      mockRedisLPush.mockResolvedValue(1)
      // Simulate immediate result via subscriber callback
      mockRedisSubscriber.subscribe.mockImplementation((_channel: string, cb: (msg: string) => void) => {
        // Immediately fire the result
        setTimeout(() => cb(JSON.stringify({ success: true, message: 'Connection successful' })), 0)
        return Promise.resolve()
      })

      const resultPromise = service.testConnection('github', configObj)

      const result = await resultPromise

      // Verify task was pushed to the test queue
      expect(mockRedisLPush).toHaveBeenCalledWith(
        'rag_connector_test',
        expect.any(String),
      )
      // Verify the payload contains expected fields
      const payload = JSON.parse(mockRedisLPush.mock.calls[0][1])
      expect(payload).toMatchObject({
        task_type: 'test_connection',
        source_type: 'github',
        config: configObj,
      })
      expect(payload.test_id).toBeDefined()
      expect(result).toEqual({ success: true, message: 'Connection successful' })
    })

    /** @description Should throw when Redis is not available */
    it('should throw when Redis not available', async () => {
      mockGetRedisClient.mockReturnValueOnce(null)

      await expect(service.testConnection('github', { token: 'x' })).rejects.toThrow(
        'Redis not available',
      )
    })
  })
})
