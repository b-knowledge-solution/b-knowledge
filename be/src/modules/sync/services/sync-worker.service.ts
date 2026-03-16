
/**
 * @fileoverview Background sync worker that fetches files from external sources.
 * @description Implements the connector-specific logic for each source type.
 *   Flow: Connector config → fetch files → store in MinIO → create document → enqueue parse task.
 *   This replaces the Python sync_data_source.py with a Node.js implementation.
 * @module modules/sync/services/sync-worker
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { ragStorageService } from '@/modules/rag/services/rag-storage.service.js'
import { ragDocumentService } from '@/modules/rag/services/rag-document.service.js'
import { ragRedisService, getUuid } from '@/modules/rag/services/rag-redis.service.js'
import { Connector, SyncLog } from '../models/sync.types.js'

/**
 * Represents a single fetched document from an external source.
 * @description Connectors produce these objects; the worker stores and enqueues them.
 */
export interface FetchedDocument {
  /** Original filename from the source */
  filename: string
  /** File extension without dot (e.g., 'pdf', 'docx') */
  suffix: string
  /** Raw file content */
  content: Buffer
  /** File size in bytes */
  size: number
  /** Optional metadata from the source */
  metadata?: Record<string, unknown>
}

/**
 * Connector adapter interface.
 * @description Each source type implements this interface to fetch documents.
 */
export interface ConnectorAdapter {
  /**
   * Fetch documents from the external source.
   * @param config - Source-specific configuration (API keys, URLs, etc.)
   * @param since - Optional timestamp for incremental sync
   * @returns AsyncGenerator yielding fetched documents one by one
   */
  fetch(config: Record<string, unknown>, since?: Date): AsyncGenerator<FetchedDocument>
}

/**
 * SyncWorkerService handles the actual file fetching and ingestion.
 * @description Orchestrates: connector.fetch() → MinIO → document record → parse task.
 */
export class SyncWorkerService {
  /** Registry of connector adapters by source type */
  private adapters = new Map<string, ConnectorAdapter>()

  /**
   * @description Register a connector adapter for a source type in the adapter registry
   * @param {string} sourceType - The source type key (e.g., 'github', 'notion')
   * @param {ConnectorAdapter} adapter - The adapter implementation
   * @returns {void}
   */
  registerAdapter(sourceType: string, adapter: ConnectorAdapter): void {
    this.adapters.set(sourceType, adapter)
  }

  /**
   * @description Execute a sync operation for a connector. Main entry point called when a sync task is dequeued.
   *   Fetches documents via the registered adapter, stores them in MinIO, creates DB records, and enqueues parse tasks.
   * @param {string} connectorId - UUID of the connector to sync
   * @param {string} syncLogId - UUID of the sync log entry to update with progress
   * @returns {Promise<void>}
   */
  async execute(connectorId: string, syncLogId: string): Promise<void> {
    // Load connector config
    const connector = await ModelFactory.connector.findById(connectorId)
    if (!connector) {
      await this.failSyncLog(syncLogId, 'Connector not found')
      return
    }

    // Find the adapter for this source type
    const adapter = this.adapters.get(connector.source_type)
    if (!adapter) {
      await this.failSyncLog(syncLogId, `No adapter registered for source type: ${connector.source_type}`)
      return
    }

    // Mark sync as running
    await ModelFactory.syncLog.update(syncLogId, {
      status: 'running',
      started_at: new Date(),
      message: 'Fetching documents from source...',
    } as Partial<SyncLog>)

    let docsSynced = 0
    let docsFailed = 0

    try {
      // Parse connector config (may be stored as string from DB)
      const config = typeof connector.config === 'string'
        ? JSON.parse(connector.config)
        : connector.config

      // Determine incremental sync start
      const since = connector.last_synced_at || undefined

      // Iterate over documents yielded by the connector adapter
      for await (const doc of adapter.fetch(config, since)) {
        try {
          await this.ingestDocument(connector, doc)
          docsSynced++

          // Update progress periodically
          if (docsSynced % 10 === 0) {
            await ModelFactory.syncLog.update(syncLogId, {
              docs_synced: docsSynced,
              docs_failed: docsFailed,
              message: `Synced ${docsSynced} documents...`,
            } as Partial<SyncLog>)
          }
        } catch (err) {
          docsFailed++
          log.warn('Failed to ingest document from sync', {
            connectorId,
            filename: doc.filename,
            error: String(err),
          })
        }
      }

      // Mark sync as completed
      await ModelFactory.syncLog.update(syncLogId, {
        status: 'completed',
        docs_synced: docsSynced,
        docs_failed: docsFailed,
        progress: 100,
        message: `Sync completed: ${docsSynced} synced, ${docsFailed} failed`,
        finished_at: new Date(),
      } as Partial<SyncLog>)

      // Update connector last_synced_at
      await ModelFactory.connector.update(connectorId, {
        last_synced_at: new Date(),
      } as Partial<Connector>)

      log.info('Sync completed', { connectorId, docsSynced, docsFailed })
    } catch (err) {
      await this.failSyncLog(syncLogId, `Sync error: ${String(err)}`)
      log.error('Sync execution failed', { connectorId, error: String(err) })
    }
  }

  /**
   * @description Ingest a single document through the full pipeline: MinIO storage,
   *   file record, document record, file-document link, and parse task enqueue
   * @param {Connector} connector - The connector that sourced this document
   * @param {FetchedDocument} doc - The fetched document to ingest
   * @returns {Promise<void>}
   */
  private async ingestDocument(connector: Connector, doc: FetchedDocument): Promise<void> {
    const docId = getUuid()
    const fileId = getUuid()
    const kbId = connector.kb_id

    // Step 1: Store raw file in MinIO
    const storagePath = ragStorageService.buildStoragePath(kbId, fileId, doc.filename)
    await ragStorageService.putFile(storagePath, doc.content)

    // Step 2: Determine file type and parser
    const fileType = ragStorageService.getFileType(doc.suffix)
    const parserId = this.selectParser(doc.suffix)

    // Step 3: Create file record
    await ragDocumentService.createFile({
      id: fileId,
      name: doc.filename,
      location: storagePath,
      size: doc.size,
      type: fileType,
    })

    // Step 4: Create document record
    await ragDocumentService.createDocument({
      id: docId,
      kb_id: kbId,
      parser_id: parserId,
      parser_config: {},
      name: doc.filename,
      location: storagePath,
      size: doc.size,
      suffix: doc.suffix,
      type: fileType,
    })

    // Step 5: Link file to document
    await ragDocumentService.createFile2Document(fileId, docId)

    // Step 6: Mark document as ready for parsing
    await ragDocumentService.beginParse(docId)

    // Step 7: Enqueue parse task to Redis for advance-rag
    await ragRedisService.queueParseInit(docId)

    // Step 8: Increment dataset document count
    await ragDocumentService.incrementDocCount(kbId, 1)

    log.debug('Ingested synced document', { docId, filename: doc.filename, kbId })
  }

  /**
   * @description Select the appropriate parser based on file extension, mapping to advance-rag ParserType
   * @param {string} suffix - File extension without dot (e.g., 'pdf', 'xlsx')
   * @returns {string} Parser ID matching advance-rag parser types (defaults to 'naive')
   */
  private selectParser(suffix: string): string {
    // Map file extensions to parser types (matches advance-rag/db/db_models.py ParserType)
    const parserMap: Record<string, string> = {
      pdf: 'naive',
      doc: 'naive',
      docx: 'naive',
      txt: 'naive',
      md: 'naive',
      csv: 'table',
      xlsx: 'table',
      xls: 'table',
      ppt: 'presentation',
      pptx: 'presentation',
      jpg: 'picture',
      jpeg: 'picture',
      png: 'picture',
      bmp: 'picture',
      gif: 'picture',
      tiff: 'picture',
      mp3: 'audio',
      wav: 'audio',
      ogg: 'audio',
      flac: 'audio',
      eml: 'email',
      msg: 'email',
      html: 'naive',
      htm: 'naive',
      json: 'naive',
    }
    return parserMap[suffix] || 'naive'
  }

  /**
   * @description Mark a sync log entry as failed with an error message and finished timestamp
   * @param {string} syncLogId - Sync log UUID
   * @param {string} message - Error message describing the failure
   * @returns {Promise<void>}
   */
  private async failSyncLog(syncLogId: string, message: string): Promise<void> {
    await ModelFactory.syncLog.update(syncLogId, {
      status: 'failed',
      message,
      finished_at: new Date(),
    } as Partial<SyncLog>)
  }
}

/** Singleton instance of SyncWorkerService */
export const syncWorkerService = new SyncWorkerService()
