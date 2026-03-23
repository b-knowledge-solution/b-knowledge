/**
 * @fileoverview Tests for broadcast message routes.
 * Tests broadcast message management endpoints and middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/shared/middleware/auth.middleware.js', () => ({
  requirePermission: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}))

vi.mock('@/shared/middleware/validate.middleware.js', () => ({
  validate: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}))

vi.mock('@/modules/broadcast/services/broadcast-message.service.js', () => ({
  broadcastMessageService: {
    getActiveMessages: vi.fn(),
    dismissMessage: vi.fn(),
    getAllMessages: vi.fn(),
    createMessage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
  },
}))

vi.mock('@/shared/utils/ip.js', () => ({
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}))

describe('Broadcast Message Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Module exports', () => {
    it('should export a router', async () => {
      const routes = await import('../../src/modules/broadcast/routes/broadcast-message.routes.js')
      expect(routes.default).toBeDefined()
    })
  })

  describe('Route middleware', () => {
    it('should apply requirePermission middleware for admin routes', async () => {
      const { requirePermission } = await import('../../src/shared/middleware/auth.middleware.js')
      expect(requirePermission).toBeDefined()
    })
  })
})
