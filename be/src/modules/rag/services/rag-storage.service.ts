/**
 * @fileoverview S3-compatible storage service for RAG document files.
 *
 * Handles file upload/download to S3-compatible storage (RustFS/MinIO/etc.),
 * matching the same bucket/path conventions used by the Python advance-rag task executor.
 *
 * Storage path convention: {SYSTEM_TENANT_ID}/{dataset_id}/{file_id}/{filename}
 *
 * @module modules/rag/services/rag-storage
 */

import { minioClient } from '@/shared/services/minio.service.js';
import { log } from '@/shared/services/logger.service.js';
import { config } from '@/shared/config/index.js';
import { Readable } from 'stream';

// RAGFlow stores tenant_id as a 32-char hex string (UUID without hyphens)
const SYSTEM_TENANT_ID = config.opensearch.systemTenantId;

/**
 * The S3 bucket name for document storage.
 * Must match the advance-rag worker's bucket config (service_conf.yaml s3.bucket).
 */
const S3_BUCKET = config.s3.bucket;

/**
 * Optional prefix path within the bucket.
 * When set, all object keys are prefixed: {prefixPath}/{key}.
 * Must match the advance-rag worker's prefix_path config.
 */
const S3_PREFIX_PATH = config.s3.prefixPath;

/**
 * @description Prepend the configured S3 prefix path to an object key.
 * @param {string} key - The base object key
 * @returns {string} Prefixed key if S3_PREFIX_PATH is set, otherwise the original key
 */
function withPrefix(key: string): string {
    return S3_PREFIX_PATH ? `${S3_PREFIX_PATH}/${key}` : key;
}

/**
 * @description Service for managing RAG document files in S3-compatible storage.
 * Provides upload, download, delete, and file type detection capabilities.
 */
export class RagStorageService {
    /**
     * @description Build the hierarchical storage path for a document file.
     * Does NOT include the S3 prefix — use withPrefix() for the full S3 key.
     * The returned path is stored in the document.location DB column and must
     * be usable by the RAG worker, which applies its own prefix via decorators.
     * @param {string} datasetId - Dataset UUID
     * @param {string} fileId - File UUID
     * @param {string} filename - Original filename
     * @returns {string} Logical storage path: {tenant}/{dataset}/{file}/{filename}
     */
    buildStoragePath(datasetId: string, fileId: string, filename: string): string {
        return `${SYSTEM_TENANT_ID}/${datasetId}/${fileId}/${filename}`;
    }

    /**
     * @description Ensure the S3 bucket exists, creating it if necessary
     * @returns {Promise<void>}
     * @throws {Error} If bucket creation fails
     */
    async ensureBucket(): Promise<void> {
        try {
            const exists = await minioClient.bucketExists(S3_BUCKET);
            if (!exists) {
                await minioClient.makeBucket(S3_BUCKET);
                log.info('Created S3 bucket', { bucket: S3_BUCKET });
            }
        } catch (err) {
            log.error('Failed to ensure S3 bucket', { error: String(err) });
            throw err;
        }
    }

    /**
     * @description Upload a file to S3 storage, ensuring the bucket exists first
     * @param {string} storagePath - S3 object path
     * @param {Buffer} content - File content as a Buffer
     * @returns {Promise<void>}
     */
    async putFile(storagePath: string, content: Buffer): Promise<void> {
        await this.ensureBucket();
        const key = withPrefix(storagePath);
        await minioClient.putObject(S3_BUCKET, key, content, content.length);
        log.debug('Stored file in S3', { bucket: S3_BUCKET, path: key, size: content.length });
    }

    /**
     * @description Download a file from S3 as a Buffer (loads entire file into memory)
     * @param {string} storagePath - S3 object path (logical, without prefix)
     * @returns {Promise<Buffer>} File content as a Buffer
     */
    async getFile(storagePath: string): Promise<Buffer> {
        const stream = await minioClient.getObject(S3_BUCKET, withPrefix(storagePath));
        const chunks: Buffer[] = [];
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }

    /**
     * @description Get a readable stream for a file (for streaming downloads without buffering)
     * @param {string} storagePath - S3 object path (logical, without prefix)
     * @returns {Promise<Readable>} Readable stream of the file content
     */
    async getFileStream(storagePath: string): Promise<Readable> {
        return minioClient.getObject(S3_BUCKET, withPrefix(storagePath));
    }

    /**
     * @description Delete a file from S3 storage (best-effort, logs warnings on failure)
     * @param {string} storagePath - S3 object path (logical, without prefix)
     * @returns {Promise<void>}
     */
    async deleteFile(storagePath: string): Promise<void> {
        try {
            await minioClient.removeObject(S3_BUCKET, withPrefix(storagePath));
        } catch (err) {
            log.warn('Failed to delete file from S3', { path: storagePath, error: String(err) });
        }
    }

    /**
     * @description Check if a file exists in S3 storage
     * @param {string} storagePath - S3 object path (logical, without prefix)
     * @returns {Promise<boolean>} True if the file exists
     */
    async fileExists(storagePath: string): Promise<boolean> {
        try {
            await minioClient.statObject(S3_BUCKET, withPrefix(storagePath));
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @description Map a file extension to its MIME content type.
     * Falls back to 'application/octet-stream' for unknown extensions.
     * @param {string} suffix - File extension including the dot (e.g., '.pdf')
     * @returns {string} MIME type string
     */
    getContentType(suffix: string): string {
        const mimeMap: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.csv': 'text/csv',
            '.json': 'application/json',
            '.html': 'text/html',
            '.htm': 'text/html',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.tiff': 'image/tiff',
            '.svg': 'image/svg+xml',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
        };
        return mimeMap[suffix] || 'application/octet-stream';
    }

    /**
     * @description Map a file extension (without dot) to a RAGFlow file type category.
     * Categories: pdf, doc, visual, aural, other.
     * @param {string} suffix - File extension without dot (e.g., 'pdf', 'docx')
     * @returns {string} RAGFlow file type category
     */
    getFileType(suffix: string): string {
        const pdfTypes = new Set(['pdf']);
        const docTypes = new Set(['doc', 'docx', 'txt', 'md', 'csv', 'json', 'html', 'htm', 'xlsx', 'xls', 'pptx', 'ppt', 'eml']);
        const visualTypes = new Set(['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'gif']);
        const auralTypes = new Set(['mp3', 'wav', 'ogg', 'flac']);

        if (pdfTypes.has(suffix)) return 'pdf';
        if (docTypes.has(suffix)) return 'doc';
        if (visualTypes.has(suffix)) return 'visual';
        if (auralTypes.has(suffix)) return 'aural';
        return 'other';
    }
}

/** Singleton instance of the S3 storage service */
export const ragStorageService = new RagStorageService();
