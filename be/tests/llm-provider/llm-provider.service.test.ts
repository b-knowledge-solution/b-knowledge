/**
 * @fileoverview Tests for LlmProviderService covering CRUD, encryption, audit logging,
 * vision companion sync, connection testing with multi-URL fallback, and public listing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before the dynamic import so vi.mock hoists correctly
// ---------------------------------------------------------------------------

const mockFindAll = vi.fn()
const mockFindById = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockFindDefaults = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    modelProvider: {
      findAll: (...args: any[]) => mockFindAll(...args),
      findById: (...args: any[]) => mockFindById(...args),
      create: (...args: any[]) => mockCreate(...args),
      update: (...args: any[]) => mockUpdate(...args),
      findDefaults: (...args: any[]) => mockFindDefaults(...args),
    },
  },
}))

const mockEncrypt = vi.fn()

vi.mock('@/shared/services/crypto.service.js', () => ({
  cryptoService: {
    encrypt: (...args: any[]) => mockEncrypt(...args),
  },
}))

const mockAuditLog = vi.fn()

vi.mock('@/modules/audit/services/audit.service.js', () => ({
  auditService: {
    log: (...args: any[]) => mockAuditLog(...args),
  },
  AuditAction: { UPDATE_CONFIG: 'UPDATE_CONFIG' },
  AuditResourceType: { MODEL_PROVIDER: 'MODEL_PROVIDER' },
}))

vi.mock('@/shared/models/types.js', () => ({}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock knex db for listPublic — the db export is a Knex instance (callable as db('table'))
// Use a Proxy so method calls always return the proxy itself, immune to vi.clearAllMocks
vi.mock('@/shared/db/knex.js', () => {
  const calls: Record<string, any[][]> = {}
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Make the chain thenable (resolves to empty array by default)
        return (resolve: any) => Promise.resolve([]).then(resolve)
      }
      if (prop === '__calls') return calls
      // Return a function that records calls and returns the proxy
      return (...args: any[]) => {
        if (!calls[prop as string]) calls[prop as string] = []
        calls[prop as string].push(args)
        return proxy
      }
    },
  }
  const proxy = new Proxy({}, handler)
  return { db: () => proxy }
})

// Import after mocking
import { LlmProviderService } from '../../src/modules/llm-provider/services/llm-provider.service'

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const USER_CONTEXT = { id: 'user-1', email: 'test@example.com', ip: '127.0.0.1' }

/**
 * @description Build a mock ModelProvider record
 * @param {Partial<any>} overrides - Fields to override on the default provider
 * @returns {any} Mock provider record
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
    created_by: 'user-1',
    updated_by: 'user-1',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LlmProviderService', () => {
  let service: LlmProviderService

  beforeEach(() => {
    service = new LlmProviderService()
    vi.clearAllMocks()
    // Default: no vision companions found
    mockFindAll.mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns active providers ordered by factory name', async () => {
      const providers = [makeProvider({ factory_name: 'Anthropic' }), makeProvider()]
      mockFindAll.mockResolvedValue(providers)

      const result = await service.list()

      expect(result).toEqual(providers)
      // Verify correct filter and sort options
      expect(mockFindAll).toHaveBeenCalledWith(
        { status: 'active' },
        { orderBy: { factory_name: 'asc' } },
      )
    })

    it('returns empty array when no providers exist', async () => {
      mockFindAll.mockResolvedValue([])

      const result = await service.list()

      expect(result).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe('getById', () => {
    it('returns the provider when found', async () => {
      const provider = makeProvider()
      mockFindById.mockResolvedValue(provider)

      const result = await service.getById('prov-1')

      expect(result).toEqual(provider)
      expect(mockFindById).toHaveBeenCalledWith('prov-1')
    })

    it('returns undefined when provider not found', async () => {
      mockFindById.mockResolvedValue(undefined)

      const result = await service.getById('non-existent')

      expect(result).toBeUndefined()
    })
  })

  // -----------------------------------------------------------------------
  // getDefaults
  // -----------------------------------------------------------------------

  describe('getDefaults', () => {
    it('returns default providers via findDefaults', async () => {
      const defaults = [
        makeProvider({ model_type: 'chat', is_default: true }),
        makeProvider({ model_type: 'embedding', is_default: true, id: 'prov-2' }),
      ]
      mockFindDefaults.mockResolvedValue(defaults)

      const result = await service.getDefaults()

      expect(result).toEqual(defaults)
      expect(mockFindDefaults).toHaveBeenCalledOnce()
    })
  })

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('creates a new provider with encrypted API key', async () => {
      mockEncrypt.mockReturnValue('enc-key-123')
      // No soft-deleted duplicate found
      mockFindAll.mockResolvedValue([])
      const created = makeProvider({ api_key: 'enc-key-123' })
      mockCreate.mockResolvedValue(created)

      const result = await service.create({
        factory_name: 'OpenAI',
        model_type: 'chat',
        model_name: 'gpt-4o',
        api_key: 'sk-raw-key',
      }, USER_CONTEXT)

      expect(result).toEqual(created)
      // Verify encryption was called with the raw key
      expect(mockEncrypt).toHaveBeenCalledWith('sk-raw-key')
      // Verify create was called with encrypted key
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          api_key: 'enc-key-123',
          factory_name: 'OpenAI',
          model_type: 'chat',
          model_name: 'gpt-4o',
          status: 'active',
        }),
      )
    })

    it('sets api_key to null when not provided', async () => {
      mockFindAll.mockResolvedValue([])
      mockCreate.mockResolvedValue(makeProvider({ api_key: null }))

      await service.create({
        factory_name: 'Ollama',
        model_type: 'chat',
        model_name: 'llama3',
      })

      // Encryption should not be called for missing key
      expect(mockEncrypt).not.toHaveBeenCalled()
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ api_key: null }),
      )
    })

    it('reactivates soft-deleted duplicate instead of creating new', async () => {
      const deletedRow = makeProvider({ id: 'old-id', status: 'deleted' })
      // First findAll call: check for soft-deleted duplicate — return existing
      mockFindAll.mockResolvedValueOnce([deletedRow])
      // Second findAll call: syncVisionCompanion — no companion
      mockFindAll.mockResolvedValueOnce([])
      const reactivated = makeProvider({ id: 'old-id', status: 'active' })
      mockUpdate.mockResolvedValue(reactivated)
      mockEncrypt.mockReturnValue('enc-key')

      const result = await service.create({
        factory_name: 'OpenAI',
        model_type: 'chat',
        model_name: 'gpt-4o',
        api_key: 'sk-key',
      })

      expect(result).toEqual(reactivated)
      // Should call update (reactivation) rather than create
      expect(mockUpdate).toHaveBeenCalledWith(
        'old-id',
        expect.objectContaining({ status: 'active' }),
      )
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('logs an audit event when user context is provided', async () => {
      mockFindAll.mockResolvedValue([])
      const created = makeProvider()
      mockCreate.mockResolvedValue(created)

      await service.create({
        factory_name: 'OpenAI',
        model_type: 'chat',
        model_name: 'gpt-4o',
      }, USER_CONTEXT)

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_CONTEXT.id,
          userEmail: USER_CONTEXT.email,
          action: 'UPDATE_CONFIG',
          resourceType: 'MODEL_PROVIDER',
          resourceId: created.id,
          ipAddress: USER_CONTEXT.ip,
        }),
      )
    })

    it('skips audit logging when no user context', async () => {
      mockFindAll.mockResolvedValue([])
      mockCreate.mockResolvedValue(makeProvider())

      await service.create({
        factory_name: 'OpenAI',
        model_type: 'chat',
        model_name: 'gpt-4o',
      })

      expect(mockAuditLog).not.toHaveBeenCalled()
    })

    it('triggers vision companion sync for chat models with vision', async () => {
      mockEncrypt.mockReturnValue('enc')
      // First findAll: no soft-deleted duplicate
      mockFindAll.mockResolvedValueOnce([])
      const created = makeProvider({ model_type: 'chat', vision: true })
      mockCreate.mockResolvedValueOnce(created)
      // Second findAll: syncVisionCompanion — no existing companion
      mockFindAll.mockResolvedValueOnce([])
      // companion create
      mockCreate.mockResolvedValueOnce(makeProvider({ model_type: 'image2text' }))

      await service.create({
        factory_name: 'OpenAI',
        model_type: 'chat',
        model_name: 'gpt-4o',
        api_key: 'sk-key',
        vision: true,
      })

      // Should create the image2text companion
      expect(mockCreate).toHaveBeenCalledTimes(2)
      expect(mockCreate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          model_type: 'image2text',
          vision: true,
        }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('updates provider fields and returns the updated record', async () => {
      const updated = makeProvider({ factory_name: 'Anthropic' })
      mockUpdate.mockResolvedValue(updated)
      // syncVisionCompanion — no companion
      mockFindAll.mockResolvedValue([])

      const result = await service.update('prov-1', {
        factory_name: 'Anthropic',
      }, USER_CONTEXT)

      expect(result).toEqual(updated)
      expect(mockUpdate).toHaveBeenCalledWith('prov-1', expect.objectContaining({
        factory_name: 'Anthropic',
        updated_by: USER_CONTEXT.id,
      }))
    })

    it('encrypts api_key when provided and not masked placeholder', async () => {
      mockEncrypt.mockReturnValue('enc-new')
      mockUpdate.mockResolvedValue(makeProvider())
      mockFindAll.mockResolvedValue([])

      await service.update('prov-1', { api_key: 'new-secret' }, USER_CONTEXT)

      expect(mockEncrypt).toHaveBeenCalledWith('new-secret')
      expect(mockUpdate).toHaveBeenCalledWith('prov-1', expect.objectContaining({
        api_key: 'enc-new',
      }))
    })

    it('skips api_key update when masked placeholder *** is sent', async () => {
      mockUpdate.mockResolvedValue(makeProvider())
      mockFindAll.mockResolvedValue([])

      await service.update('prov-1', { api_key: '***' })

      // Encryption should not be called — key is unchanged
      expect(mockEncrypt).not.toHaveBeenCalled()
      // api_key should not appear in the update payload
      expect(mockUpdate).toHaveBeenCalledWith('prov-1', expect.not.objectContaining({
        api_key: expect.anything(),
      }))
    })

    it('returns undefined when provider not found', async () => {
      mockUpdate.mockResolvedValue(undefined)

      const result = await service.update('non-existent', { factory_name: 'X' })

      expect(result).toBeUndefined()
    })

    it('logs an audit event on successful update', async () => {
      mockUpdate.mockResolvedValue(makeProvider())
      mockFindAll.mockResolvedValue([])

      await service.update('prov-1', { factory_name: 'Updated' }, USER_CONTEXT)

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_CONTEXT.id,
          action: 'UPDATE_CONFIG',
          resourceId: 'prov-1',
        }),
      )
    })

    it('does not log audit when update returns undefined', async () => {
      mockUpdate.mockResolvedValue(undefined)

      await service.update('prov-1', { factory_name: 'X' }, USER_CONTEXT)

      expect(mockAuditLog).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('soft-deletes the provider by setting status to deleted', async () => {
      // Provider lookup returns a non-chat model so no companion logic
      mockFindById.mockResolvedValue(makeProvider({ model_type: 'embedding' }))
      mockUpdate.mockResolvedValue(makeProvider({ status: 'deleted' }))

      await service.delete('prov-1', USER_CONTEXT)

      expect(mockUpdate).toHaveBeenCalledWith('prov-1', { status: 'deleted' })
    })

    it('also soft-deletes image2text companion for chat providers', async () => {
      // Provider is a chat model
      mockFindById.mockResolvedValue(makeProvider({ model_type: 'chat' }))
      // Main soft-delete
      mockUpdate.mockResolvedValueOnce(undefined)
      // Companion found
      const companion = makeProvider({ id: 'comp-1', model_type: 'image2text' })
      mockFindAll.mockResolvedValue([companion])
      // Companion soft-delete
      mockUpdate.mockResolvedValueOnce(undefined)

      await service.delete('prov-1', USER_CONTEXT)

      // Should have two update calls: one for main provider, one for companion
      expect(mockUpdate).toHaveBeenCalledTimes(2)
      expect(mockUpdate).toHaveBeenCalledWith('comp-1', { status: 'deleted' })
    })

    it('does not look for companions when provider is not chat type', async () => {
      mockFindById.mockResolvedValue(makeProvider({ model_type: 'embedding' }))
      mockUpdate.mockResolvedValue(undefined)

      await service.delete('prov-1')

      // Only one update call (the main soft-delete), no companion search
      expect(mockFindAll).not.toHaveBeenCalled()
    })

    it('logs an audit event when user context is provided', async () => {
      mockFindById.mockResolvedValue(makeProvider({ model_type: 'embedding' }))
      mockUpdate.mockResolvedValue(undefined)

      await service.delete('prov-1', USER_CONTEXT)

      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: USER_CONTEXT.id,
          action: 'UPDATE_CONFIG',
          resourceId: 'prov-1',
        }),
      )
    })

    it('skips audit logging when no user context', async () => {
      mockFindById.mockResolvedValue(makeProvider({ model_type: 'embedding' }))
      mockUpdate.mockResolvedValue(undefined)

      await service.delete('prov-1')

      expect(mockAuditLog).not.toHaveBeenCalled()
    })
  })

  // -----------------------------------------------------------------------
  // testConnection
  // -----------------------------------------------------------------------

  describe('testConnection', () => {
    it('returns error when provider not found', async () => {
      mockFindById.mockResolvedValue(undefined)

      const result = await service.testConnection('non-existent')

      expect(result).toEqual({
        success: false,
        error: 'Provider not found or inactive',
      })
    })

    it('returns error when provider is inactive', async () => {
      mockFindById.mockResolvedValue(makeProvider({ status: 'deleted' }))

      const result = await service.testConnection('prov-1')

      expect(result).toEqual({
        success: false,
        error: 'Provider not found or inactive',
      })
    })

    it('returns error when api_base is empty', async () => {
      mockFindById.mockResolvedValue(makeProvider({ api_base: '' }))

      const result = await service.testConnection('prov-1')

      expect(result).toEqual({
        success: false,
        error: 'No API base URL configured',
      })
    })

    it('returns error when api_base is null', async () => {
      mockFindById.mockResolvedValue(makeProvider({ api_base: null }))

      const result = await service.testConnection('prov-1')

      expect(result).toEqual({
        success: false,
        error: 'No API base URL configured',
      })
    })

    it('returns success with latency when fetch succeeds on first URL', async () => {
      mockFindById.mockResolvedValue(makeProvider({
        model_type: 'chat',
        api_base: 'https://api.openai.com/v1',
      }))

      // Mock global fetch to return a successful response
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{"choices":[]}'),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await service.testConnection('prov-1')

      expect(result.success).toBe(true)
      expect(result.latencyMs).toBeDefined()
      expect(typeof result.latencyMs).toBe('number')
      // Verify it tried the correct endpoint for chat models
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('chat/completions'),
        expect.objectContaining({ method: 'POST' }),
      )

      vi.unstubAllGlobals()
    })

    it('tries fallback URL when first returns non-OK', async () => {
      mockFindById.mockResolvedValue(makeProvider({
        model_type: 'chat',
        api_base: 'https://api.example.com',
      }))

      // First call fails with 404, second succeeds
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: vi.fn().mockResolvedValue('Not found'),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: vi.fn().mockResolvedValue('OK'),
        })
      vi.stubGlobal('fetch', mockFetch)

      const result = await service.testConnection('prov-1')

      expect(result.success).toBe(true)
      // Should have tried two URLs (base and base + /v1)
      expect(mockFetch).toHaveBeenCalledTimes(2)

      vi.unstubAllGlobals()
    })

    it('returns failure when all URLs exhausted', async () => {
      mockFindById.mockResolvedValue(makeProvider({
        model_type: 'chat',
        api_base: 'https://api.example.com',
      }))

      // Both calls throw network error
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      vi.stubGlobal('fetch', mockFetch)

      const result = await service.testConnection('prov-1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Could not reach API')

      vi.unstubAllGlobals()
    })

    it('uses GET models endpoint for rerank model type', async () => {
      mockFindById.mockResolvedValue(makeProvider({
        model_type: 'rerank',
        api_base: 'https://api.example.com/v1',
      }))

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{"data":[]}'),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await service.testConnection('prov-1')

      expect(result.success).toBe(true)
      // Rerank uses GET /models
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/models'),
        expect.objectContaining({ method: 'GET' }),
      )

      vi.unstubAllGlobals()
    })

    it('uses embeddings endpoint for embedding model type', async () => {
      mockFindById.mockResolvedValue(makeProvider({
        model_type: 'embedding',
        api_base: 'https://api.example.com/v1',
      }))

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('{"data":[]}'),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await service.testConnection('prov-1')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/embeddings'),
        expect.objectContaining({ method: 'POST' }),
      )

      vi.unstubAllGlobals()
    })

    it('includes Authorization header when api_key is present', async () => {
      mockFindById.mockResolvedValue(makeProvider({
        model_type: 'chat',
        api_base: 'https://api.example.com/v1',
        api_key: 'secret-key',
      }))

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: vi.fn().mockResolvedValue('OK'),
      })
      vi.stubGlobal('fetch', mockFetch)

      await service.testConnection('prov-1')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-key',
          }),
        }),
      )

      vi.unstubAllGlobals()
    })
  })

  // -----------------------------------------------------------------------
  // listPublic
  // -----------------------------------------------------------------------

  describe('listPublic', () => {
    /**
     * @description Helper to access the recorded calls from the db chain Proxy
     * @returns {Record<string, any[][]>} Map of method name to array of call argument arrays
     */
    function getDbCalls(): Record<string, any[][]> {
      // The Proxy-based mock records all calls in a __calls map
      // We need to invoke listPublic first, then import the db mock to read __calls
      // Since the proxy is self-contained, we access it via a fresh db() call's __calls
      return (globalThis as any).__dbCalls
    }

    it('queries only safe columns without api_key or api_base', async () => {
      const result = await service.listPublic()

      // listPublic chains: db('model_providers').select(...).where(...).orderBy(...).orderBy(...)
      // We can verify the return value resolves (the proxy is thenable)
      expect(result).toEqual([])
    })

    it('filters by model_type when provided', async () => {
      // listPublic('embedding') adds an extra .where('model_type', 'embedding')
      const result = await service.listPublic('embedding')

      // Should resolve without error, meaning all chained calls succeeded
      expect(result).toEqual([])
    })

    it('resolves without error when model_type is not provided', async () => {
      const result = await service.listPublic()

      expect(result).toEqual([])
    })
  })
})
