/**
 * @fileoverview Unit tests for SyncController.
 * @description Covers HTTP request handling, response formatting, and error
 *   paths for all sync controller endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'
import { SyncController } from '../../src/modules/sync/controllers/sync.controller'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListConnectors = vi.fn()
const mockGetConnector = vi.fn()
const mockCreateConnector = vi.fn()
const mockUpdateConnector = vi.fn()
const mockDeleteConnector = vi.fn()
const mockTriggerSync = vi.fn()
const mockListSyncLogs = vi.fn()
const mockSubscribeToSyncProgress = vi.fn()

vi.mock('../../src/modules/sync/services/sync.service.js', () => ({
  syncService: {
    listConnectors: (...args: any[]) => mockListConnectors(...args),
    getConnector: (...args: any[]) => mockGetConnector(...args),
    createConnector: (...args: any[]) => mockCreateConnector(...args),
    updateConnector: (...args: any[]) => mockUpdateConnector(...args),
    deleteConnector: (...args: any[]) => mockDeleteConnector(...args),
    triggerSync: (...args: any[]) => mockTriggerSync(...args),
    listSyncLogs: (...args: any[]) => mockListSyncLogs(...args),
    subscribeToSyncProgress: (...args: any[]) => mockSubscribeToSyncProgress(...args),
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/utils/ip.js', () => ({
  getClientIp: () => '127.0.0.1',
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock Express Request */
function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    user: undefined,
    on: vi.fn(),
    ...overrides,
  } as unknown as Request
}

/** Create a mock Express Response with chainable methods */
function mockRes(): Response & { statusCode: number; body: any; headers: Record<string, string> } {
  const res = {
    statusCode: 200,
    body: null,
    headers: {} as Record<string, string>,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(data: any) {
      res.body = data
      return res
    },
    send() {
      return res
    },
    setHeader(key: string, val: string) {
      res.headers[key] = val
      return res
    },
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  }
  return res as any
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('SyncController', () => {
  let controller: SyncController

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SyncController()
  })

  // -------------------------------------------------------------------------
  // listConnectors
  // -------------------------------------------------------------------------

  describe('listConnectors', () => {
    /** @description Should return all connectors for a given kb_id */
    it('should return connectors filtered by kb_id', async () => {
      const connectors = [{ id: 'c1' }, { id: 'c2' }]
      mockListConnectors.mockResolvedValue(connectors)

      const req = mockReq({ query: { kb_id: 'kb-1' } })
      const res = mockRes()

      await controller.listConnectors(req, res)

      expect(mockListConnectors).toHaveBeenCalledWith('kb-1')
      expect(res.body).toEqual(connectors)
    })

    /** @description Should return all connectors when no kb_id filter */
    it('should return all connectors when no kb_id', async () => {
      mockListConnectors.mockResolvedValue([])

      const req = mockReq()
      const res = mockRes()

      await controller.listConnectors(req, res)

      expect(mockListConnectors).toHaveBeenCalledWith(undefined)
    })

    /** @description Should return 500 on service error */
    it('should return 500 on service error', async () => {
      mockListConnectors.mockRejectedValue(new Error('DB error'))

      const req = mockReq()
      const res = mockRes()

      await controller.listConnectors(req, res)

      expect(res.statusCode).toBe(500)
      expect(res.body).toEqual({ error: 'Failed to list connectors' })
    })
  })

  // -------------------------------------------------------------------------
  // getConnector
  // -------------------------------------------------------------------------

  describe('getConnector', () => {
    /** @description Should return connector when found */
    it('should return connector when found', async () => {
      const connector = { id: 'c1', name: 'Test' }
      mockGetConnector.mockResolvedValue(connector)

      const req = mockReq({ params: { id: 'c1' } })
      const res = mockRes()

      await controller.getConnector(req, res)

      expect(res.body).toEqual(connector)
    })

    /** @description Should return 404 when connector not found */
    it('should return 404 when connector not found', async () => {
      mockGetConnector.mockResolvedValue(undefined)

      const req = mockReq({ params: { id: 'missing' } })
      const res = mockRes()

      await controller.getConnector(req, res)

      expect(res.statusCode).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // createConnector
  // -------------------------------------------------------------------------

  describe('createConnector', () => {
    /** @description Should create connector with user context */
    it('should create connector with user context', async () => {
      const connector = { id: 'c1', name: 'New', status: 'active' }
      mockCreateConnector.mockResolvedValue(connector)

      const req = mockReq({
        body: { name: 'New', source_type: 'github', kb_id: 'kb-1' },
        user: { id: 'u1', email: 'test@test.com' } as any,
      })
      const res = mockRes()

      await controller.createConnector(req, res)

      expect(res.statusCode).toBe(201)
      expect(res.body).toEqual(connector)
      // Verify user context was passed
      expect(mockCreateConnector).toHaveBeenCalledWith(
        req.body,
        expect.objectContaining({ id: 'u1', email: 'test@test.com' }),
      )
    })

    /** @description Should return 409 for duplicate connector */
    it('should return 409 for duplicate connector', async () => {
      mockCreateConnector.mockRejectedValue(new Error('Connector already exists'))

      const req = mockReq({ body: { name: 'Dupe' } })
      const res = mockRes()

      await controller.createConnector(req, res)

      expect(res.statusCode).toBe(409)
    })
  })

  // -------------------------------------------------------------------------
  // updateConnector
  // -------------------------------------------------------------------------

  describe('updateConnector', () => {
    /** @description Should update connector and return updated data */
    it('should update connector and return updated data', async () => {
      const updated = { id: 'c1', name: 'Updated' }
      mockUpdateConnector.mockResolvedValue(updated)

      const req = mockReq({
        params: { id: 'c1' },
        body: { name: 'Updated' },
        user: { id: 'u1', email: 'u@e.com' } as any,
      })
      const res = mockRes()

      await controller.updateConnector(req, res)

      expect(res.body).toEqual(updated)
    })

    /** @description Should return 400 when ID is missing */
    it('should return 400 when ID is missing', async () => {
      const req = mockReq({ params: {} })
      const res = mockRes()

      await controller.updateConnector(req, res)

      expect(res.statusCode).toBe(400)
    })

    /** @description Should return 404 when connector not found */
    it('should return 404 when connector not found', async () => {
      mockUpdateConnector.mockResolvedValue(undefined)

      const req = mockReq({ params: { id: 'c1' }, body: { name: 'x' } })
      const res = mockRes()

      await controller.updateConnector(req, res)

      expect(res.statusCode).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // deleteConnector
  // -------------------------------------------------------------------------

  describe('deleteConnector', () => {
    /** @description Should delete connector and return 204 */
    it('should delete connector and return 204', async () => {
      mockDeleteConnector.mockResolvedValue(undefined)

      const req = mockReq({ params: { id: 'c1' } })
      const res = mockRes()

      await controller.deleteConnector(req, res)

      expect(res.statusCode).toBe(204)
    })

    /** @description Should return 400 when ID is missing */
    it('should return 400 when ID is missing', async () => {
      const req = mockReq({ params: {} })
      const res = mockRes()

      await controller.deleteConnector(req, res)

      expect(res.statusCode).toBe(400)
    })
  })

  // -------------------------------------------------------------------------
  // triggerSync
  // -------------------------------------------------------------------------

  describe('triggerSync', () => {
    /** @description Should trigger sync and return 202 */
    it('should trigger sync and return 202', async () => {
      const syncLog = { id: 'sl-1', status: 'running' }
      mockTriggerSync.mockResolvedValue(syncLog)

      const req = mockReq({ params: { id: 'c1' }, body: {} })
      const res = mockRes()

      await controller.triggerSync(req, res)

      expect(res.statusCode).toBe(202)
      expect(res.body).toEqual(syncLog)
    })

    /** @description Should pass poll_range_start from body */
    it('should pass poll_range_start from body', async () => {
      mockTriggerSync.mockResolvedValue({ id: 'sl-1' })

      const req = mockReq({
        params: { id: 'c1' },
        body: { poll_range_start: '2024-01-01T00:00:00Z' },
      })
      const res = mockRes()

      await controller.triggerSync(req, res)

      expect(mockTriggerSync).toHaveBeenCalledWith('c1', '2024-01-01T00:00:00Z')
    })

    /** @description Should return 404 when connector not found */
    it('should return 404 when connector not found', async () => {
      mockTriggerSync.mockRejectedValue(new Error('Connector not found'))

      const req = mockReq({ params: { id: 'c1' } })
      const res = mockRes()

      await controller.triggerSync(req, res)

      expect(res.statusCode).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // listSyncLogs
  // -------------------------------------------------------------------------

  describe('listSyncLogs', () => {
    /** @description Should list sync logs with pagination */
    it('should list sync logs with pagination params', async () => {
      const logs = [{ id: 'sl-1' }, { id: 'sl-2' }]
      mockListSyncLogs.mockResolvedValue(logs)

      const req = mockReq({
        params: { id: 'c1' },
        query: { page: '2', limit: '10', status: 'completed' },
      })
      const res = mockRes()

      await controller.listSyncLogs(req, res)

      expect(mockListSyncLogs).toHaveBeenCalledWith('c1', '2', '10', 'completed')
      expect(res.body).toEqual(logs)
    })
  })

  // -------------------------------------------------------------------------
  // streamProgress
  // -------------------------------------------------------------------------

  describe('streamProgress', () => {
    /** @description Should set SSE headers and subscribe to progress */
    it('should set SSE headers and subscribe to progress', async () => {
      const cleanupFn = vi.fn()
      mockSubscribeToSyncProgress.mockResolvedValue(cleanupFn)

      const req = mockReq({ params: { id: 'c1' } })
      const res = mockRes()

      await controller.streamProgress(req, res)

      // Verify SSE headers
      expect(res.headers['Content-Type']).toBe('text/event-stream')
      expect(res.headers['Cache-Control']).toBe('no-cache')
      expect(res.headers['Connection']).toBe('keep-alive')

      // Verify subscription was made
      expect(mockSubscribeToSyncProgress).toHaveBeenCalledWith(
        'c1',
        '',
        expect.any(Function),
      )
    })

    /** @description Should return 400 when connector ID is missing */
    it('should return 400 when connector ID is missing', async () => {
      const req = mockReq({ params: {} })
      const res = mockRes()

      await controller.streamProgress(req, res)

      expect(res.statusCode).toBe(400)
    })

    /** @description Should register cleanup on client disconnect */
    it('should register cleanup on client disconnect', async () => {
      const cleanupFn = vi.fn()
      mockSubscribeToSyncProgress.mockResolvedValue(cleanupFn)

      const onFn = vi.fn()
      const req = mockReq({ params: { id: 'c1' }, on: onFn } as any)
      const res = mockRes()

      await controller.streamProgress(req, res)

      // Verify close handler was registered
      expect(onFn).toHaveBeenCalledWith('close', expect.any(Function))

      // Simulate client disconnect
      const closeHandler = onFn.mock.calls[0][1]
      await closeHandler()

      expect(cleanupFn).toHaveBeenCalled()
    })
  })
})
