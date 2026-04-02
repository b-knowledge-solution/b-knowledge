/**
 * @fileoverview Unit tests for preview service.
 *
 * Tests file caching, TTL expiration, MinIO download, and error handling
 * with mocked file system and MinIO client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mocks for fs operations
const mockFsPromises = vi.hoisted(() => ({
  access: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  utimes: vi.fn(),
}))

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}))

const mockMinioClient = vi.hoisted(() => ({
  fGetObject: vi.fn(),
}))

const mockConfig = vi.hoisted(() => ({
  tempCachePath: '/tmp/preview-cache',
  tempFileTTL: 604800000, // 7 days in ms
}))

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

// Mock file system modules
vi.mock('fs', () => ({
  default: mockFs,
  existsSync: mockFs.existsSync,
  mkdirSync: mockFs.mkdirSync,
}))

vi.mock('fs/promises', () => ({
  default: mockFsPromises,
  access: mockFsPromises.access,
  stat: mockFsPromises.stat,
  unlink: mockFsPromises.unlink,
  utimes: mockFsPromises.utimes,
}))

vi.mock('fs', async () => {
  return {
    default: mockFs,
    ...mockFs,
    constants: { F_OK: 0 },
  }
})

// Mock MinIO service (dynamically imported in the service)
vi.mock('../../src/shared/services/minio.service.js', () => ({
  minioClient: mockMinioClient,
}))

// Mock config
vi.mock('../../src/shared/config/index.js', () => ({
  config: mockConfig,
}))

// Mock ModelFactory
vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {},
}))

// Mock logger
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

describe('PreviewService', () => {
  let PreviewService: any
  let previewService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Default: temp dir already exists
    mockFs.existsSync.mockReturnValue(true)

    // Re-import to get fresh module with mocks
    const module = await import('../../src/modules/preview/preview.service.js')
    PreviewService = module.PreviewService
    previewService = new PreviewService()
  })

  describe('generatePreview', () => {
    /**
     * @description Should return cached file path when cache is fresh (within TTL)
     */
    it('should return cached file path when cache is still valid', async () => {
      // Simulate cached file exists and is within TTL
      mockFsPromises.access.mockResolvedValue(undefined)
      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 1000, // 1 second ago, well within 7-day TTL
      })

      const result = await previewService.generatePreview('my-bucket', 'docs/report.pdf')

      // Should not attempt to download from MinIO
      expect(mockMinioClient.fGetObject).not.toHaveBeenCalled()
      // Should return a path containing the bucket and sanitized filename
      expect(result).toContain('my-bucket')
      expect(result).toContain('docs_report.pdf')
    })

    /**
     * @description Should download from MinIO when cached file has expired past TTL
     */
    it('should download from MinIO when cache is expired', async () => {
      // Simulate cached file exists but is older than TTL
      mockFsPromises.access.mockResolvedValue(undefined)
      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 700000000, // ~8 days ago, past 7-day TTL
      })
      // Expired file deletion succeeds
      mockFsPromises.unlink.mockResolvedValue(undefined)
      // MinIO download succeeds
      mockMinioClient.fGetObject.mockResolvedValue(undefined)
      // Timestamp update succeeds
      mockFsPromises.utimes.mockResolvedValue(undefined)

      const result = await previewService.generatePreview('bucket-1', 'file.txt')

      // Should delete expired cache file
      expect(mockFsPromises.unlink).toHaveBeenCalled()
      // Should download fresh copy from MinIO
      expect(mockMinioClient.fGetObject).toHaveBeenCalledWith(
        'bucket-1',
        'file.txt',
        expect.stringContaining('bucket-1')
      )
      // Should update file timestamps for TTL tracking
      expect(mockFsPromises.utimes).toHaveBeenCalled()
      expect(result).toContain('bucket-1')
    })

    /**
     * @description Should download from MinIO when file is not cached at all
     */
    it('should download from MinIO when file is not in cache', async () => {
      // Simulate file not found in cache (access throws)
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'))
      // MinIO download succeeds
      mockMinioClient.fGetObject.mockResolvedValue(undefined)
      mockFsPromises.utimes.mockResolvedValue(undefined)

      const result = await previewService.generatePreview('bucket-2', 'new-file.pdf')

      // Should download from MinIO since there is no cached file
      expect(mockMinioClient.fGetObject).toHaveBeenCalledWith(
        'bucket-2',
        'new-file.pdf',
        expect.any(String)
      )
      expect(result).toContain('bucket-2')
    })

    /**
     * @description Should throw error when MinIO download fails
     */
    it('should throw error when MinIO download fails', async () => {
      // Simulate cache miss
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'))
      // MinIO download fails
      mockMinioClient.fGetObject.mockRejectedValue(new Error('MinIO connection refused'))

      await expect(
        previewService.generatePreview('bucket-3', 'missing.pdf')
      ).rejects.toThrow('MinIO connection refused')

      // Should log the download error
      expect(mockLog.error).toHaveBeenCalledWith(
        'Failed to download file for preview',
        expect.objectContaining({
          bucketName: 'bucket-3',
          fileName: 'missing.pdf',
        })
      )
    })

    /**
     * @description Should sanitize special characters in file names to prevent path traversal
     */
    it('should sanitize special characters in file names', async () => {
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'))
      mockMinioClient.fGetObject.mockResolvedValue(undefined)
      mockFsPromises.utimes.mockResolvedValue(undefined)

      const result = await previewService.generatePreview('bucket', 'path/to/file name (1).pdf')

      // Special characters (spaces, parentheses) should be replaced with underscores
      expect(result).not.toContain(' ')
      expect(result).not.toContain('(')
      expect(result).not.toContain(')')
    })

    /**
     * @description Should handle failure to delete expired cache file gracefully
     */
    it('should continue when expired cache file deletion fails', async () => {
      // Simulate cached file exists but is expired
      mockFsPromises.access.mockResolvedValue(undefined)
      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 700000000, // past TTL
      })
      // Deletion of expired file fails (file locked or already deleted)
      mockFsPromises.unlink.mockRejectedValue(new Error('EBUSY'))
      // MinIO download still succeeds
      mockMinioClient.fGetObject.mockResolvedValue(undefined)
      mockFsPromises.utimes.mockResolvedValue(undefined)

      // Should not throw despite unlink failure
      const result = await previewService.generatePreview('bucket', 'file.pdf')

      // Should log the unlink error but continue
      expect(mockLog.error).toHaveBeenCalledWith(
        'Failed to delete expired cache file',
        expect.objectContaining({ localFilePath: expect.any(String) })
      )
      // Should still return a valid file path
      expect(result).toContain('bucket')
    })

    /**
     * @description Should log cache hit when serving from cache
     */
    it('should log debug message on cache hit', async () => {
      mockFsPromises.access.mockResolvedValue(undefined)
      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 1000, // fresh cache
      })

      await previewService.generatePreview('bucket', 'cached.pdf')

      // Should log cache hit at debug level
      expect(mockLog.debug).toHaveBeenCalledWith(
        'Preview cache hit',
        expect.objectContaining({
          bucketName: 'bucket',
          fileName: 'cached.pdf',
        })
      )
    })

    /**
     * @description Should log success message after downloading from MinIO
     */
    it('should log info message on successful download', async () => {
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'))
      mockMinioClient.fGetObject.mockResolvedValue(undefined)
      mockFsPromises.utimes.mockResolvedValue(undefined)

      await previewService.generatePreview('bucket', 'new.pdf')

      // Should log successful file caching
      expect(mockLog.info).toHaveBeenCalledWith(
        'File cached successfully',
        expect.objectContaining({
          bucketName: 'bucket',
          fileName: 'new.pdf',
        })
      )
    })

    /**
     * @description Should replace forward slashes in filenames with underscores in local path
     */
    it('should replace slashes in nested paths for local filename', async () => {
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'))
      mockMinioClient.fGetObject.mockResolvedValue(undefined)
      mockFsPromises.utimes.mockResolvedValue(undefined)

      const result = await previewService.generatePreview('bucket', 'a/b/c/file.pdf')

      // Forward slashes should be replaced with underscores in the local filename
      expect(result).toContain('a_b_c_file.pdf')
    })
  })
})
