/**
 * @fileoverview Unit tests for the EmbedTokenService.
 *
 * Tests token generation, CRUD operations, validation with caching,
 * expiration handling, and token masking. All Knex DB calls are mocked
 * via a chainable query builder pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

/**
 * @description Chainable mock that mimics Knex query builder.
 * Each method returns the same object for chaining, with terminal
 * methods (first, returning, delete, orderBy) returning promises.
 */
const createKnexChain = vi.hoisted(() => {
  return () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      where: vi.fn(),
      insert: vi.fn(),
      orderBy: vi.fn(),
      first: vi.fn(),
      returning: vi.fn(),
      delete: vi.fn(),
    }

    // Each chainable method returns the chain itself
    chain.where!.mockReturnValue(chain)
    chain.insert!.mockReturnValue(chain)
    chain.orderBy!.mockReturnValue(chain)
    chain.first!.mockResolvedValue(undefined)
    chain.returning!.mockResolvedValue([])
    chain.delete!.mockResolvedValue(1)

    return chain
  }
})

/** Mock knex function that tracks which table is queried */
const mockDb = vi.hoisted(() => {
  const fn = vi.fn() as ReturnType<typeof vi.fn> & { _chain: ReturnType<typeof createKnexChain> }
  // Create a default chain to start
  fn._chain = createKnexChain()
  fn.mockReturnValue(fn._chain)
  return fn
})

vi.mock('../../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

vi.mock('../../../src/shared/db/knex.js', () => ({
  db: mockDb,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { EmbedTokenService } from '../../../src/shared/services/embed-token.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Create a mock EmbedTokenRow for testing
 * @param {Record<string, unknown>} overrides - Fields to override
 * @returns {Record<string, unknown>} Mock token row
 */
function createMockTokenRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'token-uuid-1',
    app_id: 'resource-uuid-1',
    token: 'a'.repeat(64),
    name: 'Test Token',
    is_active: true,
    created_by: 'user-uuid-1',
    created_at: new Date('2025-01-01'),
    expires_at: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmbedTokenService', () => {
  let service: EmbedTokenService
  let chain: ReturnType<typeof createKnexChain>

  beforeEach(() => {
    vi.clearAllMocks()

    // Create a fresh service and knex chain for each test
    service = new EmbedTokenService('search_embed_tokens', 'app_id')
    chain = createKnexChain()
    mockDb.mockReturnValue(chain)
  })

  // =========================================================================
  // createToken
  // =========================================================================

  describe('createToken', () => {
    /**
     * @description Should insert a token row with generated 64-char hex token
     */
    it('should create a token with a 64-char hex string', async () => {
      const mockRow = createMockTokenRow()
      chain.returning!.mockResolvedValue([mockRow])

      const result = await service.createToken(
        'resource-uuid-1',
        'My Token',
        'user-uuid-1'
      )

      // Verify db was called with the correct table
      expect(mockDb).toHaveBeenCalledWith('search_embed_tokens')

      // Verify insert was called with correct structure
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          app_id: 'resource-uuid-1',
          name: 'My Token',
          is_active: true,
          created_by: 'user-uuid-1',
          expires_at: null,
        })
      )

      // Verify the token field is a 64-char hex string
      const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(insertArg.token).toMatch(/^[0-9a-f]{64}$/)

      // Verify the result is the returned row
      expect(result).toEqual(mockRow)
    })

    /**
     * @description Should pass expiresAt date when provided
     */
    it('should set expires_at when provided', async () => {
      const expiresAt = new Date('2026-12-31')
      chain.returning!.mockResolvedValue([createMockTokenRow({ expires_at: expiresAt })])

      await service.createToken('res-1', 'Expiring Token', 'user-1', expiresAt)

      const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(insertArg.expires_at).toEqual(expiresAt)
    })

    /**
     * @description Should set expires_at to null when expiresAt is explicitly null
     */
    it('should set expires_at to null when explicitly null', async () => {
      chain.returning!.mockResolvedValue([createMockTokenRow()])

      await service.createToken('res-1', 'No Expiry', 'user-1', null)

      const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(insertArg.expires_at).toBeNull()
    })

    /**
     * @description Should log token creation with table name and resource ID
     */
    it('should log token creation', async () => {
      const mockRow = createMockTokenRow()
      chain.returning!.mockResolvedValue([mockRow])

      await service.createToken('res-1', 'Token', 'user-1')

      expect(mockLog.info).toHaveBeenCalledWith('Embed token created', {
        table: 'search_embed_tokens',
        resourceId: 'res-1',
        tokenId: 'token-uuid-1',
      })
    })
  })

  // =========================================================================
  // listTokens
  // =========================================================================

  describe('listTokens', () => {
    /**
     * @description Should return tokens with masked token values
     */
    it('should mask token values showing first 8 and last 4 chars', async () => {
      const fullToken = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
      const mockRows = [createMockTokenRow({ token: fullToken })]

      // orderBy is the terminal operation for listTokens
      chain.orderBy!.mockResolvedValue(mockRows)

      const result = await service.listTokens('resource-uuid-1')

      // Verify the where clause uses the correct FK column
      expect(chain.where).toHaveBeenCalledWith({ app_id: 'resource-uuid-1' })

      // Verify token is masked: first 8 + "..." + last 4
      expect(result[0]!.token).toBe('abcdef01...6789')
    })

    /**
     * @description Should order tokens by created_at descending
     */
    it('should order by created_at desc', async () => {
      chain.orderBy!.mockResolvedValue([])

      await service.listTokens('res-1')

      expect(chain.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })

    /**
     * @description Should return empty array when no tokens exist
     */
    it('should return empty array when no tokens found', async () => {
      chain.orderBy!.mockResolvedValue([])

      const result = await service.listTokens('res-1')

      expect(result).toEqual([])
    })
  })

  // =========================================================================
  // revokeToken
  // =========================================================================

  describe('revokeToken', () => {
    /**
     * @description Should delete the token by ID and clear cache
     */
    it('should delete token and clear validation cache', async () => {
      const mockRow = createMockTokenRow()
      // first() returns the row for cache clearing lookup
      chain.first!.mockResolvedValue(mockRow)

      await service.revokeToken('token-uuid-1')

      // Verify delete was called
      expect(chain.delete).toHaveBeenCalled()

      // Verify log message
      expect(mockLog.info).toHaveBeenCalledWith('Embed token revoked', {
        table: 'search_embed_tokens',
        tokenId: 'token-uuid-1',
      })
    })

    /**
     * @description Should still delete even if token not found (already deleted)
     */
    it('should handle deletion when token row not found', async () => {
      chain.first!.mockResolvedValue(undefined)

      // Should not throw
      await service.revokeToken('nonexistent-id')

      // Delete is still attempted (idempotent)
      expect(chain.delete).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // validateToken
  // =========================================================================

  describe('validateToken', () => {
    /**
     * @description Should return token row for valid active non-expired token
     */
    it('should return token row for valid token', async () => {
      const mockRow = createMockTokenRow()
      chain.first!.mockResolvedValue(mockRow)

      const result = await service.validateToken('a'.repeat(64))

      // Verify lookup used correct filters
      expect(chain.where).toHaveBeenCalledWith({
        token: 'a'.repeat(64),
        is_active: true,
      })

      expect(result).toEqual(mockRow)
    })

    /**
     * @description Should return undefined for non-existent token
     */
    it('should return undefined for unknown token', async () => {
      chain.first!.mockResolvedValue(undefined)

      const result = await service.validateToken('unknown-token')

      expect(result).toBeUndefined()
    })

    /**
     * @description Should return undefined for expired token
     */
    it('should return undefined for expired token', async () => {
      // Token that expired yesterday
      const expiredRow = createMockTokenRow({
        expires_at: new Date('2020-01-01'),
      })
      chain.first!.mockResolvedValue(expiredRow)

      const result = await service.validateToken('a'.repeat(64))

      // Expired tokens should be rejected
      expect(result).toBeUndefined()
    })

    /**
     * @description Should return token row for non-expired token with future expiration
     */
    it('should return token row when expiration is in the future', async () => {
      const futureRow = createMockTokenRow({
        expires_at: new Date('2099-12-31'),
      })
      chain.first!.mockResolvedValue(futureRow)

      const result = await service.validateToken('a'.repeat(64))

      expect(result).toEqual(futureRow)
    })

    /**
     * @description Should use cached result within TTL window
     */
    it('should return cached result on second call within 30s TTL', async () => {
      const mockRow = createMockTokenRow()
      chain.first!.mockResolvedValue(mockRow)

      const tokenStr = 'b'.repeat(64)

      // First call — hits DB
      const result1 = await service.validateToken(tokenStr)
      expect(result1).toEqual(mockRow)

      // Reset the chain mock to track new calls
      chain.first!.mockClear()

      // Second call — should use cache, not DB
      const result2 = await service.validateToken(tokenStr)
      expect(result2).toEqual(mockRow)

      // DB should NOT have been queried again
      expect(chain.first).not.toHaveBeenCalled()
    })

    /**
     * @description Should re-query DB after cache TTL expires
     */
    it('should re-query after cache TTL expires', async () => {
      const mockRow = createMockTokenRow()
      chain.first!.mockResolvedValue(mockRow)

      const tokenStr = 'c'.repeat(64)

      // First call populates cache
      await service.validateToken(tokenStr)

      // Advance time past the 30-second TTL
      vi.useFakeTimers()
      vi.advanceTimersByTime(31_000)

      // Create a fresh chain for the re-query
      const chain2 = createKnexChain()
      mockDb.mockReturnValue(chain2)
      chain2.first!.mockResolvedValue(mockRow)

      const result = await service.validateToken(tokenStr)

      // Should have queried the DB again after TTL expiry
      expect(chain2.first).toHaveBeenCalled()
      expect(result).toEqual(mockRow)

      vi.useRealTimers()
    })
  })

  // =========================================================================
  // findById
  // =========================================================================

  describe('findById', () => {
    /**
     * @description Should return token row by ID
     */
    it('should return token row when found', async () => {
      const mockRow = createMockTokenRow()
      chain.first!.mockResolvedValue(mockRow)

      const result = await service.findById('token-uuid-1')

      expect(chain.where).toHaveBeenCalledWith({ id: 'token-uuid-1' })
      expect(result).toEqual(mockRow)
    })

    /**
     * @description Should return undefined when token ID does not exist
     */
    it('should return undefined when not found', async () => {
      chain.first!.mockResolvedValue(undefined)

      const result = await service.findById('nonexistent')

      expect(result).toBeUndefined()
    })
  })

  // =========================================================================
  // FK column configuration
  // =========================================================================

  describe('constructor FK column', () => {
    /**
     * @description Should use dialog_id FK column for chat embed tokens
     */
    it('should use dialog_id for chat embed token service', async () => {
      const chatService = new EmbedTokenService('chat_embed_tokens', 'dialog_id')

      chain.returning!.mockResolvedValue([createMockTokenRow({ dialog_id: 'dialog-1' })])

      await chatService.createToken('dialog-1', 'Chat Token', 'user-1')

      // Verify the insert uses dialog_id as the FK column
      const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(insertArg.dialog_id).toBe('dialog-1')
      expect(insertArg.app_id).toBeUndefined()
    })

    /**
     * @description Should default FK column to app_id when not specified
     */
    it('should default to app_id FK column', async () => {
      const defaultService = new EmbedTokenService('search_embed_tokens')

      chain.returning!.mockResolvedValue([createMockTokenRow()])

      await defaultService.createToken('app-1', 'Token', 'user-1')

      const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(insertArg.app_id).toBe('app-1')
    })
  })

  // =========================================================================
  // Token generation
  // =========================================================================

  describe('token generation', () => {
    /**
     * @description Generated tokens should be unique (different on each call)
     */
    it('should generate unique tokens', async () => {
      const tokens: string[] = []

      chain.returning!.mockImplementation(async () => {
        // Capture the token that was inserted
        const insertArg = (chain.insert as ReturnType<typeof vi.fn>).mock
          .lastCall![0]
        tokens.push(insertArg.token)
        return [createMockTokenRow({ token: insertArg.token })]
      })

      await service.createToken('res-1', 'Token 1', 'user-1')
      await service.createToken('res-1', 'Token 2', 'user-1')

      // Two generated tokens should be different (cryptographically random)
      expect(tokens[0]).not.toBe(tokens[1])

      // Both should be valid 64-char hex strings
      tokens.forEach((t) => expect(t).toMatch(/^[0-9a-f]{64}$/))
    })
  })
})
