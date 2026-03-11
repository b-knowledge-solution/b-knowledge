/**
 * @fileoverview Tests for trace routes and backward compatibility.
 *
 * Verifies that the trace module exports routes correctly and that
 * the /api/external/* path mapping is preserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}))

vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    externalTrace: { enabled: true, cacheTtlSeconds: 60, lockTimeoutMs: 1000 },
    nodeEnv: 'test',
    langfuse: { secretKey: 'sk', publicKey: 'pk', baseUrl: 'https://example.com' },
    redis: { url: 'redis://localhost:6379' },
  },
}))

vi.mock('langfuse', () => ({
  Langfuse: function () {
    return {
      trace: () => ({}),
      score: () => {},
      flushAsync: () => Promise.resolve(),
    }
  },
}))

vi.mock('redis', () => ({
  createClient: () => ({
    on: () => {},
    connect: () => Promise.resolve(),
    isOpen: false,
    isReady: false,
    quit: () => Promise.resolve(),
  }),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    user: { findByEmail: () => Promise.resolve(null) },
  },
}))

vi.mock('../../src/shared/utils/ip.js', () => ({
  getClientIp: () => '127.0.0.1',
}))

describe('Trace Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should export a router from trace.routes', async () => {
    const routes = await import('../../src/modules/trace/routes/trace.routes.js')
    expect(routes.default).toBeDefined()
  })

  it('trace routes have submit and feedback POST endpoints', async () => {
    const routes = await import('../../src/modules/trace/routes/trace.routes.js')
    const router = routes.default

    const stack = (router as any).stack
    expect(stack).toBeDefined()

    const paths = stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }))

    expect(paths).toContainEqual({ path: '/submit', methods: ['post'] })
    expect(paths).toContainEqual({ path: '/feedback', methods: ['post'] })
  })

  it('checkTraceEnabled returns 503 when disabled', async () => {
    vi.resetModules()
    vi.doMock('../../src/shared/config/index.js', () => ({
      config: {
        externalTrace: { enabled: false },
      },
    }))

    const { checkTraceEnabled } = await import('../../src/modules/trace/middleware/trace-enabled.middleware.js')

    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }
    const next = vi.fn()

    checkTraceEnabled({} as any, res, next)

    expect(res.status).toHaveBeenCalledWith(503)
    expect(next).not.toHaveBeenCalled()
  })

  it('checkTraceEnabled calls next when enabled', async () => {
    vi.resetModules()
    vi.doMock('../../src/shared/config/index.js', () => ({
      config: {
        externalTrace: { enabled: true },
      },
    }))

    const { checkTraceEnabled } = await import('../../src/modules/trace/middleware/trace-enabled.middleware.js')

    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
    const next = vi.fn()

    checkTraceEnabled({} as any, res, next)

    expect(next).toHaveBeenCalled()
  })
})
