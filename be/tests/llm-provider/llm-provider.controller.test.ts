/**
 * @fileoverview Tests for LlmProviderController covering all HTTP handler methods:
 * getPresets, list, getById, create, update, delete, and testConnection.
 *
 * Uses createMockRequest/createMockResponse from the test setup utilities.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup'

// ---------------------------------------------------------------------------
// Mocks — hoisted before dynamic import
// ---------------------------------------------------------------------------

const mockList = vi.fn()
const mockGetById = vi.fn()
const mockGetDefaults = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockTestConnection = vi.fn()

vi.mock('../../src/modules/llm-provider/services/llm-provider.service.js', () => ({
  llmProviderService: {
    list: (...args: any[]) => mockList(...args),
    getById: (...args: any[]) => mockGetById(...args),
    getDefaults: (...args: any[]) => mockGetDefaults(...args),
    create: (...args: any[]) => mockCreate(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDelete(...args),
    testConnection: (...args: any[]) => mockTestConnection(...args),
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

vi.mock('@/shared/utils/ip.js', () => ({
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}))

// Mock the fs readFileSync used at module init for factory presets
// Use vi.hoisted to make MOCK_PRESETS available inside the vi.mock factory
const { MOCK_PRESETS } = vi.hoisted(() => ({
  MOCK_PRESETS: [
    { factory: 'OpenAI', models: ['gpt-4o'] },
    { factory: 'Anthropic', models: ['claude-3'] },
  ],
}))

vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue(JSON.stringify(MOCK_PRESETS)),
}))

// Import after mocking
import { LlmProviderController } from '../../src/modules/llm-provider/controllers/llm-provider.controller'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

/**
 * @description Build a mock provider record for controller response testing
 * @param {Partial<any>} overrides - Fields to override
 * @returns {any} Provider-like object
 */
function makeProvider(overrides: Partial<any> = {}): any {
  return {
    id: 'prov-1',
    factory_name: 'OpenAI',
    model_type: 'chat',
    model_name: 'gpt-4o',
    api_key: 'encrypted-key',
    api_base: 'https://api.openai.com/v1',
    max_tokens: 4096,
    vision: false,
    status: 'active',
    is_default: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LlmProviderController', () => {
  let controller: LlmProviderController

  beforeEach(() => {
    controller = new LlmProviderController()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // getPresets
  // -----------------------------------------------------------------------

  describe('getPresets', () => {
    it('returns factory presets JSON', async () => {
      const req = createMockRequest()
      const res = createMockResponse()

      await controller.getPresets(req, res)

      // Should respond with the preloaded factory presets
      expect(res.json).toHaveBeenCalledWith(MOCK_PRESETS)
    })
  })

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns providers with masked API keys', async () => {
      const providers = [
        makeProvider({ api_key: 'secret1' }),
        makeProvider({ id: 'prov-2', api_key: null }),
      ]
      mockList.mockResolvedValue(providers)
      const req = createMockRequest()
      const res = createMockResponse()

      await controller.list(req, res)

      expect(res.json).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'prov-1', api_key: '***' }),
        expect.objectContaining({ id: 'prov-2', api_key: null }),
      ])
    })

    it('returns 500 on service error', async () => {
      mockList.mockRejectedValue(new Error('DB error'))
      const req = createMockRequest()
      const res = createMockResponse()

      await controller.list(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Failed to list model providers' }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe('getById', () => {
    it('returns 200 with masked api_key when provider found', async () => {
      mockGetById.mockResolvedValue(makeProvider({ api_key: 'secret' }))
      const req = createMockRequest({ params: { id: 'prov-1' } })
      const res = createMockResponse()

      await controller.getById(req, res)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'prov-1', api_key: '***' }),
      )
    })

    it('returns null api_key when provider has no key', async () => {
      mockGetById.mockResolvedValue(makeProvider({ api_key: null }))
      const req = createMockRequest({ params: { id: 'prov-1' } })
      const res = createMockResponse()

      await controller.getById(req, res)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ api_key: null }),
      )
    })

    it('returns 404 when provider not found', async () => {
      mockGetById.mockResolvedValue(undefined)
      const req = createMockRequest({ params: { id: 'non-existent' } })
      const res = createMockResponse()

      await controller.getById(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Model provider not found' }),
      )
    })

    it('returns 500 on service error', async () => {
      mockGetById.mockRejectedValue(new Error('DB error'))
      const req = createMockRequest({ params: { id: 'prov-1' } })
      const res = createMockResponse()

      await controller.getById(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('returns 201 with created provider and masked key', async () => {
      const created = makeProvider({ api_key: 'encrypted' })
      mockCreate.mockResolvedValue(created)
      const req = createMockRequest({
        body: {
          factory_name: 'OpenAI',
          model_type: 'chat',
          model_name: 'gpt-4o',
          api_key: 'sk-raw',
        },
        user: { id: 'user-1', email: 'test@test.com' },
      })
      const res = createMockResponse()

      await controller.create(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ api_key: '***' }),
      )
    })

    it('passes user context to service layer', async () => {
      mockCreate.mockResolvedValue(makeProvider())
      const req = createMockRequest({
        body: { factory_name: 'OpenAI', model_type: 'chat', model_name: 'gpt-4o' },
        user: { id: 'user-1', email: 'admin@test.com' },
      })
      const res = createMockResponse()

      await controller.create(req, res)

      // Verify user context was passed
      expect(mockCreate).toHaveBeenCalledWith(
        req.body,
        expect.objectContaining({ id: 'user-1', email: 'admin@test.com' }),
      )
    })

    it('returns 409 when error message contains "already exists"', async () => {
      mockCreate.mockRejectedValue(new Error('Provider already exists'))
      const req = createMockRequest({
        body: { factory_name: 'OpenAI', model_type: 'chat', model_name: 'gpt-4o' },
      })
      const res = createMockResponse()

      await controller.create(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Provider already exists' }),
      )
    })

    it('returns 500 for generic errors', async () => {
      mockCreate.mockRejectedValue(new Error('DB connection lost'))
      const req = createMockRequest({
        body: { factory_name: 'OpenAI', model_type: 'chat', model_name: 'gpt-4o' },
      })
      const res = createMockResponse()

      await controller.create(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('returns 200 with updated provider and masked key', async () => {
      const updated = makeProvider({ factory_name: 'Anthropic', api_key: 'enc' })
      mockUpdate.mockResolvedValue(updated)
      const req = createMockRequest({
        params: { id: 'prov-1' },
        body: { factory_name: 'Anthropic' },
        user: { id: 'user-1', email: 'test@test.com' },
      })
      const res = createMockResponse()

      await controller.update(req, res)

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ factory_name: 'Anthropic', api_key: '***' }),
      )
    })

    it('returns 400 when ID is missing from params', async () => {
      const req = createMockRequest({
        params: {},
        body: { factory_name: 'Updated' },
      })
      const res = createMockResponse()

      await controller.update(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'ID is required' }),
      )
    })

    it('returns 404 when provider not found', async () => {
      mockUpdate.mockResolvedValue(undefined)
      const req = createMockRequest({
        params: { id: 'non-existent' },
        body: { factory_name: 'X' },
      })
      const res = createMockResponse()

      await controller.update(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Model provider not found' }),
      )
    })

    it('returns 500 on service error', async () => {
      mockUpdate.mockRejectedValue(new Error('DB error'))
      const req = createMockRequest({
        params: { id: 'prov-1' },
        body: { factory_name: 'X' },
      })
      const res = createMockResponse()

      await controller.update(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('returns 204 on successful deletion', async () => {
      mockDelete.mockResolvedValue(undefined)
      const req = createMockRequest({
        params: { id: 'prov-1' },
        user: { id: 'user-1', email: 'test@test.com' },
      })
      const res = createMockResponse()

      await controller.delete(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('returns 400 when ID is missing', async () => {
      const req = createMockRequest({ params: {} })
      const res = createMockResponse()

      await controller.delete(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'ID is required' }),
      )
    })

    it('returns 500 on service error', async () => {
      mockDelete.mockRejectedValue(new Error('DB error'))
      const req = createMockRequest({
        params: { id: 'prov-1' },
      })
      const res = createMockResponse()

      await controller.delete(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // testConnection
  // -----------------------------------------------------------------------

  describe('testConnection', () => {
    it('returns success result with latency', async () => {
      mockTestConnection.mockResolvedValue({ success: true, latencyMs: 150 })
      const req = createMockRequest({ params: { id: 'prov-1' } })
      const res = createMockResponse()

      await controller.testConnection(req, res)

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        latencyMs: 150,
      })
    })

    it('returns failure result from service', async () => {
      mockTestConnection.mockResolvedValue({
        success: false,
        error: 'Could not reach API',
      })
      const req = createMockRequest({ params: { id: 'prov-1' } })
      const res = createMockResponse()

      await controller.testConnection(req, res)

      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Could not reach API',
      })
    })

    it('returns 400 when ID is missing', async () => {
      const req = createMockRequest({ params: {} })
      const res = createMockResponse()

      await controller.testConnection(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'ID is required' }),
      )
    })

    it('returns 500 on unexpected service error', async () => {
      mockTestConnection.mockRejectedValue(new Error('Unexpected'))
      const req = createMockRequest({ params: { id: 'prov-1' } })
      const res = createMockResponse()

      await controller.testConnection(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Failed to test connection' }),
      )
    })
  })
})
