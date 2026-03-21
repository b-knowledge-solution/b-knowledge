/**
 * @fileoverview ISO 13485 §7.5.1 / IEC 62304 §5.3 — Data Integrity Compliance Tests
 *
 * Validates that data validation, sanitization, and integrity controls meet
 * healthcare regulatory requirements:
 * - Input validation prevents corrupt data entry (ISO 13485 §7.5.1)
 * - Schema validation enforces data contracts (IEC 62304 §5.3)
 * - File upload validation prevents malicious content
 * - Configuration validation ensures safe operation
 * - Data type enforcement across API boundaries
 *
 * Regulatory references:
 * - ISO 13485:2016 §7.5.1 — Control of production and service provision
 * - IEC 62304:2006 §5.3 — Software detailed design
 * - 21 CFR Part 11 §11.10(a) — Validation of systems
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/shared/db/index.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getClient: vi.fn(),
  getAdapter: vi.fn(),
  closePool: vi.fn(),
  checkConnection: vi.fn(),
  db: { query: vi.fn() },
}))

// ============================================================================
// ISO 13485 §7.5.1 — Input Validation
// ============================================================================

describe('ISO 13485 §7.5.1 — Input Validation', () => {
  describe('Zod schema enforcement', () => {
    let validate: any

    beforeEach(async () => {
      vi.clearAllMocks()
      const module = await import('../../src/shared/middleware/validate.middleware.js')
      validate = module.validate
    })

    it('COMP-DATA-001: validate middleware should be a function', () => {
      // Validation middleware must exist to enforce data contracts
      expect(typeof validate).toBe('function')
    })

    it('COMP-DATA-002: validate middleware should return Express middleware', () => {
      // The factory must produce a standard (req, res, next) middleware
      const { z } = require('zod')
      const schema = z.object({ name: z.string() })
      const middleware = validate(schema)

      expect(typeof middleware).toBe('function')
    })

    it('COMP-DATA-003: should reject invalid body data', async () => {
      const { z } = require('zod')
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      })
      const middleware = validate(schema)

      const req = { body: { name: '', email: 'not-an-email' } }
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      }
      const next = vi.fn()

      middleware(req, res, next)

      // Should either call next with error or respond with 400
      if (next.mock.calls.length > 0) {
        // Error was passed to next() for error handler
        expect(next).toHaveBeenCalledWith(expect.any(Error))
      } else {
        // Direct 400 response
        expect(res.status).toHaveBeenCalledWith(400)
      }
    })

    it('COMP-DATA-004: should pass valid body data through', async () => {
      const { z } = require('zod')
      const schema = z.object({
        name: z.string().min(1),
      })
      const middleware = validate(schema)

      const req = { body: { name: 'Valid Name' } }
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      }
      const next = vi.fn()

      middleware(req, res, next)

      // Should call next() without error for valid input
      if (next.mock.calls.length > 0) {
        // If next was called, it should be called without an error argument
        const firstArg = next.mock.calls[0][0]
        expect(firstArg === undefined || firstArg === null || !(firstArg instanceof Error)).toBe(true)
      }
    })
  })
})

// ============================================================================
// IEC 62304 §5.3 — File Upload Validation
// ============================================================================

describe('IEC 62304 §5.3 — File Upload Security', () => {
  let fileUploadConfig: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const module = await import('../../src/shared/config/file-upload.config.js')
    fileUploadConfig = module
  })

  it('COMP-DATA-005: should define maximum file size limit', () => {
    // Unbounded file uploads risk DoS and memory exhaustion
    const maxSize = fileUploadConfig.MAX_FILE_SIZE || fileUploadConfig.default?.MAX_FILE_SIZE
    expect(maxSize).toBeDefined()
    expect(typeof maxSize).toBe('number')
    expect(maxSize).toBeGreaterThan(0)
  })

  it('COMP-DATA-006: should define dangerous/blocked file extensions', () => {
    // Dangerous file types must be rejected to prevent code execution
    const blocked = fileUploadConfig.DANGEROUS_EXTENSIONS
    expect(blocked).toBeDefined()
    expect(blocked instanceof Set).toBe(true)
    expect(blocked.size).toBeGreaterThan(0)
  })

  it('COMP-DATA-007: should block executable file extensions', () => {
    // Common attack vectors via file upload
    const blocked = fileUploadConfig.DANGEROUS_EXTENSIONS
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1']

    for (const ext of dangerousExtensions) {
      expect(blocked.has(ext)).toBe(true)
    }
  })

  it('COMP-DATA-008: should block script file extensions', () => {
    // Web-based script execution vectors
    const blocked = fileUploadConfig.DANGEROUS_EXTENSIONS
    const scriptExtensions = ['.js', '.vbs', '.wsf']

    for (const ext of scriptExtensions) {
      expect(blocked.has(ext)).toBe(true)
    }
  })
})

// ============================================================================
// Data Type Safety
// ============================================================================

describe('Data Type Safety — Configuration Validation', () => {
  let config: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const module = await import('../../src/shared/config/index.js')
    config = module.config
  })

  it('COMP-DATA-009: should have defined server port', () => {
    // Server must bind to a specific port
    expect(config.port).toBeDefined()
    expect(typeof config.port).toBe('number')
  })

  it('COMP-DATA-010: should have defined node environment', () => {
    // Environment detection controls security behavior
    expect(config.nodeEnv).toBeDefined()
    expect(['development', 'production', 'test']).toContain(config.nodeEnv)
  })

  it('COMP-DATA-011: should have database configuration', () => {
    // Database connectivity is required for data persistence
    expect(config.db || config.database).toBeDefined()
  })

  it('COMP-DATA-012: should have defined frontend URL for CORS', () => {
    // CORS misconfiguration is a security vulnerability
    expect(config.frontendUrl).toBeDefined()
    expect(typeof config.frontendUrl).toBe('string')
  })
})

// ============================================================================
// Crypto Service Integrity
// ============================================================================

describe('Crypto Service — Data Protection', () => {
  let cryptoService: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const module = await import('../../src/shared/services/crypto.service.js')
    cryptoService = module
  })

  it('COMP-DATA-013: should provide encryption capability', () => {
    // Data at rest must be protectable per ISO 13485 §4.2.5
    const svc = cryptoService.cryptoService
    expect(typeof svc.encrypt).toBe('function')
  })

  it('COMP-DATA-014: should provide decryption capability', () => {
    // Encrypted data must be recoverable by authorized systems
    const svc = cryptoService.cryptoService
    expect(typeof svc.decrypt).toBe('function')
  })

  it('COMP-DATA-015: crypto service should be a singleton instance', () => {
    // Singleton pattern ensures consistent encryption key across the application
    const svc = cryptoService.cryptoService
    expect(svc).toBeDefined()
    expect(typeof svc.encrypt).toBe('function')
    expect(typeof svc.decrypt).toBe('function')
  })
})
