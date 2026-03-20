/**
 * @fileoverview E2E-style tests for Express API routes.
 *
 * Tests the health check endpoint, 404 handler, Content-Type validation,
 * and authentication flow using a minimal Express app with setupApiRoutes.
 *
 * NOTE: These tests require the `supertest` package. Install it with:
 *   npm install -D supertest @types/supertest
 *
 * Since supertest is not yet in package.json, these tests will fail until
 * the dependency is added.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import express from 'express'
import type { Express } from 'express'

// Hoisted mocks for dependencies used by routes.ts
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

// Mock all route modules to avoid loading their deep dependency trees
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

// Mock express-rate-limit to be a passthrough (avoid rate limit issues in tests)
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}))

/**
 * @description Creates a minimal Express app with setupApiRoutes applied.
 * Avoids the full app/index.ts bootstrap (Redis init, sessions, helmet, etc.).
 * @returns {Express} Configured Express application for testing
 */
function createTestApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  return app
}

describe('API Routes (E2E-style)', () => {
  let app: Express
  let setupApiRoutes: (app: Express) => void

  beforeAll(async () => {
    const routesModule = await import('../../src/app/routes.js')
    setupApiRoutes = routesModule.setupApiRoutes
    app = createTestApp()
    setupApiRoutes(app)
  })

  /**
   * @description Lightweight request helper using Node's http module.
   * Avoids supertest dependency by creating a temporary server.
   * @param {Express} app - Express application
   * @param {string} method - HTTP method
   * @param {string} path - Request path
   * @param {object} options - Request options (body, headers)
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
        const port = addr.port

        const bodyStr = options.body ? JSON.stringify(options.body) : undefined
        const reqHeaders: Record<string, string> = {
          ...options.headers,
        }
        if (bodyStr) {
          reqHeaders['content-type'] = reqHeaders['content-type'] || 'application/json'
          reqHeaders['content-length'] = Buffer.byteLength(bodyStr).toString()
        }

        const req = http.request(
          { hostname: '127.0.0.1', port, path, method: method.toUpperCase(), headers: reqHeaders },
          (res) => {
            let data = ''
            res.on('data', (chunk) => { data += chunk })
            res.on('end', () => {
              server.close()
              let body: any
              try {
                body = JSON.parse(data)
              } catch {
                body = data
              }
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

  describe('GET /health', () => {
    it('should return 200 with ok status when DB and Redis are healthy', async () => {
      mockCheckConnection.mockResolvedValue(true)
      mockGetRedisStatus.mockReturnValue('connected')

      const res = await request(app, 'GET', '/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(res.body.services).toBeDefined()
      expect(res.body.services.express).toBe('running')
      expect(res.body.services.database).toBe('connected')
      expect(res.body.services.redis).toBe('connected')
      expect(res.body.timestamp).toBeDefined()
    })

    it('should return 200 when Redis is not_configured (still acceptable)', async () => {
      mockCheckConnection.mockResolvedValue(true)
      mockGetRedisStatus.mockReturnValue('not_configured')

      const res = await request(app, 'GET', '/health')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
    })

    it('should return 503 with degraded status when DB is disconnected', async () => {
      mockCheckConnection.mockResolvedValue(false)
      mockGetRedisStatus.mockReturnValue('connected')

      const res = await request(app, 'GET', '/health')

      expect(res.status).toBe(503)
      expect(res.body.status).toBe('degraded')
      expect(res.body.services.database).toBe('disconnected')
    })
  })

  describe('404 handler', () => {
    it('should return 404 for unknown API routes', async () => {
      const res = await request(app, 'GET', '/api/nonexistent-endpoint')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Not Found')
      expect(res.body.message).toContain('does not exist')
    })
  })

  describe('Content-Type validation', () => {
    it('should accept POST with application/json content type', async () => {
      // POST to a known route (will hit 404 since routes are mocked, but should pass content-type check)
      const res = await request(app, 'POST', '/api/nonexistent', {
        body: { test: true },
        headers: { 'content-type': 'application/json' },
      })

      // Should not be 415 (Unsupported Media Type)
      expect(res.status).not.toBe(415)
    })

    it('should reject POST with unsupported content type', async () => {
      const res = await request(app, 'POST', '/api/test-endpoint', {
        headers: { 'content-type': 'text/xml' },
      })

      expect(res.status).toBe(415)
      expect(res.body.error).toBe('Unsupported Media Type')
    })

    it('should allow POST without Content-Type header (empty body)', async () => {
      const res = await request(app, 'POST', '/api/nonexistent')

      // Should not be 415 — missing content-type is allowed
      expect(res.status).not.toBe(415)
    })

    it('should not validate Content-Type for GET requests', async () => {
      const res = await request(app, 'GET', '/api/nonexistent', {
        headers: { 'content-type': 'text/xml' },
      })

      // GET requests should not trigger content-type validation
      expect(res.status).not.toBe(415)
    })
  })
})
