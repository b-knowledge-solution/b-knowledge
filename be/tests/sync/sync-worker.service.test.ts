/**
 * @fileoverview Unit tests for SyncWorkerService.
 * @description Covers adapter registration, execute flow (happy path, missing connector,
 *   missing adapter, document ingestion, partial failures), parser selection, and failSyncLog.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockConnectorFindById = vi.fn()
const mockConnectorUpdate = vi.fn()
const mockSyncLogUpdate = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    connector: {
      findById: (...args: any[]) => mockConnectorFindById(...args),
      update: (...args: any[]) => mockConnectorUpdate(...args),
    },
    syncLog: {
      update: (...args: any[]) => mockSyncLogUpdate(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const mockPutFile = vi.fn()
const mockBuildStoragePath = vi.fn()
const mockGetFileType = vi.fn()

vi.mock('@/modules/rag/services/rag-storage.service.js', () => ({
  ragStorageService: {
    putFile: (...args: any[]) => mockPutFile(...args),
    buildStoragePath: (...args: any[]) => mockBuildStoragePath(...args),
    getFileType: (...args: any[]) => mockGetFileType(...args),
  },
}))

const mockCreateFile = vi.fn()
const mockCreateDocument = vi.fn()
const mockCreateFile2Document = vi.fn()
const mockBeginParse = vi.fn()
const mockIncrementDocCount = vi.fn()

vi.mock('@/modules/rag/services/rag-document.service.js', () => ({
  ragDocumentService: {
    createFile: (...args: any[]) => mockCreateFile(...args),
    createDocument: (...args: any[]) => mockCreateDocument(...args),
    createFile2Document: (...args: any[]) => mockCreateFile2Document(...args),
    beginParse: (...args: any[]) => mockBeginParse(...args),
    incrementDocCount: (...args: any[]) => mockIncrementDocCount(...args),
  },
}))

const mockQueueParseInit = vi.fn()
const mockGetUuid = vi.fn()

vi.mock('@/modules/rag/services/rag-redis.service.js', () => ({
  ragRedisService: {
    queueParseInit: (...args: any[]) => mockQueueParseInit(...args),
  },
  getUuid: (...args: any[]) => mockGetUuid(...args),
}))

// Import after mocks
import { SyncWorkerService, type ConnectorAdapter, type FetchedDocument } from '../../src/modules/sync/services/sync-worker.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Create a mock adapter that yields the given documents
 * @param {FetchedDocument[]} docs - Documents to yield
 * @returns {ConnectorAdapter} Mock adapter
 */
function createMockAdapter(docs: FetchedDocument[]): ConnectorAdapter {
  return {
    async *fetch() {
      for (const doc of docs) {
        yield doc
      }
    },
  }
}

/**
 * @description Create a mock adapter that throws on fetch
 * @param {Error} error - Error to throw
 * @returns {ConnectorAdapter} Mock adapter that throws
 */
function createFailingAdapter(error: Error): ConnectorAdapter {
  return {
    async *fetch() {
      throw error
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SyncWorkerService', () => {
  let service: SyncWorkerService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new SyncWorkerService()

    // Default UUID generation
    let uuidCounter = 0
    mockGetUuid.mockImplementation(() => `uuid-${++uuidCounter}`)
    mockBuildStoragePath.mockReturnValue('/storage/path')
    mockGetFileType.mockReturnValue('document')
    mockPutFile.mockResolvedValue(undefined)
    mockCreateFile.mockResolvedValue(undefined)
    mockCreateDocument.mockResolvedValue(undefined)
    mockCreateFile2Document.mockResolvedValue(undefined)
    mockBeginParse.mockResolvedValue(undefined)
    mockQueueParseInit.mockResolvedValue(undefined)
    mockIncrementDocCount.mockResolvedValue(undefined)
    mockSyncLogUpdate.mockResolvedValue(undefined)
    mockConnectorUpdate.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // registerAdapter
  // -------------------------------------------------------------------------

  describe('registerAdapter', () => {
    /** @description Should register an adapter for a given source type */
    it('should register an adapter by source type', () => {
      const adapter = createMockAdapter([])
      service.registerAdapter('notion', adapter)

      // Verify adapter is stored (tested indirectly via execute)
      expect(() => service.registerAdapter('notion', adapter)).not.toThrow()
    })
  })

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  describe('execute', () => {
    /** @description Should fail sync log when connector not found */
    it('should fail sync log when connector is not found', async () => {
      mockConnectorFindById.mockResolvedValue(undefined)

      await service.execute('missing-conn', 'sl-1')

      // Verify sync log marked as failed
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          status: 'failed',
          message: 'Connector not found',
        }),
      )
    })

    /** @description Should fail sync log when no adapter registered for source type */
    it('should fail sync log when adapter is not registered', async () => {
      mockConnectorFindById.mockResolvedValue({
        id: 'conn-1',
        source_type: 'unknown_source',
        config: {},
      })

      await service.execute('conn-1', 'sl-1')

      // Verify failure message includes the source type
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          status: 'failed',
          message: expect.stringContaining('unknown_source'),
        }),
      )
    })

    /** @description Should mark sync as running, process docs, then mark completed */
    it('should process documents through the full ingestion pipeline', async () => {
      const testDoc: FetchedDocument = {
        filename: 'test.pdf',
        suffix: 'pdf',
        content: Buffer.from('test content'),
        size: 12,
      }
      const adapter = createMockAdapter([testDoc])
      service.registerAdapter('notion', adapter)

      mockConnectorFindById.mockResolvedValue({
        id: 'conn-1',
        source_type: 'notion',
        kb_id: 'kb-1',
        config: { api_key: 'key' },
        last_synced_at: null,
      })

      await service.execute('conn-1', 'sl-1')

      // Verify sync was marked as running first
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          status: 'running',
          message: 'Fetching documents from source...',
        }),
      )

      // Verify the ingestion pipeline was called for the document
      expect(mockBuildStoragePath).toHaveBeenCalledWith('kb-1', expect.any(String), 'test.pdf')
      expect(mockPutFile).toHaveBeenCalled()
      expect(mockCreateFile).toHaveBeenCalled()
      expect(mockCreateDocument).toHaveBeenCalled()
      expect(mockCreateFile2Document).toHaveBeenCalled()
      expect(mockBeginParse).toHaveBeenCalled()
      expect(mockQueueParseInit).toHaveBeenCalled()
      expect(mockIncrementDocCount).toHaveBeenCalledWith('kb-1', 1)

      // Verify sync completed with correct counts
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          status: 'completed',
          docs_synced: 1,
          docs_failed: 0,
          progress: 100,
        }),
      )

      // Verify connector last_synced_at was updated
      expect(mockConnectorUpdate).toHaveBeenCalledWith(
        'conn-1',
        expect.objectContaining({ last_synced_at: expect.any(Date) }),
      )
    })

    /** @description Should parse JSON config string from DB */
    it('should parse connector config when stored as JSON string', async () => {
      const adapter = createMockAdapter([])
      service.registerAdapter('s3', adapter)

      mockConnectorFindById.mockResolvedValue({
        id: 'conn-1',
        source_type: 's3',
        kb_id: 'kb-1',
        // Config stored as stringified JSON in DB
        config: JSON.stringify({ bucket: 'test-bucket' }),
        last_synced_at: null,
      })

      await service.execute('conn-1', 'sl-1')

      // Verify sync completed (no parse error from string config)
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({ status: 'completed' }),
      )
    })

    /** @description Should count failed docs and continue processing remaining */
    it('should handle individual document ingestion failures gracefully', async () => {
      const doc1: FetchedDocument = { filename: 'a.pdf', suffix: 'pdf', content: Buffer.from('a'), size: 1 }
      const doc2: FetchedDocument = { filename: 'b.pdf', suffix: 'pdf', content: Buffer.from('b'), size: 1 }
      const doc3: FetchedDocument = { filename: 'c.pdf', suffix: 'pdf', content: Buffer.from('c'), size: 1 }

      const adapter = createMockAdapter([doc1, doc2, doc3])
      service.registerAdapter('s3', adapter)

      mockConnectorFindById.mockResolvedValue({
        id: 'conn-1',
        source_type: 's3',
        kb_id: 'kb-1',
        config: {},
        last_synced_at: null,
      })

      // Make the second document fail during file storage
      let callCount = 0
      mockPutFile.mockImplementation(() => {
        callCount++
        if (callCount === 2) throw new Error('Storage error')
        return Promise.resolve()
      })

      await service.execute('conn-1', 'sl-1')

      // Verify final counts: 2 synced, 1 failed
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          status: 'completed',
          docs_synced: 2,
          docs_failed: 1,
        }),
      )
    })

    /** @description Should fail sync log when adapter throws during iteration */
    it('should fail sync log when adapter throws during fetch', async () => {
      const adapter = createFailingAdapter(new Error('API rate limit'))
      service.registerAdapter('notion', adapter)

      mockConnectorFindById.mockResolvedValue({
        id: 'conn-1',
        source_type: 'notion',
        kb_id: 'kb-1',
        config: { api_key: 'key' },
        last_synced_at: null,
      })

      await service.execute('conn-1', 'sl-1')

      // Verify sync log marked as failed with error message
      expect(mockSyncLogUpdate).toHaveBeenCalledWith(
        'sl-1',
        expect.objectContaining({
          status: 'failed',
          message: expect.stringContaining('API rate limit'),
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // selectParser (tested indirectly via ingestDocument)
  // -------------------------------------------------------------------------

  describe('selectParser (via ingestion)', () => {
    beforeEach(() => {
      mockConnectorFindById.mockResolvedValue({
        id: 'conn-1',
        source_type: 'test',
        kb_id: 'kb-1',
        config: {},
        last_synced_at: null,
      })
    })

    /** @description Should select correct parser based on file extension */
    it.each([
      ['pdf', 'naive'],
      ['docx', 'naive'],
      ['csv', 'table'],
      ['xlsx', 'table'],
      ['pptx', 'presentation'],
      ['jpg', 'picture'],
      ['mp3', 'audio'],
      ['eml', 'email'],
      ['html', 'naive'],
      ['unknown_ext', 'naive'],
    ])('should select parser "%s" for extension "%s"', async (ext, expectedParser) => {
      const doc: FetchedDocument = {
        filename: `test.${ext}`,
        suffix: ext,
        content: Buffer.from('x'),
        size: 1,
      }
      const adapter = createMockAdapter([doc])
      service.registerAdapter('test', adapter)

      await service.execute('conn-1', 'sl-1')

      // Verify document was created with correct parser_id
      expect(mockCreateDocument).toHaveBeenCalledWith(
        expect.objectContaining({ parser_id: expectedParser }),
      )
    })
  })
})
