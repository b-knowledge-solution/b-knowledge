
/**
 * @fileoverview Chat file upload service.
 * Handles file validation, S3 storage, and cleanup for chat attachments.
 *
 * Supported types: image/jpeg, image/png, image/gif, image/webp, application/pdf
 * Max size: 20MB per file
 * Retention: 30 days (auto-cleanup via expires_at)
 *
 * @module services/chat-file
 */

import { v4 as uuidv4 } from 'uuid'
import { minioClient } from '@/shared/services/minio.service.js'
import { log } from '@/shared/services/logger.service.js'
import { ModelFactory } from '@/shared/models/factory.js'
import type { ChatFile } from '../models/chat-file.model.js'
import { Readable } from 'stream'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Allowed MIME types for chat file uploads */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
])

/** Maximum file size in bytes (20MB) */
const MAX_FILE_SIZE = 20 * 1024 * 1024

/** File retention period in days */
const RETENTION_DAYS = 30

/** S3 bucket for chat files */
const S3_BUCKET = process.env['S3_BUCKET'] || 'ragflow'

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service class for chat file upload operations.
 * @description Manages file uploads to S3, metadata storage, and expiration cleanup.
 */
export class ChatFileService {
  /**
   * Validate a file's type and size before upload.
   * @param file - Multer file object
   * @returns Object with valid flag and optional error message
   */
  validateFile(file: { mimetype: string; size: number; originalname: string }): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return {
        valid: false,
        error: `File type "${file.mimetype}" is not allowed. Allowed types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      }
    }

    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File "${file.originalname}" exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }
    }

    return { valid: true }
  }

  /**
   * Upload a file to S3 and store metadata in the database.
   * @param file - Multer file object with buffer
   * @param sessionId - Chat session ID the file belongs to
   * @param userId - ID of the uploading user
   * @returns The created ChatFile record
   */
  async uploadFile(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    sessionId: string,
    userId: string,
  ): Promise<ChatFile> {
    const fileId = uuidv4()
    const s3Key = `chat-files/${sessionId}/${fileId}/${file.originalname}`

    // Ensure bucket exists
    try {
      const exists = await minioClient.bucketExists(S3_BUCKET)
      if (!exists) {
        await minioClient.makeBucket(S3_BUCKET)
        log.info('Created S3 bucket for chat files', { bucket: S3_BUCKET })
      }
    } catch (err) {
      log.error('Failed to ensure S3 bucket', { error: String(err) })
      throw err
    }

    // Upload to S3
    await minioClient.putObject(S3_BUCKET, s3Key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    })

    log.debug('Uploaded chat file to S3', { bucket: S3_BUCKET, key: s3Key, size: file.size })

    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + RETENTION_DAYS)

    // Store metadata in DB
    const chatFile = await ModelFactory.chatFile.create({
      id: fileId,
      session_id: sessionId,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
      s3_key: s3Key,
      s3_bucket: S3_BUCKET,
      uploaded_by: userId,
      expires_at: expiresAt,
    } as any)

    log.info('Chat file uploaded', { fileId, sessionId, name: file.originalname })
    return chatFile
  }

  /**
   * Get file content as a readable stream from S3.
   * @param fileId - The chat file ID
   * @returns Object with stream, mime type, and original name, or null if not found
   */
  async getFileContent(fileId: string): Promise<{
    stream: Readable
    mimeType: string
    originalName: string
    size: number
  } | null> {
    const chatFile = await ModelFactory.chatFile.findById(fileId)
    if (!chatFile) return null

    const stream = await minioClient.getObject(chatFile.s3_bucket, chatFile.s3_key)
    return {
      stream,
      mimeType: chatFile.mime_type,
      originalName: chatFile.original_name,
      size: Number(chatFile.size),
    }
  }

  /**
   * Get file metadata by ID.
   * @param fileId - The chat file ID
   * @returns The ChatFile record or undefined
   */
  async getFile(fileId: string): Promise<ChatFile | undefined> {
    return ModelFactory.chatFile.findById(fileId)
  }

  /**
   * Get multiple files by their IDs.
   * @param fileIds - Array of file IDs to look up
   * @returns Array of ChatFile records
   */
  async getFilesByIds(fileIds: string[]): Promise<ChatFile[]> {
    if (fileIds.length === 0) return []
    return ModelFactory.chatFile.getKnex().whereIn('id', fileIds)
  }

  /**
   * Generate a presigned URL for a file (for LLM consumption).
   * @param chatFile - The chat file record
   * @returns Presigned URL string
   */
  async getPresignedUrl(chatFile: ChatFile): Promise<string> {
    // Generate a presigned URL valid for 1 hour
    return minioClient.presignedGetObject(chatFile.s3_bucket, chatFile.s3_key, 3600)
  }

  /**
   * Clean up expired files from both S3 and the database.
   * @returns Number of files cleaned up
   */
  async cleanupExpired(): Promise<number> {
    const expired = await ModelFactory.chatFile.findExpired()
    if (expired.length === 0) return 0

    let cleaned = 0
    for (const file of expired) {
      try {
        // Delete from S3
        await minioClient.removeObject(file.s3_bucket, file.s3_key)
        // Delete from DB
        await ModelFactory.chatFile.delete(file.id)
        cleaned++
      } catch (err) {
        log.warn('Failed to clean up expired chat file', { fileId: file.id, error: String(err) })
      }
    }

    if (cleaned > 0) {
      log.info('Cleaned up expired chat files', { count: cleaned })
    }

    return cleaned
  }
}

/** Singleton instance of the chat file service */
export const chatFileService = new ChatFileService()
