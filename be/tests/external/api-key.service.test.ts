/**
 * @fileoverview Unit tests for the API Key service.
 *
 * Tests key generation, hashing, CRUD operations, validation with caching,
 * and last_used_at debouncing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockApiKeyModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findByHash: vi.fn(),
  listByUser: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    apiKey: mockApiKeyModel,
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { apiKeyService } from '../../src/modules/external/services/api-key.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock API key row
 */
function buildMockApiKey(overrides: Partial<any> = {}): any {
  return {
    id: 'key-uuid-1',
    user_id: 'user-1',
    name: 'Test Key',
    key_prefix: 'bk-a1b2c3d',
    key_hash: 'hashed-value',
    scopes: ['chat', 'search', 'retrieval'],
    is_active: true,
    last_used_at: null,
    expires_at: null,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiKeyService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // generateKey
  // -----------------------------------------------------------------------

  describe('generateKey', () => {
    it('returns a key starting with "bk-"', () => {
      const key = apiKeyService.generateKey()
      expect(key).toMatch(/^bk-[0-9a-f]{40}$/)
    })

    it('generates unique keys each time', () => {
      const key1 = apiKeyService.generateKey()
      const key2 = apiKeyService.generateKey()
      expect(key1).not.toBe(key2)
    })
  })

  // -----------------------------------------------------------------------
  // hashKey
  // -----------------------------------------------------------------------

  describe('hashKey', () => {
    it('returns a 64-char hex SHA-256 hash', () => {
      const hash = apiKeyService.hashKey('bk-0123456789abcdef0123456789abcdef01234567')
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('produces the same hash for the same input', () => {
      const hash1 = apiKeyService.hashKey('test-key')
      const hash2 = apiKeyService.hashKey('test-key')
      expect(hash1).toBe(hash2)
    })

    it('produces different hashes for different inputs', () => {
      const hash1 = apiKeyService.hashKey('key-a')
      const hash2 = apiKeyService.hashKey('key-b')
      expect(hash1).not.toBe(hash2)
    })
  })

  // -----------------------------------------------------------------------
  // createApiKey
  // -----------------------------------------------------------------------

  describe('createApiKey', () => {
    it('creates a key record and returns plaintext key', async () => {
      const mockRow = buildMockApiKey()
      mockApiKeyModel.create.mockResolvedValue(mockRow)

      const result = await apiKeyService.createApiKey(
        'user-1',
        'My API Key',
        ['chat', 'search'],
        null
      )

      // Plaintext key is returned
      expect(result.plaintextKey).toMatch(/^bk-[0-9a-f]{40}$/)
      expect(result.apiKey).toBe(mockRow)

      // Verify model was called with correct data
      expect(mockApiKeyModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          name: 'My API Key',
          scopes: ['chat', 'search'],
          is_active: true,
          expires_at: null,
        })
      )

      // Verify key_prefix is set (first 11 chars of plaintext)
      const createArg = mockApiKeyModel.create.mock.calls[0]![0]
      expect(createArg.key_prefix).toMatch(/^bk-[0-9a-f]{5}/)
      expect(createArg.key_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('stores expiration date when provided', async () => {
      const expiresAt = new Date('2027-01-01')
      mockApiKeyModel.create.mockResolvedValue(buildMockApiKey({ expires_at: expiresAt }))

      await apiKeyService.createApiKey('user-1', 'Expiring Key', ['chat'], expiresAt)

      expect(mockApiKeyModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ expires_at: expiresAt })
      )
    })
  })

  // -----------------------------------------------------------------------
  // listApiKeys
  // -----------------------------------------------------------------------

  describe('listApiKeys', () => {
    it('returns keys for the specified user', async () => {
      const mockKeys = [buildMockApiKey(), buildMockApiKey({ id: 'key-2' })]
      mockApiKeyModel.listByUser.mockResolvedValue(mockKeys)

      const result = await apiKeyService.listApiKeys('user-1')

      expect(result).toBe(mockKeys)
      expect(mockApiKeyModel.listByUser).toHaveBeenCalledWith('user-1')
    })
  })

  // -----------------------------------------------------------------------
  // updateApiKey
  // -----------------------------------------------------------------------

  describe('updateApiKey', () => {
    it('updates key when ownership matches', async () => {
      const existing = buildMockApiKey()
      const updated = { ...existing, name: 'Renamed Key' }
      mockApiKeyModel.findById.mockResolvedValue(existing)
      mockApiKeyModel.update.mockResolvedValue(updated)

      const result = await apiKeyService.updateApiKey('user-1', 'key-uuid-1', {
        name: 'Renamed Key',
      })

      expect(result).toBe(updated)
      expect(mockApiKeyModel.update).toHaveBeenCalledWith(
        'key-uuid-1',
        expect.objectContaining({ name: 'Renamed Key' })
      )
    })

    it('returns undefined when key not found', async () => {
      mockApiKeyModel.findById.mockResolvedValue(undefined)

      const result = await apiKeyService.updateApiKey('user-1', 'non-existent', {
        name: 'Test',
      })

      expect(result).toBeUndefined()
      expect(mockApiKeyModel.update).not.toHaveBeenCalled()
    })

    it('returns undefined when user does not own the key', async () => {
      mockApiKeyModel.findById.mockResolvedValue(
        buildMockApiKey({ user_id: 'other-user' })
      )

      const result = await apiKeyService.updateApiKey('user-1', 'key-uuid-1', {
        name: 'Test',
      })

      expect(result).toBeUndefined()
      expect(mockApiKeyModel.update).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // deleteApiKey
  // -----------------------------------------------------------------------

  describe('deleteApiKey', () => {
    it('deletes key when ownership matches', async () => {
      mockApiKeyModel.findById.mockResolvedValue(buildMockApiKey())
      mockApiKeyModel.delete.mockResolvedValue(undefined)

      const result = await apiKeyService.deleteApiKey('user-1', 'key-uuid-1')

      expect(result).toBe(true)
      expect(mockApiKeyModel.delete).toHaveBeenCalledWith('key-uuid-1')
    })

    it('returns false when key not found', async () => {
      mockApiKeyModel.findById.mockResolvedValue(undefined)

      const result = await apiKeyService.deleteApiKey('user-1', 'non-existent')

      expect(result).toBe(false)
      expect(mockApiKeyModel.delete).not.toHaveBeenCalled()
    })

    it('returns false when user does not own the key', async () => {
      mockApiKeyModel.findById.mockResolvedValue(
        buildMockApiKey({ user_id: 'other-user' })
      )

      const result = await apiKeyService.deleteApiKey('user-1', 'key-uuid-1')

      expect(result).toBe(false)
      expect(mockApiKeyModel.delete).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // validateApiKey
  // -----------------------------------------------------------------------

  describe('validateApiKey', () => {
    it('returns the key record for a valid active key', async () => {
      const mockRow = buildMockApiKey()
      mockApiKeyModel.findByHash.mockResolvedValue(mockRow)

      const result = await apiKeyService.validateApiKey('bk-testkey1234567890')

      expect(result).toBe(mockRow)
    })

    it('returns undefined for a key that does not exist', async () => {
      mockApiKeyModel.findByHash.mockResolvedValue(undefined)

      const result = await apiKeyService.validateApiKey('bk-nonexistent')

      expect(result).toBeUndefined()
    })

    it('returns undefined for an inactive key', async () => {
      mockApiKeyModel.findByHash.mockResolvedValue(
        buildMockApiKey({ is_active: false })
      )

      const result = await apiKeyService.validateApiKey('bk-inactivekey')

      expect(result).toBeUndefined()
    })

    it('returns undefined for an expired key', async () => {
      mockApiKeyModel.findByHash.mockResolvedValue(
        buildMockApiKey({ expires_at: new Date('2020-01-01') })
      )

      const result = await apiKeyService.validateApiKey('bk-expiredkey123')

      expect(result).toBeUndefined()
    })

    it('allows keys with future expiration', async () => {
      const futureDate = new Date(Date.now() + 86400000)
      const mockRow = buildMockApiKey({ expires_at: futureDate })
      mockApiKeyModel.findByHash.mockResolvedValue(mockRow)

      const result = await apiKeyService.validateApiKey('bk-futurekey1234')

      expect(result).toBe(mockRow)
    })

    it('fires last_used_at update on successful validation', async () => {
      const mockRow = buildMockApiKey({ id: 'last-used-key' })
      mockApiKeyModel.findByHash.mockResolvedValue(mockRow)
      // Clear any debounce state by using a unique key hash
      mockApiKeyModel.update.mockResolvedValue(undefined)

      await apiKeyService.validateApiKey('bk-lastusetest12345unique')

      // Allow the fire-and-forget promise to settle
      await new Promise(resolve => setTimeout(resolve, 100))

      // The update should be called for last_used_at (debounced, so may only fire first time)
      // Since this is a fresh key hash, debounce window should allow the call
      expect(mockApiKeyModel.update).toHaveBeenCalledWith(
        'last-used-key',
        expect.objectContaining({ last_used_at: expect.any(Date) })
      )
    })
  })
})
