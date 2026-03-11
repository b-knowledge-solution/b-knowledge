
/**
 * @fileoverview S3/Blob storage connector adapter.
 * @description Fetches files from an S3-compatible bucket (MinIO, AWS S3, Azure Blob).
 * @module modules/sync/adapters/s3
 */
import { log } from '@/shared/services/logger.service.js'
import * as Minio from 'minio'
import { ConnectorAdapter, FetchedDocument } from '../services/sync-worker.service.js'

/** Supported file extensions for document ingestion */
const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'xlsx', 'xls',
  'ppt', 'pptx', 'html', 'htm', 'json', 'eml', 'msg',
  'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif',
  'mp3', 'wav', 'ogg', 'flac',
])

/**
 * S3Adapter implements ConnectorAdapter for S3-compatible storage.
 * @description Lists objects in a bucket/prefix and downloads supported files.
 */
export class S3Adapter implements ConnectorAdapter {
  /**
   * Fetch files from an S3-compatible bucket.
   * @param config - Must contain: { endpoint, access_key, secret_key, bucket, prefix?, use_ssl? }
   * @param since - Optional timestamp for incremental sync (filters by lastModified)
   * @yields FetchedDocument for each supported file found
   */
  async *fetch(config: Record<string, unknown>, since?: Date): AsyncGenerator<FetchedDocument> {
    // Create a temporary S3 client with connector-specific credentials
    const client = new Minio.Client({
      endPoint: config.endpoint as string,
      ...(config.port ? { port: Number(config.port) } : {}),
      useSSL: config.use_ssl === true,
      accessKey: config.access_key as string,
      secretKey: config.secret_key as string,
    })

    const bucket = config.bucket as string
    const prefix = (config.prefix as string) || ''

    // List all objects in bucket with prefix
    const objectStream = client.listObjectsV2(bucket, prefix, true)

    for await (const obj of objectStream) {
      // Skip directories
      if (!obj.name || obj.name.endsWith('/')) continue

      // Extract extension and check if supported
      const ext = obj.name.split('.').pop()?.toLowerCase() || ''
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue

      // Skip files older than last sync
      if (since && obj.lastModified && obj.lastModified <= since) continue

      try {
        // Download file content
        const stream = await client.getObject(bucket, obj.name)
        const chunks: Buffer[] = []
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const content = Buffer.concat(chunks)

        // Extract filename from path
        const filename = obj.name.split('/').pop() || obj.name

        yield {
          filename,
          suffix: ext,
          content,
          size: content.length,
          metadata: {
            s3_key: obj.name,
            s3_bucket: bucket,
            last_modified: obj.lastModified?.toISOString(),
          },
        }
      } catch (err) {
        log.warn('Failed to fetch S3 object', { bucket, key: obj.name, error: String(err) })
      }
    }
  }
}
