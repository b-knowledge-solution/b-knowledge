/**
 * @fileoverview Unit tests for external auth middleware.
 *
 * Tests requireApiKey Bearer token validation and requireScope scope checking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse, createMockNext } from '../setup.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockValidateApiKey = vi.hoisted(() => vi.fn())

vi.mock('../../src/modules/external/services/api-key.service.js', () => ({
  apiKeyService: {
    validateApiKey: mockValidateApiKey,
  },
}))

import { requireApiKey, requireScope } from '../../src/shared/middleware/external-auth.middleware.js'

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
    key_hash: 'hash123',
    scopes: ['chat', 'search', 'retrieval'],
    is_active: true,
    last_used_at: null,
    expires_at: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('requireApiKey middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no Authorization header is provided', async () => {
    const req = createMockRequest({ headers: {} })
    const res = createMockResponse()
    const next = createMockNext()

    await requireApiKey(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'invalid_api_key',
        }),
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header does not start with Bearer', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    })
    const res = createMockResponse()
    const next = createMockNext()

    await requireApiKey(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 401 when API key is invalid', async () => {
    mockValidateApiKey.mockResolvedValue(undefined)

    const req = createMockRequest({
      headers: { authorization: 'Bearer bk-invalidkey' },
    })
    const res = createMockResponse()
    const next = createMockNext()

    await requireApiKey(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: 'Invalid or expired API key.',
        }),
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('attaches apiKey to request and calls next for valid key', async () => {
    const mockKey = buildMockApiKey()
    mockValidateApiKey.mockResolvedValue(mockKey)

    const req = createMockRequest({
      headers: { authorization: 'Bearer bk-validkey12345' },
    })
    const res = createMockResponse()
    const next = createMockNext()

    await requireApiKey(req, res, next)

    expect(req.apiKey).toBe(mockKey)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('extracts the raw key correctly from Bearer token', async () => {
    mockValidateApiKey.mockResolvedValue(buildMockApiKey())

    const rawKey = 'bk-abc123def456ghi789jkl012mno345pqr678st'
    const req = createMockRequest({
      headers: { authorization: `Bearer ${rawKey}` },
    })
    const res = createMockResponse()
    const next = createMockNext()

    await requireApiKey(req, res, next)

    expect(mockValidateApiKey).toHaveBeenCalledWith(rawKey)
  })
})

describe('requireScope middleware', () => {
  it('calls next when key has the required scope', () => {
    const middleware = requireScope('chat')
    const req = createMockRequest()
    req.apiKey = buildMockApiKey({ scopes: ['chat', 'search'] })
    const res = createMockResponse()
    const next = createMockNext()

    middleware(req, res, next)

    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('returns 403 when key lacks the required scope', () => {
    const middleware = requireScope('retrieval')
    const req = createMockRequest()
    req.apiKey = buildMockApiKey({ scopes: ['chat'] })
    const res = createMockResponse()
    const next = createMockNext()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'insufficient_scope',
        }),
      })
    )
    expect(next).not.toHaveBeenCalled()
  })

  it('returns 403 when apiKey is undefined', () => {
    const middleware = requireScope('chat')
    const req = createMockRequest()
    // No apiKey attached
    const res = createMockResponse()
    const next = createMockNext()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
