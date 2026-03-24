/**
 * @fileoverview Unit tests for the API Key controller.
 *
 * Tests create, list, update, and delete endpoints with mocked service layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateApiKey = vi.hoisted(() => vi.fn())
const mockListApiKeys = vi.hoisted(() => vi.fn())
const mockUpdateApiKey = vi.hoisted(() => vi.fn())
const mockDeleteApiKey = vi.hoisted(() => vi.fn())

vi.mock('../../src/modules/external/services/api-key.service.js', () => ({
  apiKeyService: {
    createApiKey: mockCreateApiKey,
    listApiKeys: mockListApiKeys,
    updateApiKey: mockUpdateApiKey,
    deleteApiKey: mockDeleteApiKey,
  },
}))

import { apiKeyController } from '../../src/modules/external/controllers/api-key.controller.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock API key record
 */
function buildMockApiKey(overrides: Partial<any> = {}): any {
  return {
    id: 'key-1',
    user_id: 'user-1',
    name: 'Test Key',
    key_prefix: 'bk-abc1234',
    key_hash: 'somehashvalue',
    scopes: ['chat', 'search', 'retrieval'],
    is_active: true,
    last_used_at: null,
    expires_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiKeyController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('creates a key and returns 201 with plaintext', async () => {
      const mockKey = buildMockApiKey()
      mockCreateApiKey.mockResolvedValue({
        apiKey: mockKey,
        plaintextKey: 'bk-plaintextkey123',
      })

      const req = createMockRequest({
        session: { user: { id: 'user-1' } },
        body: { name: 'My Key', scopes: ['chat'], expires_at: null },
      })
      const res = createMockResponse()

      await apiKeyController.create(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          plaintext_key: 'bk-plaintextkey123',
          name: 'Test Key',
        })
      )
    })

    it('returns 401 when session has no user', async () => {
      const req = createMockRequest({ session: {} })
      const res = createMockResponse()

      await apiKeyController.create(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(mockCreateApiKey).not.toHaveBeenCalled()
    })

    it('returns 500 on service error', async () => {
      mockCreateApiKey.mockRejectedValue(new Error('DB error'))

      const req = createMockRequest({
        session: { user: { id: 'user-1' } },
        body: { name: 'Test', scopes: ['chat'] },
      })
      const res = createMockResponse()

      await apiKeyController.create(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns keys without key_hash', async () => {
      const keys = [
        buildMockApiKey({ id: 'key-1' }),
        buildMockApiKey({ id: 'key-2' }),
      ]
      mockListApiKeys.mockResolvedValue(keys)

      const req = createMockRequest({
        session: { user: { id: 'user-1' } },
      })
      const res = createMockResponse()

      await apiKeyController.list(req, res)

      expect(res.json).toHaveBeenCalled()
      // Verify key_hash is stripped from each key
      const returnedKeys = res.json.mock.calls[0]![0]
      for (const key of returnedKeys) {
        expect(key).not.toHaveProperty('key_hash')
      }
    })

    it('returns 401 when session has no user', async () => {
      const req = createMockRequest({ session: {} })
      const res = createMockResponse()

      await apiKeyController.list(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
    })
  })

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('updates and returns the key without key_hash', async () => {
      const updated = buildMockApiKey({ name: 'Updated Name' })
      mockUpdateApiKey.mockResolvedValue(updated)

      const req = createMockRequest({
        session: { user: { id: 'user-1' } },
        params: { id: 'key-1' },
        body: { name: 'Updated Name' },
      })
      const res = createMockResponse()

      await apiKeyController.update(req, res)

      expect(res.json).toHaveBeenCalled()
      const returnedKey = res.json.mock.calls[0]![0]
      expect(returnedKey).not.toHaveProperty('key_hash')
      expect(returnedKey.name).toBe('Updated Name')
    })

    it('returns 404 when key not found or not owned', async () => {
      mockUpdateApiKey.mockResolvedValue(undefined)

      const req = createMockRequest({
        session: { user: { id: 'user-1' } },
        params: { id: 'nonexistent' },
        body: { name: 'Test' },
      })
      const res = createMockResponse()

      await apiKeyController.update(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  // -----------------------------------------------------------------------
  // remove
  // -----------------------------------------------------------------------

  describe('remove', () => {
    it('returns 204 on successful deletion', async () => {
      mockDeleteApiKey.mockResolvedValue(true)

      const req = createMockRequest({
        session: { user: { id: 'user-1' } },
        params: { id: 'key-1' },
      })
      const res = createMockResponse()

      await apiKeyController.remove(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('returns 404 when key not found', async () => {
      mockDeleteApiKey.mockResolvedValue(false)

      const req = createMockRequest({
        session: { user: { id: 'user-1' } },
        params: { id: 'nonexistent' },
      })
      const res = createMockResponse()

      await apiKeyController.remove(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })
})
