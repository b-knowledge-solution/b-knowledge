
/**
 * @fileoverview Adapter registry for sync connectors.
 * @description Registers all connector adapters with the sync worker service.
 * @module modules/sync/adapters
 */
import { syncWorkerService } from '../services/sync-worker.service.js'
import { S3Adapter } from './s3.adapter.js'
import { NotionAdapter } from './notion.adapter.js'
import { WebCrawlAdapter } from './web-crawl.adapter.js'

/**
 * Register all available connector adapters with the sync worker.
 * @description Called once at application startup to populate the adapter registry.
 */
export function registerAllAdapters(): void {
  syncWorkerService.registerAdapter('s3', new S3Adapter())
  syncWorkerService.registerAdapter('notion', new NotionAdapter())
  syncWorkerService.registerAdapter('web_crawl', new WebCrawlAdapter())
}
