/**
 * S3-compatible storage service for RAG document files.
 *
 * Handles file upload/download to S3-compatible storage (RustFS/MinIO/etc.),
 * matching the same bucket/path conventions used by the Python advance-rag task executor.
 *
 * Storage path convention: {SYSTEM_TENANT_ID}/{dataset_id}/{file_id}/{filename}
 */

import { minioClient } from '@/shared/services/minio.service.js';
import { log } from '@/shared/services/logger.service.js';
import { Readable } from 'stream';

const SYSTEM_TENANT_ID = process.env['SYSTEM_TENANT_ID'] || '00000000-0000-0000-0000-000000000001';

/**
 * The S3 bucket name. Uses tenant_id as bucket in multi-bucket mode,
 * or a configured default bucket via S3_BUCKET env var.
 */
const S3_BUCKET = process.env['S3_BUCKET'] || 'ragflow';

export class RagStorageService {
    /**
     * Build the storage path for a document file.
     */
    buildStoragePath(datasetId: string, fileId: string, filename: string): string {
        return `${SYSTEM_TENANT_ID}/${datasetId}/${fileId}/${filename}`;
    }

    /**
     * Ensure the bucket exists.
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
     * Upload a file to S3 storage.
     */
    async putFile(storagePath: string, content: Buffer): Promise<void> {
        await this.ensureBucket();
        await minioClient.putObject(S3_BUCKET, storagePath, content, content.length);
        log.debug('Stored file in S3', { bucket: S3_BUCKET, path: storagePath, size: content.length });
    }

    /**
     * Download a file from S3 as a Buffer.
     */
    async getFile(storagePath: string): Promise<Buffer> {
        const stream = await minioClient.getObject(S3_BUCKET, storagePath);
        const chunks: Buffer[] = [];
        return new Promise((resolve, reject) => {
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }

    /**
     * Get a readable stream for a file (for streaming downloads).
     */
    async getFileStream(storagePath: string): Promise<Readable> {
        return minioClient.getObject(S3_BUCKET, storagePath);
    }

    /**
     * Delete a file from S3.
     */
    async deleteFile(storagePath: string): Promise<void> {
        try {
            await minioClient.removeObject(S3_BUCKET, storagePath);
        } catch (err) {
            log.warn('Failed to delete file from S3', { path: storagePath, error: String(err) });
        }
    }

    /**
     * Check if a file exists.
     */
    async fileExists(storagePath: string): Promise<boolean> {
        try {
            await minioClient.statObject(S3_BUCKET, storagePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the MIME content type for a file extension.
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
     * Map file extension to RAGFlow file type category.
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

export const ragStorageService = new RagStorageService();
