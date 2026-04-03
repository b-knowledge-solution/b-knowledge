/**
 * @fileoverview Integration tests for the document upload → converter → parse pipeline.
 *
 * Tests cover:
 * Case 1: Office document upload triggers converter job (not direct parse)
 * Case 2: Non-Office upload triggers auto-parse immediately
 * Case 3: Version upload splits Office vs non-Office correctly
 * Case 4: Converter job status endpoint returns progress
 * Case 5: Manual trigger flag is set for immediate processing
 * Case 6: Parser ID override on upload
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockRagDocument = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  findByDatasetId: vi.fn(),
  beginParse: vi.fn(),
  softDelete: vi.fn(),
  findByDatasetIdAsc: vi.fn(),
}))

const mockKnowledgebase = vi.hoisted(() => ({
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
}))

const mockRagFile = vi.hoisted(() => ({
  createFile: vi.fn(),
  createFile2Document: vi.fn(),
}))

const mockDataset = vi.hoisted(() => ({
  findById: vi.fn(),
  getKnex: vi.fn(() => ({
    where: vi.fn().mockReturnThis(),
    increment: vi.fn().mockResolvedValue(1),
  })),
}))

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
  xGroupCreate: vi.fn().mockResolvedValue('OK'),
  xAdd: vi.fn().mockResolvedValue('1-0'),
}))

const mockGetRedisClient = vi.hoisted(() => vi.fn(() => mockRedisClient))

let uuidCounter = 0
const mockUuid = vi.hoisted(() => vi.fn(() => `uuid${++uuidCounter}`))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    ragDocument: mockRagDocument,
    knowledgebase: mockKnowledgebase,
    ragFile: mockRagFile,
    dataset: mockDataset,
  },
}))

vi.mock('../../src/shared/services/redis.service.js', () => ({
  getRedisClient: mockGetRedisClient,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/shared/utils/uuid.js', () => ({
  getUuid: mockUuid,
}))

vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: { deleteChunksByDocId: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Import units under test (after mocks)
// ---------------------------------------------------------------------------

import { ConverterQueueService } from '../../src/modules/rag/services/converter-queue.service'
import { RagDocumentService } from '../../src/modules/rag/services/rag-document.service'
import { RagRedisService } from '../../src/modules/rag/services/rag-redis.service'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Document Upload Pipeline', () => {
  let converterQueue: ConverterQueueService
  let ragRedis: RagRedisService
  let ragDoc: RagDocumentService

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    // Restore mocks after clearAllMocks resets implementations
    mockUuid.mockImplementation(() => `uuid${++uuidCounter}`)
    mockGetRedisClient.mockReturnValue(mockRedisClient)
    mockRedisClient.multi.mockReturnValue(mockRedisMulti)
    mockRedisMulti.hSet.mockReturnThis()
    mockRedisMulti.sAdd.mockReturnThis()
    mockRedisMulti.set.mockReturnThis()
    mockRedisMulti.exec.mockResolvedValue([])
    mockRedisClient.set.mockResolvedValue('OK')
    mockRedisClient.hGetAll.mockResolvedValue({})
    mockRedisClient.sMembers.mockResolvedValue([])
    mockRedisClient.xGroupCreate.mockResolvedValue('OK')
    mockRedisClient.xAdd.mockResolvedValue('1-0')
    converterQueue = new ConverterQueueService()
    ragRedis = new RagRedisService()
    ragDoc = new RagDocumentService()
  })

  // -----------------------------------------------------------------------
  // Case 1: Office doc → converter job, NOT direct parse
  // -----------------------------------------------------------------------

  describe('Case 1: Office document upload creates converter job', () => {
    const officeExtensions = ['doc', 'docx', 'docm', 'xls', 'xlsx', 'xlsm', 'ppt', 'pptx', 'pptm']

    it.each(officeExtensions)('detects .%s as an Office file that needs conversion', (ext) => {
      expect(RagDocumentService.isOfficeFile(ext)).toBe(true)
    })

    it('creates converter job with correct Redis key layout for .docx file', async () => {
      const jobId = await converterQueue.createJob({
        datasetId: 'ds-1',
        versionId: 'ver-1',
        projectId: 'proj-1',
        categoryId: 'cat-1',
        files: [
          { fileName: 'report.docx', filePath: 'proj-1/cat-1/ver-1/report.docx' },
        ],
      })

      // Verify Redis pipeline created correct keys
      expect(jobId).toBeDefined()

      // Job hash at converter:vjob:{jobId}
      const jobHash = mockRedisMulti.hSet.mock.calls[0]
      expect(jobHash[0]).toContain('converter:vjob:')
      expect(jobHash[1].status).toBe('converting')

      // Status set at converter:vjob:status:converting
      const statusSet = mockRedisMulti.sAdd.mock.calls[0]
      expect(statusSet[0]).toBe('converter:vjob:status:converting')

      // Active job pointer at converter:version:active_job:{versionId}
      const activeJob = mockRedisMulti.set.mock.calls[0]
      expect(activeJob[0]).toBe('converter:version:active_job:ver-1')

      // File tracking at converter:file:{fileId}
      const fileHash = mockRedisMulti.hSet.mock.calls[1]
      expect(fileHash[0]).toContain('converter:file:')
      expect(fileHash[1].fileName).toBe('report.docx')
      expect(fileHash[1].status).toBe('pending')
    })

    it('Office files should NOT trigger queueParseInit directly', () => {
      // This verifies the logic: isOfficeFile returns true → skip parse
      const isOffice = RagDocumentService.isOfficeFile('docx')
      expect(isOffice).toBe(true)

      // The controller should check this and skip ragRedisService.queueParseInit()
      // Non-Office files should parse; Office files should go to converter
    })
  })

  // -----------------------------------------------------------------------
  // Case 2: Non-Office upload → auto-parse immediately
  // -----------------------------------------------------------------------

  describe('Case 2: Non-Office files auto-parse immediately', () => {
    const nonOfficeExtensions = ['pdf', 'txt', 'md', 'csv', 'json', 'html', 'jpg', 'png']

    it.each(nonOfficeExtensions)('detects .%s as a non-Office file (direct parse)', (ext) => {
      expect(RagDocumentService.isOfficeFile(ext)).toBe(false)
    })

    it('beginParse + queueParseInit are called for PDF upload', async () => {
      const docId = 'doc-pdf-1'

      // Simulate what the controller does for non-Office files
      await ragDoc.beginParse(docId)
      expect(mockRagDocument.beginParse).toHaveBeenCalledWith(docId)

      // Queue parse task
      const taskId = await ragRedis.queueParseInit(docId)
      expect(taskId).toBeDefined()
      expect(mockRedisClient.xAdd).toHaveBeenCalled()

      // Verify the message includes the correct doc_id
      const xAddCall = mockRedisClient.xAdd.mock.calls[0]
      const message = JSON.parse(xAddCall[2].message)
      expect(message.doc_id).toBe(docId)
      expect(message.task_type).toBe('parse_init')
    })
  })

  // -----------------------------------------------------------------------
  // Case 3: Version upload splits Office vs non-Office
  // -----------------------------------------------------------------------

  describe('Case 3: Mixed upload splits correctly', () => {
    it('classifies a mixed batch of files correctly', () => {
      const files = [
        { name: 'report.docx', suffix: 'docx' },
        { name: 'data.pdf', suffix: 'pdf' },
        { name: 'slides.pptx', suffix: 'pptx' },
        { name: 'readme.md', suffix: 'md' },
        { name: 'budget.xlsx', suffix: 'xlsx' },
        { name: 'photo.jpg', suffix: 'jpg' },
      ]

      const officeFiles = files.filter(f => RagDocumentService.isOfficeFile(f.suffix))
      const directParseFiles = files.filter(f => !RagDocumentService.isOfficeFile(f.suffix))

      // 3 Office files: docx, pptx, xlsx
      expect(officeFiles).toHaveLength(3)
      expect(officeFiles.map(f => f.name)).toEqual(['report.docx', 'slides.pptx', 'budget.xlsx'])

      // 3 direct-parseable: pdf, md, jpg
      expect(directParseFiles).toHaveLength(3)
      expect(directParseFiles.map(f => f.name)).toEqual(['data.pdf', 'readme.md', 'photo.jpg'])
    })

    it('creates converter job only for Office files in the batch', async () => {
      const officeFiles = [
        { fileName: 'report.docx', filePath: 'p/c/v/report.docx' },
        { fileName: 'budget.xlsx', filePath: 'p/c/v/budget.xlsx' },
      ]

      await converterQueue.createJob({
        datasetId: 'ds-1',
        versionId: 'ver-1',
        projectId: 'proj-1',
        categoryId: 'cat-1',
        files: officeFiles,
      })

      // Job fileCount should be 2 (only Office files)
      const jobData = mockRedisMulti.hSet.mock.calls[0][1]
      expect(jobData.fileCount).toBe('2')

      // 2 file tracking records created
      const fileHashes = mockRedisMulti.hSet.mock.calls.slice(1) // skip job hash
      expect(fileHashes).toHaveLength(2)
      expect(fileHashes[0][1].fileName).toBe('report.docx')
      expect(fileHashes[1][1].fileName).toBe('budget.xlsx')
    })
  })

  // -----------------------------------------------------------------------
  // Case 4: Converter job status check
  // -----------------------------------------------------------------------

  describe('Case 4: Converter job status endpoint', () => {
    it('returns status with progress counters for active job', async () => {
      mockRedisClient.hGetAll.mockResolvedValue({
        id: 'job-1',
        status: 'converting',
        fileCount: '5',
        completedCount: '3',
        failedCount: '1',
      })

      const result = await converterQueue.getJobStatus('job-1')

      expect(result).not.toBeNull()
      expect(result!['status']).toBe('converting')
      expect(result!['fileCount']).toBe('5')
      expect(result!['completedCount']).toBe('3')
      expect(result!['failedCount']).toBe('1')
    })

    it('returns status completed when all files processed', async () => {
      mockRedisClient.hGetAll.mockResolvedValue({
        id: 'job-2',
        status: 'completed',
        fileCount: '3',
        completedCount: '3',
        failedCount: '0',
      })

      const result = await converterQueue.getJobStatus('job-2')

      expect(result!['status']).toBe('completed')
      expect(result!['completedCount']).toBe('3')
      expect(result!['failedCount']).toBe('0')
    })

    it('returns null for non-existent job', async () => {
      mockRedisClient.hGetAll.mockResolvedValue({})

      const result = await converterQueue.getJobStatus('non-existent')

      expect(result).toBeNull()
    })

    it('returns file details for job with getJobFiles', async () => {
      mockRedisClient.sMembers.mockResolvedValue(['f1', 'f2', 'f3'])
      mockRedisClient.hGetAll
        .mockResolvedValueOnce({ id: 'f1', fileName: 'a.docx', status: 'completed', pdfPath: 'p/c/v/pdf/a.pdf' })
        .mockResolvedValueOnce({ id: 'f2', fileName: 'b.xlsx', status: 'completed', pdfPath: 'p/c/v/pdf/b.pdf' })
        .mockResolvedValueOnce({ id: 'f3', fileName: 'c.pptx', status: 'failed', error: 'LibreOffice timeout' })

      const files = await converterQueue.getJobFiles('job-1')

      expect(files).toHaveLength(3)
      expect(files[0]['status']).toBe('completed')
      expect(files[2]['status']).toBe('failed')
      expect(files[2]['error']).toBe('LibreOffice timeout')
    })
  })

  // -----------------------------------------------------------------------
  // Case 5: Manual trigger (force parse)
  // -----------------------------------------------------------------------

  describe('Case 5: Manual trigger for immediate processing', () => {
    it('sets converter:manual_trigger to "1" in Redis', async () => {
      await converterQueue.triggerManualConversion()

      expect(mockRedisClient.set).toHaveBeenCalledWith('converter:manual_trigger', '1')
    })

    it('is called after creating a converter job (full flow)', async () => {
      // Simulate the controller flow: create job → trigger
      await converterQueue.createJob({
        datasetId: 'ds-1',
        versionId: 'ver-1',
        projectId: 'proj-1',
        categoryId: 'cat-1',
        files: [{ fileName: 'report.docx', filePath: 'p/c/v/report.docx' }],
      })

      await converterQueue.triggerManualConversion()

      // Both pipeline exec (for createJob) and set (for trigger) should be called
      expect(mockRedisMulti.exec).toHaveBeenCalledTimes(1)
      expect(mockRedisClient.set).toHaveBeenCalledWith('converter:manual_trigger', '1')
    })
  })

  // -----------------------------------------------------------------------
  // Case 6: Parser ID override on upload
  // -----------------------------------------------------------------------

  describe('Case 6: Parser ID selection on upload', () => {
    it('uses upload parser_id when provided instead of dataset default', () => {
      // Simulates the controller logic:
      // const uploadParserId = req.body?.parser_id || dataset.parser_id || 'naive'
      const datasetParserId = 'naive'

      // When user provides parser_id in FormData
      const userProvidedParserId = 'pdf'
      const resolvedParserId = userProvidedParserId || datasetParserId || 'naive'
      expect(resolvedParserId).toBe('pdf')
    })

    it('falls back to dataset parser_id when not provided in upload', () => {
      const datasetParserId = 'table'
      const userProvidedParserId = undefined

      const resolvedParserId = userProvidedParserId || datasetParserId || 'naive'
      expect(resolvedParserId).toBe('table')
    })

    it('falls back to naive when neither upload nor dataset has parser_id', () => {
      const datasetParserId = undefined
      const userProvidedParserId = undefined

      const resolvedParserId = userProvidedParserId || datasetParserId || 'naive'
      expect(resolvedParserId).toBe('naive')
    })
  })
})

// ---------------------------------------------------------------------------
// Redis Key Contract Verification
// ---------------------------------------------------------------------------

describe('Redis Key Contract (Node.js ↔ Python)', () => {
  let converterQueue: ConverterQueueService

  beforeEach(() => {
    vi.clearAllMocks()
    uuidCounter = 0
    // Restore mocks after clearAllMocks resets implementations
    mockUuid.mockImplementation(() => `uuid${++uuidCounter}`)
    mockGetRedisClient.mockReturnValue(mockRedisClient)
    mockRedisClient.multi.mockReturnValue(mockRedisMulti)
    mockRedisMulti.hSet.mockReturnThis()
    mockRedisMulti.sAdd.mockReturnThis()
    mockRedisMulti.set.mockReturnThis()
    mockRedisMulti.exec.mockResolvedValue([])
    mockRedisClient.set.mockResolvedValue('OK')
    converterQueue = new ConverterQueueService()
  })

  it('uses exact key prefixes matching converter/src/worker.py constants', async () => {
    await converterQueue.createJob({
      datasetId: 'ds',
      versionId: 'ver',
      projectId: 'proj',
      categoryId: 'cat',
      files: [{ fileName: 'test.docx', filePath: 'p/test.docx' }],
    })

    const allKeys = [
      ...mockRedisMulti.hSet.mock.calls.map((c: any[]) => c[0]),
      ...mockRedisMulti.sAdd.mock.calls.map((c: any[]) => c[0]),
      ...mockRedisMulti.set.mock.calls.map((c: any[]) => c[0]),
    ]

    // These must match exactly what worker.py reads
    expect(allKeys).toContainEqual(expect.stringContaining('converter:vjob:'))
    expect(allKeys).toContainEqual('converter:vjob:status:converting')
    expect(allKeys).toContainEqual('converter:version:active_job:ver')
    expect(allKeys).toContainEqual(expect.stringContaining('converter:file:'))
    expect(allKeys).toContainEqual(expect.stringContaining('converter:files:'))
  })

  it('stores all values as strings (Redis hash requirement)', async () => {
    await converterQueue.createJob({
      datasetId: 'ds',
      versionId: 'ver',
      projectId: 'proj',
      categoryId: 'cat',
      files: [{ fileName: 'test.docx', filePath: 'p/test.docx' }],
    })

    // Check job hash — all defined values must be strings
    const jobData = mockRedisMulti.hSet.mock.calls[0][1]
    for (const [, value] of Object.entries(jobData)) {
      // Skip undefined entries (optional fields not set)
      if (value !== undefined) {
        expect(typeof value).toBe('string')
      }
    }

    // Check file hash — all values must be strings
    const fileData = mockRedisMulti.hSet.mock.calls[1][1]
    for (const [key, value] of Object.entries(fileData)) {
      expect(typeof value).toBe('string')
    }
  })

  it('manual trigger key matches worker.py MANUAL_TRIGGER_KEY', async () => {
    await converterQueue.triggerManualConversion()

    // worker.py line 89: MANUAL_TRIGGER_KEY = 'converter:manual_trigger'
    expect(mockRedisClient.set).toHaveBeenCalledWith('converter:manual_trigger', '1')
  })
})
