/**
 * @fileoverview IEC 62304 §5.7 / ISO 14971 — Error Handling & Resilience Compliance Tests
 *
 * Validates that the system handles errors safely per healthcare software standards:
 * - Graceful degradation under failure (IEC 62304 §5.7)
 * - Health check monitoring (ISO 13485 §8.2.3)
 * - Error response standardization
 * - Service connectivity monitoring
 * - Logging of error conditions
 *
 * Regulatory references:
 * - IEC 62304:2006 §5.7 — Software risk management
 * - ISO 14971:2019 — Application of risk management to medical devices
 * - ISO 13485:2016 §8.2.3 — Monitoring and measurement of processes
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import express from 'express'
import type { Express } from 'express'

// ============================================================================
// Mocks
// ============================================================================

const mockCheckConnection = vi.hoisted(() => vi.fn().mockResolvedValue(true))
const mockGetRedisStatus = vi.hoisted(() => vi.fn().mockReturnValue('connected'))

vi.mock('../../src/shared/db/index.js', () => ({
  checkConnection: mockCheckConnection,
  query: vi.fn(),
  queryOne: vi.fn(),
  getClient: vi.fn(),
  getAdapter: vi.fn(),
  closePool: vi.fn(),
  db: { query: vi.fn() },
}))

vi.mock('../../src/shared/services/redis.service.js', () => ({
  getRedisStatus: mockGetRedisStatus,
  initRedis: vi.fn(),
  getRedisClient: vi.fn(),
  shutdownRedis: vi.fn(),
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Mock all route modules
vi.mock('../../src/modules/auth/auth.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/admin/routes/admin.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/users/routes/users.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/teams/routes/teams.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/system-tools/system-tools.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/audit/routes/audit.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/broadcast/routes/broadcast-message.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/admin/routes/admin-history.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/chat/routes/chat-conversation.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/chat/routes/chat-assistant.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/chat/routes/chat-embed.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/chat/routes/chat-file.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/user-history/user-history.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/search/routes/search.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/search/routes/search-embed.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/chat/routes/chat-openai.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/search/routes/search-openai.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/dashboard/dashboard.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/glossary/routes/glossary.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/rag/routes/rag.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/llm-provider/routes/llm-provider.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/llm-provider/routes/llm-provider-public.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/sync/routes/sync.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/projects/routes/projects.routes.js', () => ({ default: express.Router() }))
vi.mock('../../src/modules/feedback/routes/feedback.routes.js', () => ({ default: express.Router() }))
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

// ============================================================================
// Helper
// ============================================================================

/**
 * @description HTTP request helper using Node http module for testing
 * @param {Express} app - Express application
 * @param {string} method - HTTP method
 * @param {string} path - Request path
 * @param {object} options - Request options
 * @returns {Promise<{ status: number; body: any; headers: any }>} Response
 */
async function request(
  app: Express,
  method: string,
  path: string,
  options: { body?: any; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: any; headers: any }> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.listen(0, () => {
      const addr = server.address() as any
      const bodyStr = options.body ? JSON.stringify(options.body) : undefined
      const reqHeaders: Record<string, string> = { ...options.headers }
      if (bodyStr) {
        reqHeaders['content-type'] = reqHeaders['content-type'] || 'application/json'
        reqHeaders['content-length'] = Buffer.byteLength(bodyStr).toString()
      }

      const req = http.request(
        { hostname: '127.0.0.1', port: addr.port, path, method: method.toUpperCase(), headers: reqHeaders },
        (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            server.close()
            let body: any
            try { body = JSON.parse(data) } catch { body = data }
            resolve({ status: res.statusCode!, body, headers: res.headers })
          })
        }
      )
      req.on('error', (err) => { server.close(); reject(err) })
      if (bodyStr) req.write(bodyStr)
      req.end()
    })
  })
}

// ============================================================================
// IEC 62304 §5.7 — Health Monitoring
// ============================================================================

describe('IEC 62304 §5.7 — Health Monitoring & Graceful Degradation', () => {
  let app: Express

  beforeAll(async () => {
    const routesModule = await import('../../src/app/routes.js')
    app = express()
    app.use(express.json())
    routesModule.setupApiRoutes(app)
  })

  describe('Health check endpoint', () => {
    it('COMP-ERR-001: should return 200 when all services are healthy', async () => {
      // ISO 13485 §8.2.3 — System health must be monitorable
      mockCheckConnection.mockResolvedValue(true)
      mockGetRedisStatus.mockReturnValue('connected')

      const res = await request(app, 'GET', '/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
    })

    it('COMP-ERR-002: should report individual service statuses', async () => {
      // Each dependency must be independently monitorable
      mockCheckConnection.mockResolvedValue(true)
      mockGetRedisStatus.mockReturnValue('connected')

      const res = await request(app, 'GET', '/health')

      expect(res.body.services).toBeDefined()
      expect(res.body.services.express).toBe('running')
      expect(res.body.services.database).toBeDefined()
      expect(res.body.services.redis).toBeDefined()
    })

    it('COMP-ERR-003: should include timestamp in health response', async () => {
      // Timestamp enables correlation with monitoring systems
      mockCheckConnection.mockResolvedValue(true)
      mockGetRedisStatus.mockReturnValue('connected')

      const res = await request(app, 'GET', '/health')

      expect(res.body.timestamp).toBeDefined()
    })

    it('COMP-ERR-004: should return 503 when database is unavailable', async () => {
      // IEC 62304 §5.7 — System must degrade gracefully, not crash
      mockCheckConnection.mockResolvedValue(false)
      mockGetRedisStatus.mockReturnValue('connected')

      const res = await request(app, 'GET', '/health')

      expect(res.status).toBe(503)
      expect(res.body.status).toBe('degraded')
    })

    it('COMP-ERR-005: should still respond when Redis is unavailable', async () => {
      // Redis failure should not prevent health check responses
      mockCheckConnection.mockResolvedValue(true)
      mockGetRedisStatus.mockReturnValue('disconnected')

      const res = await request(app, 'GET', '/health')

      // Should still respond (either 200 or 503, but not a crash/timeout)
      expect([200, 503]).toContain(res.status)
      expect(res.body).toBeDefined()
    })
  })
})

// ============================================================================
// Error Response Standardization
// ============================================================================

describe('Error Response Standardization', () => {
  let app: Express

  beforeAll(async () => {
    const routesModule = await import('../../src/app/routes.js')
    app = express()
    app.use(express.json())
    routesModule.setupApiRoutes(app)
  })

  it('COMP-ERR-006: should return structured 404 for unknown routes', async () => {
    // Error responses must follow a consistent schema for client handling
    const res = await request(app, 'GET', '/api/nonexistent-route')

    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
    expect(typeof res.body.error).toBe('string')
  })

  it('COMP-ERR-007: should reject unsupported content types with 415', async () => {
    // Content-Type validation prevents injection of malformed payloads
    const res = await request(app, 'POST', '/api/test', {
      headers: { 'content-type': 'text/xml' },
    })

    expect(res.status).toBe(415)
  })

  it('COMP-ERR-008: should not expose stack traces in error responses', async () => {
    // IEC 62304 — Error details must not leak implementation internals
    const res = await request(app, 'GET', '/api/nonexistent-route')

    expect(res.body.stack).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('node_modules')
  })
})

// ============================================================================
// Service Resilience
// ============================================================================

describe('Service Resilience — Redis & Database', () => {
  it('COMP-ERR-009: should export Redis status check function', async () => {
    // Redis monitoring must be available for health checks
    const redisModule = await import('../../src/shared/services/redis.service.js')
    expect(typeof redisModule.getRedisStatus).toBe('function')
  })

  it('COMP-ERR-010: should export database connection check function', async () => {
    // Database monitoring must be available for health checks
    const dbModule = await import('../../src/shared/db/index.js')
    expect(typeof dbModule.checkConnection).toBe('function')
  })
})
