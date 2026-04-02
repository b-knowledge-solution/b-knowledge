/**
 * @fileoverview Unit tests for the API Key API layer.
 *
 * Verifies correct HTTP methods, URLs, and payload shapes for all CRUD operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    patch: (...args: any[]) => mockPatch(...args),
    delete: (...args: any[]) => mockDelete(...args),
  },
}))

import { apiKeyApi } from '@/features/api-keys/api/apiKeyApi'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('apiKeyApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('list', () => {
    it('calls GET /api/external/api-keys', async () => {
      const mockKeys = [{ id: 'key-1', name: 'Test' }]
      mockGet.mockResolvedValue(mockKeys)

      const result = await apiKeyApi.list()

      expect(mockGet).toHaveBeenCalledWith('/api/external/api-keys')
      expect(result).toBe(mockKeys)
    })
  })

  describe('create', () => {
    it('calls POST /api/external/api-keys with correct payload', async () => {
      const createData = {
        name: 'My Key',
        scopes: ['chat', 'search'],
        expires_at: null,
      }
      const mockResponse = { id: 'key-1', plaintext_key: 'bk-abc123' }
      mockPost.mockResolvedValue(mockResponse)

      const result = await apiKeyApi.create(createData)

      expect(mockPost).toHaveBeenCalledWith('/api/external/api-keys', createData)
      expect(result).toBe(mockResponse)
    })
  })

  describe('update', () => {
    it('calls PATCH /api/external/api-keys/:id with update data', async () => {
      const updateData = { name: 'Renamed', is_active: false }
      const mockResponse = { id: 'key-1', name: 'Renamed' }
      mockPatch.mockResolvedValue(mockResponse)

      const result = await apiKeyApi.update('key-1', updateData)

      expect(mockPatch).toHaveBeenCalledWith('/api/external/api-keys/key-1', updateData)
      expect(result).toBe(mockResponse)
    })
  })

  describe('remove', () => {
    it('calls DELETE /api/external/api-keys/:id', async () => {
      mockDelete.mockResolvedValue(undefined)

      await apiKeyApi.remove('key-1')

      expect(mockDelete).toHaveBeenCalledWith('/api/external/api-keys/key-1')
    })
  })
})
