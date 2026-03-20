/**
 * @fileoverview Tests for LLM Provider API service.
 *
 * Tests:
 * - CRUD operations: getProviders, getProvider, createProvider, updateProvider, deleteProvider
 * - getDefaults, getPresets
 * - testConnection
 *
 * Mocks `api` from `@/lib/api` to verify correct HTTP method, endpoint, and payload.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockApi = {
  get: vi.fn().mockResolvedValue({}),
  post: vi.fn().mockResolvedValue({}),
  put: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/lib/api', () => ({
  api: mockApi,
}))

// ============================================================================
// Tests
// ============================================================================

describe('llmProviderApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * @description Dynamically imports the module so mocks are resolved
   * @returns {Promise<typeof import('@/features/llm-provider/api/llmProviderApi')>} Module exports
   */
  async function importModule() {
    return await import('@/features/llm-provider/api/llmProviderApi')
  }

  // --------------------------------------------------------------------------
  // Read operations
  // --------------------------------------------------------------------------

  describe('getProviders', () => {
    /** @description Should fetch all providers from the base endpoint */
    it('should call api.get with base endpoint', async () => {
      const { getProviders } = await importModule()
      const mockData = [{ id: 'p1', name: 'OpenAI' }]
      mockApi.get.mockResolvedValueOnce(mockData)

      const result = await getProviders()

      expect(mockApi.get).toHaveBeenCalledWith('/api/llm-provider')
      expect(result).toEqual(mockData)
    })
  })

  describe('getProvider', () => {
    /** @description Should fetch a single provider by its UUID */
    it('should call api.get with provider-specific endpoint', async () => {
      const { getProvider } = await importModule()
      const mockData = { id: 'p1', name: 'OpenAI' }
      mockApi.get.mockResolvedValueOnce(mockData)

      const result = await getProvider('p1')

      expect(mockApi.get).toHaveBeenCalledWith('/api/llm-provider/p1')
      expect(result).toEqual(mockData)
    })
  })

  describe('getDefaults', () => {
    /** @description Should fetch default providers from the defaults endpoint */
    it('should call api.get with defaults endpoint', async () => {
      const { getDefaults } = await importModule()

      await getDefaults()

      expect(mockApi.get).toHaveBeenCalledWith('/api/llm-provider/defaults')
    })
  })

  describe('getPresets', () => {
    /** @description Should fetch factory presets from the presets endpoint */
    it('should call api.get with presets endpoint', async () => {
      const { getPresets } = await importModule()

      await getPresets()

      expect(mockApi.get).toHaveBeenCalledWith('/api/llm-provider/presets')
    })
  })

  // --------------------------------------------------------------------------
  // Write operations
  // --------------------------------------------------------------------------

  describe('createProvider', () => {
    /** @description Should POST provider creation data to the base endpoint */
    it('should call api.post with creation payload', async () => {
      const { createProvider } = await importModule()
      const payload = { provider_name: 'OpenAI', api_key: 'sk-test' }

      await createProvider(payload as any)

      expect(mockApi.post).toHaveBeenCalledWith('/api/llm-provider', payload)
    })
  })

  describe('updateProvider', () => {
    /** @description Should PUT updated data to the provider-specific endpoint */
    it('should call api.put with provider ID and update payload', async () => {
      const { updateProvider } = await importModule()
      const payload = { api_key: 'sk-updated' }

      await updateProvider('p1', payload as any)

      expect(mockApi.put).toHaveBeenCalledWith('/api/llm-provider/p1', payload)
    })
  })

  describe('deleteProvider', () => {
    /** @description Should send DELETE to the provider-specific endpoint */
    it('should call api.delete with provider ID', async () => {
      const { deleteProvider } = await importModule()

      await deleteProvider('p1')

      expect(mockApi.delete).toHaveBeenCalledWith('/api/llm-provider/p1')
    })
  })

  // --------------------------------------------------------------------------
  // Connection test
  // --------------------------------------------------------------------------

  describe('testConnection', () => {
    /** @description Should POST to the test-connection endpoint with provider ID */
    it('should call api.post with test-connection endpoint', async () => {
      const { testConnection } = await importModule()
      const mockResult = { success: true, latencyMs: 150 }
      mockApi.post.mockResolvedValueOnce(mockResult)

      const result = await testConnection('p1')

      expect(mockApi.post).toHaveBeenCalledWith('/api/llm-provider/p1/test-connection')
      expect(result).toEqual(mockResult)
    })

    /** @description Should return error result when connection test fails */
    it('should return failure result from the API', async () => {
      const { testConnection } = await importModule()
      const mockResult = { success: false, error: 'Connection refused' }
      mockApi.post.mockResolvedValueOnce(mockResult)

      const result = await testConnection('p1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection refused')
    })
  })
})
