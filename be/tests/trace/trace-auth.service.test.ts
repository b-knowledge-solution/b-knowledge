/**
 * @fileoverview Tests for TraceAuthService email validation with Redis cache.
 *
 * Tests validateEmailWithCache with cache hits, cache misses,
 * lock contention, and Redis unavailability.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Delegate mocks
// ---------------------------------------------------------------------------

const mockRedisGet = vi.fn()
const mockRedisSetEx = vi.fn()
const mockRedisSetNX = vi.fn()
const mockRedisPExpire = vi.fn()
const mockRedisDel = vi.fn()
const mockRedisExists = vi.fn()
const mockRedisConnect = vi.fn()
const mockRedisQuit = vi.fn()

let mockIsOpen = true
let mockIsReady = true

vi.mock('redis', () => ({
  createClient: () => ({
    on: () => {},
    connect: (...a: any[]) => mockRedisConnect(...a),
    get isOpen() { return mockIsOpen },
    get isReady() { return mockIsReady },
    quit: (...a: any[]) => mockRedisQuit(...a),
    get: (...a: any[]) => mockRedisGet(...a),
    setEx: (...a: any[]) => mockRedisSetEx(...a),
    setNX: (...a: any[]) => mockRedisSetNX(...a),
    pExpire: (...a: any[]) => mockRedisPExpire(...a),
    del: (...a: any[]) => mockRedisDel(...a),
    exists: (...a: any[]) => mockRedisExists(...a),
  }),
}))

vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    redis: { url: 'redis://localhost:6379' },
    externalTrace: { cacheTtlSeconds: 300, lockTimeoutMs: 5000 },
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}))

const mockFindByEmail = vi.fn()
vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    user: {
      findByEmail: (...a: any[]) => mockFindByEmail(...a),
    },
  },
}))

describe('TraceAuthService', () => {
  let TraceAuthService: any

  beforeEach(async () => {
    mockRedisGet.mockReset()
    mockRedisSetEx.mockReset()
    mockRedisSetNX.mockReset()
    mockRedisPExpire.mockReset()
    mockRedisDel.mockReset()
    mockRedisExists.mockReset()
    mockRedisConnect.mockReset()
    mockRedisQuit.mockReset()
    mockFindByEmail.mockReset()
    mockIsOpen = true
    mockIsReady = true
    mockRedisConnect.mockResolvedValue(undefined)
    mockRedisQuit.mockResolvedValue(undefined)
    mockRedisSetEx.mockResolvedValue(undefined)
    mockRedisPExpire.mockResolvedValue(undefined)
    mockRedisDel.mockResolvedValue(undefined)

    const mod = await import('../../src/modules/trace/services/trace-auth.service.js')
    TraceAuthService = mod.TraceAuthService
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('validateEmailWithCache', () => {
    it('returns cached result on cache hit (true)', async () => {
      mockRedisGet.mockResolvedValue('true')

      const service = new TraceAuthService()
      const result = await service.validateEmailWithCache('user@test.com', '127.0.0.1')

      expect(result).toBe(true)
      expect(mockFindByEmail).not.toHaveBeenCalled()
    })

    it('returns cached result on cache hit (false)', async () => {
      mockRedisGet.mockResolvedValue('false')

      const service = new TraceAuthService()
      const result = await service.validateEmailWithCache('bad@test.com', '127.0.0.1')

      expect(result).toBe(false)
      expect(mockFindByEmail).not.toHaveBeenCalled()
    })

    it('queries DB on cache miss and caches result', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSetNX.mockResolvedValue(true)
      mockFindByEmail.mockResolvedValue({ id: 'u1', email: 'user@test.com' })

      const service = new TraceAuthService()
      const result = await service.validateEmailWithCache('user@test.com', '127.0.0.1')

      expect(result).toBe(true)
      expect(mockFindByEmail).toHaveBeenCalledWith('user@test.com')
      expect(mockRedisSetEx).toHaveBeenCalledWith(
        expect.stringContaining('user@test.com'),
        300,
        'true'
      )
      expect(mockRedisDel).toHaveBeenCalled()
    })

    it('returns false when user not found in DB', async () => {
      mockRedisGet.mockResolvedValue(null)
      mockRedisSetNX.mockResolvedValue(true)
      mockFindByEmail.mockResolvedValue(null)

      const service = new TraceAuthService()
      const result = await service.validateEmailWithCache('unknown@test.com', '127.0.0.1')

      expect(result).toBe(false)
      expect(mockRedisSetEx).toHaveBeenCalledWith(
        expect.anything(),
        300,
        'false'
      )
    })

    it('waits for lock and re-checks cache when lock not acquired', async () => {
      mockRedisGet
        .mockResolvedValueOnce(null)   // initial cache miss
        .mockResolvedValueOnce('true') // after lock wait, cache populated

      mockRedisSetNX.mockResolvedValue(false)
      mockRedisExists.mockResolvedValue(0)

      const service = new TraceAuthService()
      const result = await service.validateEmailWithCache('user@test.com', '127.0.0.1')

      expect(result).toBe(true)
      expect(mockFindByEmail).not.toHaveBeenCalled()
    })
  })

  describe('shutdown', () => {
    it('calls quit on Redis client when open', async () => {
      const service = new TraceAuthService()
      mockRedisGet.mockResolvedValue('true')
      await service.validateEmailWithCache('test@test.com', '127.0.0.1')

      await service.shutdown()
      expect(mockRedisQuit).toHaveBeenCalled()
    })
  })
})
