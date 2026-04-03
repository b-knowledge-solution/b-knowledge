/**
 * @fileoverview Unit tests for ConverterQueueService — Redis job creation for the Python converter worker.
 *
 * Tests cover:
 * - createJob: Redis key creation, field values, pipeline execution, multi-file jobs
 * - triggerManualConversion: manual trigger flag in Redis
 * - getJobStatus: job hash retrieval and null handling
 * - getJobFiles: file set enumeration and empty set handling
 * - Office file detection: isOfficeFile static helper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockUuid = vi.hoisted(() => {
  let counter = 0
  return vi.fn(() => `uuid${++counter}`)
})

const mockRedisMulti = vi.hoisted(() => ({
  hSet: vi.fn().mockReturnThis(),
  sAdd: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
}))

const mockRedisClient = vi.hoisted(() => ({
  multi: vi.fn(() => mockRedisMulti),
  set: vi.fn().mockResolvedValue('OK'),
  hGetAll: vi.fn().mockResolvedValue({}),
  sMembers: vi.fn().mockResolvedValue([]),
}))

const mockGetRedisClient = vi.hoisted(() => vi.fn(() => mockRedisClient))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/shared/services/redis.service.js', () => ({
  getRedisClient: mockGetRedisClient,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/shared/utils/uuid.js', () => ({
  getUuid: mockUuid,
}))

// Required by rag-document.service.ts (for isOfficeFile tests)
vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    ragDocument: { create: vi.fn(), update: vi.fn(), findById: vi.fn(), beginParse: vi.fn(), softDelete: vi.fn(), findByDatasetId: vi.fn(), findByDatasetIdAsc: vi.fn() },
    knowledgebase: { findById: vi.fn(), create: vi.fn(), update: vi.fn(), softDelete: vi.fn() },
    ragFile: { createFile: vi.fn(), createFile2Document: vi.fn() },
    ragTask: { create: vi.fn(), findById: vi.fn(), getOverviewStats: vi.fn() },
  },
}))

vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: { deleteChunksByDocId: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Import under test (after all mocks)
// ---------------------------------------------------------------------------

import { ConverterQueueService } from '../../src/modules/rag/services/converter-queue.service'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConverterQueueService', () => {
  let service: ConverterQueueService

  beforeEach(() => {
    vi.clearAllMocks()
    // Reset UUID counter for deterministic IDs per test
    let counter = 0
    mockUuid.mockImplementation(() => `uuid${++counter}`)
    // Restore Redis mock after clearAllMocks resets it
    mockGetRedisClient.mockReturnValue(mockRedisClient)
    mockRedisClient.multi.mockReturnValue(mockRedisMulti)
    mockRedisMulti.hSet.mockReturnThis()
    mockRedisMulti.sAdd.mockReturnThis()
    mockRedisMulti.set.mockReturnThis()
    mockRedisMulti.exec.mockResolvedValue([])
    mockRedisClient.set.mockResolvedValue('OK')
    mockRedisClient.hGetAll.mockResolvedValue({})
    mockRedisClient.sMembers.mockResolvedValue([])
    service = new ConverterQueueService()
  })

  // -----------------------------------------------------------------------
  // createJob
  // -----------------------------------------------------------------------

  describe('createJob', () => {
    const baseInput = {
      datasetId: 'ds-001',
      versionId: 'ver-001',
      projectId: 'proj-001',
      categoryId: 'cat-001',
      files: [
        { fileName: 'report.docx', filePath: 'proj-001/cat-001/ver-001/report.docx' },
      ],
    }

    it('creates a job hash with correct fields in Redis', async () => {
      const jobId = await service.createJob(baseInput)

      // First UUID call produces the job ID
      expect(jobId).toBe('uuid1')

      // Verify job hash was created via pipeline
      const hSetCalls = mockRedisMulti.hSet.mock.calls
      const jobHashCall = hSetCalls[0]
      expect(jobHashCall[0]).toBe('converter:vjob:uuid1')

      // Verify job metadata fields
      const jobData = jobHashCall[1]
      expect(jobData.id).toBe('uuid1')
      expect(jobData.datasetId).toBe('ds-001')
      expect(jobData.versionId).toBe('ver-001')
      expect(jobData.projectId).toBe('proj-001')
      expect(jobData.categoryId).toBe('cat-001')
      expect(jobData.status).toBe('converting')
      expect(jobData.fileCount).toBe('1')
      expect(jobData.completedCount).toBe('0')
      expect(jobData.failedCount).toBe('0')
    })

    it('adds job to converting status set for worker pickup', async () => {
      await service.createJob(baseInput)

      const sAddCalls = mockRedisMulti.sAdd.mock.calls
      // First sAdd: status set
      expect(sAddCalls[0][0]).toBe('converter:vjob:status:converting')
      expect(sAddCalls[0][1]).toBe('uuid1')
    })

    it('sets active job pointer for the version', async () => {
      await service.createJob(baseInput)

      const setCalls = mockRedisMulti.set.mock.calls
      expect(setCalls[0][0]).toBe('converter:version:active_job:ver-001')
      expect(setCalls[0][1]).toBe('uuid1')
    })

    it('creates per-file tracking records with pending status', async () => {
      await service.createJob(baseInput)

      const hSetCalls = mockRedisMulti.hSet.mock.calls
      // Second hSet call = first file record (uuid2)
      const fileHashCall = hSetCalls[1]
      expect(fileHashCall[0]).toBe('converter:file:uuid2')

      const fileData = fileHashCall[1]
      expect(fileData.id).toBe('uuid2')
      expect(fileData.jobId).toBe('uuid1')
      expect(fileData.fileName).toBe('report.docx')
      expect(fileData.filePath).toBe('proj-001/cat-001/ver-001/report.docx')
      expect(fileData.status).toBe('pending')
    })

    it('adds file IDs to the job file set', async () => {
      await service.createJob(baseInput)

      const sAddCalls = mockRedisMulti.sAdd.mock.calls
      // Second sAdd: file set
      expect(sAddCalls[1][0]).toBe('converter:files:uuid1')
      expect(sAddCalls[1][1]).toBe('uuid2')
    })

    it('handles multiple files in a single job', async () => {
      const multiFileInput = {
        ...baseInput,
        files: [
          { fileName: 'doc1.docx', filePath: 'p/c/v/doc1.docx' },
          { fileName: 'sheet.xlsx', filePath: 'p/c/v/sheet.xlsx' },
          { fileName: 'slides.pptx', filePath: 'p/c/v/slides.pptx' },
        ],
      }

      await service.createJob(multiFileInput)

      // Job hash fileCount should be 3
      const jobData = mockRedisMulti.hSet.mock.calls[0][1]
      expect(jobData.fileCount).toBe('3')

      // 3 file hashes created (uuid2, uuid3, uuid4)
      const hSetCalls = mockRedisMulti.hSet.mock.calls
      expect(hSetCalls).toHaveLength(4) // 1 job + 3 files

      // 3 file IDs added to file set
      const fileSetAdds = mockRedisMulti.sAdd.mock.calls.filter(
        (call: string[]) => call[0] === 'converter:files:uuid1'
      )
      expect(fileSetAdds).toHaveLength(3)
    })

    it('serializes optional config as JSON string in job hash', async () => {
      const inputWithConfig = {
        ...baseInput,
        config: {
          post_processing: { trim_whitespace: { enabled: true, margin: 5 } },
          suffix: { word: '_d' },
        },
      }

      await service.createJob(inputWithConfig)

      const jobData = mockRedisMulti.hSet.mock.calls[0][1]
      expect(jobData.config).toBeDefined()
      const parsed = JSON.parse(jobData.config)
      expect(parsed.post_processing.trim_whitespace.enabled).toBe(true)
      expect(parsed.suffix.word).toBe('_d')
    })

    it('omits config field when not provided', async () => {
      await service.createJob(baseInput)

      const jobData = mockRedisMulti.hSet.mock.calls[0][1]
      expect(jobData.config).toBeUndefined()
    })

    it('executes all commands in a single pipeline', async () => {
      await service.createJob(baseInput)

      expect(mockRedisClient.multi).toHaveBeenCalledTimes(1)
      expect(mockRedisMulti.exec).toHaveBeenCalledTimes(1)
    })

    it('throws when Redis is not available', async () => {
      mockGetRedisClient.mockReturnValue(null)

      await expect(service.createJob(baseInput)).rejects.toThrow('Redis not available')
    })
  })

  // -----------------------------------------------------------------------
  // triggerManualConversion
  // -----------------------------------------------------------------------

  describe('triggerManualConversion', () => {
    it('sets the manual trigger flag to "1" in Redis', async () => {
      await service.triggerManualConversion()

      expect(mockRedisClient.set).toHaveBeenCalledWith('converter:manual_trigger', '1')
    })

    it('throws when Redis is not available', async () => {
      mockGetRedisClient.mockReturnValue(null)

      await expect(service.triggerManualConversion()).rejects.toThrow('Redis not available')
    })
  })

  // -----------------------------------------------------------------------
  // getJobStatus
  // -----------------------------------------------------------------------

  describe('getJobStatus', () => {
    it('returns job data when found', async () => {
      mockRedisClient.hGetAll.mockResolvedValue({
        id: 'job-1',
        status: 'converting',
        fileCount: '3',
        completedCount: '1',
        failedCount: '0',
      })

      const result = await service.getJobStatus('job-1')

      expect(result).not.toBeNull()
      expect(result!['id']).toBe('job-1')
      expect(result!['status']).toBe('converting')
      expect(mockRedisClient.hGetAll).toHaveBeenCalledWith('converter:vjob:job-1')
    })

    it('returns null when job does not exist (empty hash)', async () => {
      mockRedisClient.hGetAll.mockResolvedValue({})

      const result = await service.getJobStatus('nonexistent')

      expect(result).toBeNull()
    })

    it('returns null when hGetAll returns object without id field', async () => {
      mockRedisClient.hGetAll.mockResolvedValue({ some: 'garbage' })

      const result = await service.getJobStatus('bad-data')

      expect(result).toBeNull()
    })
  })

  // -----------------------------------------------------------------------
  // getJobFiles
  // -----------------------------------------------------------------------

  describe('getJobFiles', () => {
    it('returns all file records for a job', async () => {
      mockRedisClient.sMembers.mockResolvedValue(['file-1', 'file-2'])
      mockRedisClient.hGetAll
        .mockResolvedValueOnce({ id: 'file-1', fileName: 'a.docx', status: 'pending' })
        .mockResolvedValueOnce({ id: 'file-2', fileName: 'b.xlsx', status: 'completed' })

      const files = await service.getJobFiles('job-1')

      expect(files).toHaveLength(2)
      expect(files[0]['fileName']).toBe('a.docx')
      expect(files[1]['fileName']).toBe('b.xlsx')
      expect(mockRedisClient.sMembers).toHaveBeenCalledWith('converter:files:job-1')
    })

    it('returns empty array when job has no files', async () => {
      mockRedisClient.sMembers.mockResolvedValue([])

      const files = await service.getJobFiles('empty-job')

      expect(files).toHaveLength(0)
    })

    it('skips file records that are empty (missing id)', async () => {
      mockRedisClient.sMembers.mockResolvedValue(['file-1', 'file-2'])
      mockRedisClient.hGetAll
        .mockResolvedValueOnce({ id: 'file-1', fileName: 'a.docx', status: 'pending' })
        .mockResolvedValueOnce({}) // empty/deleted file

      const files = await service.getJobFiles('job-1')

      expect(files).toHaveLength(1)
      expect(files[0]['id']).toBe('file-1')
    })
  })
})

// ---------------------------------------------------------------------------
// isOfficeFile (static helper on RagDocumentService)
// ---------------------------------------------------------------------------

describe('RagDocumentService.isOfficeFile', () => {
  // Import separately since it's a static method on a different class
  // We need to mock the same dependencies as rag-document.service.ts

  it('detects Word formats', async () => {
    const { RagDocumentService } = await import('../../src/modules/rag/services/rag-document.service')
    expect(RagDocumentService.isOfficeFile('doc')).toBe(true)
    expect(RagDocumentService.isOfficeFile('docx')).toBe(true)
    expect(RagDocumentService.isOfficeFile('docm')).toBe(true)
  })

  it('detects Excel formats', async () => {
    const { RagDocumentService } = await import('../../src/modules/rag/services/rag-document.service')
    expect(RagDocumentService.isOfficeFile('xls')).toBe(true)
    expect(RagDocumentService.isOfficeFile('xlsx')).toBe(true)
    expect(RagDocumentService.isOfficeFile('xlsm')).toBe(true)
  })

  it('detects PowerPoint formats', async () => {
    const { RagDocumentService } = await import('../../src/modules/rag/services/rag-document.service')
    expect(RagDocumentService.isOfficeFile('ppt')).toBe(true)
    expect(RagDocumentService.isOfficeFile('pptx')).toBe(true)
    expect(RagDocumentService.isOfficeFile('pptm')).toBe(true)
  })

  it('returns false for non-Office formats', async () => {
    const { RagDocumentService } = await import('../../src/modules/rag/services/rag-document.service')
    expect(RagDocumentService.isOfficeFile('pdf')).toBe(false)
    expect(RagDocumentService.isOfficeFile('txt')).toBe(false)
    expect(RagDocumentService.isOfficeFile('md')).toBe(false)
    expect(RagDocumentService.isOfficeFile('csv')).toBe(false)
    expect(RagDocumentService.isOfficeFile('json')).toBe(false)
    expect(RagDocumentService.isOfficeFile('jpg')).toBe(false)
    expect(RagDocumentService.isOfficeFile('png')).toBe(false)
  })

  it('is case-insensitive', async () => {
    const { RagDocumentService } = await import('../../src/modules/rag/services/rag-document.service')
    expect(RagDocumentService.isOfficeFile('DOCX')).toBe(true)
    expect(RagDocumentService.isOfficeFile('Xlsx')).toBe(true)
    expect(RagDocumentService.isOfficeFile('PPTX')).toBe(true)
  })
})
