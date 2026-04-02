/**
 * @fileoverview Unit tests for the MinIO singleton service.
 *
 * Validates that MinioSingleton creates a single Minio.Client instance
 * configured from the centralized config, and returns the same instance
 * on repeated calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock() calls
// ---------------------------------------------------------------------------

const mockMinioClient = vi.hoisted(() => ({
  putObject: vi.fn(),
  getObject: vi.fn(),
  removeObject: vi.fn(),
  presignedGetObject: vi.fn(),
  presignedPutObject: vi.fn(),
  makeBucket: vi.fn(),
  bucketExists: vi.fn(),
  listBuckets: vi.fn(),
  statObject: vi.fn(),
}))

const mockMinioConstructor = vi.hoisted(() =>
  vi.fn().mockReturnValue(mockMinioClient)
)

const mockConfig = vi.hoisted(() => ({
  s3: {
    endpoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minioadmin',
    secretKey: 'minioadmin',
    bucket: 'knowledge',
  },
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('minio', () => ({
  Client: mockMinioConstructor,
}))

vi.mock('../../../src/shared/config/index.js', () => ({
  config: mockConfig,
}))

vi.mock('../../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MinioService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('singleton initialization', () => {
    /**
     * @description Should create a Minio.Client with config values from the centralized config
     */
    it('should create Minio.Client with correct config values', async () => {
      // Reset modules to re-trigger singleton creation
      vi.resetModules()

      const { minioClient } = await import(
        '../../../src/shared/services/minio.service.js'
      )

      // Verify the Minio.Client constructor was called with config values
      expect(mockMinioConstructor).toHaveBeenCalledWith({
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
      })

      // Verify the exported client is the mock instance
      expect(minioClient).toBe(mockMinioClient)
    })

    /**
     * @description Should return the same singleton instance on repeated imports
     */
    it('should return the same singleton instance on repeated imports', async () => {
      vi.resetModules()

      const mod1 = await import(
        '../../../src/shared/services/minio.service.js'
      )
      const mod2 = await import(
        '../../../src/shared/services/minio.service.js'
      )

      // Both imports should yield the exact same client reference
      expect(mod1.minioClient).toBe(mod2.minioClient)
    })

    /**
     * @description Should only call the Minio.Client constructor once across multiple imports
     */
    it('should only instantiate Minio.Client once (singleton)', async () => {
      vi.resetModules()

      await import('../../../src/shared/services/minio.service.js')
      await import('../../../src/shared/services/minio.service.js')

      // Constructor should be called exactly once due to singleton pattern
      expect(mockMinioConstructor).toHaveBeenCalledTimes(1)
    })
  })

  describe('config mapping', () => {
    /**
     * @description Should use SSL when config.s3.useSSL is true
     */
    it('should pass useSSL: true when config says so', async () => {
      vi.resetModules()

      // Override config to enable SSL
      mockConfig.s3.useSSL = true

      await import('../../../src/shared/services/minio.service.js')

      expect(mockMinioConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ useSSL: true })
      )

      // Restore default for other tests
      mockConfig.s3.useSSL = false
    })

    /**
     * @description Should forward custom port from config
     */
    it('should forward custom port from config', async () => {
      vi.resetModules()

      // Override port to a non-default value
      mockConfig.s3.port = 9443

      await import('../../../src/shared/services/minio.service.js')

      expect(mockMinioConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ port: 9443 })
      )

      // Restore default
      mockConfig.s3.port = 9000
    })
  })
})
