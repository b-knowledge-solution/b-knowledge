
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

import { minioClient } from '@/shared/services/minio.service.js'
import { getUuid } from '@/shared/utils/uuid.js'
import { log } from '@/shared/services/logger.service.js'
import { config } from '@/shared/config/index.js'
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

/** S3 bucket for chat files — sourced from centralized config */
const S3_BUCKET = config.s3.bucket

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Service class for chat file upload operations.
 * @description Manages file uploads to S3, metadata storage, and expiration cleanup.
 */
export class ChatFileService {
  /**
   * @description Validate a file's type and size before upload.
   * @param {{ mimetype: string; size: number; originalname: string }} file - Multer file object
   * @returns {{ valid: boolean; error?: string }} Object with valid flag and optional error message
   */
  validateFile(file: { mimetype: string; size: number; originalname: string }): { valid: boolean; error?: string } {
    // Reject unsupported file types (only images and PDFs allowed)
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return {
        valid: false,
        error: `File type "${file.mimetype}" is not allowed. Allowed types: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      }
    }

    // Reject files exceeding the 20MB size limit
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File "${file.originalname}" exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      }
    }

    return { valid: true }
  }

  /**
   * @description Upload a file to S3 and store metadata in the database.
   * Creates the S3 bucket if it does not exist, uploads the file, and persists metadata.
   * @param {{ originalname: string; mimetype: string; size: number; buffer: Buffer }} file - Multer file object with buffer
   * @param {string} sessionId - Chat session ID the file belongs to
   * @param {string} userId - ID of the uploading user
   * @returns {Promise<ChatFile>} The created ChatFile record
   * @throws {Error} If S3 bucket creation or file upload fails
   */
  async uploadFile(
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    sessionId: string,
    userId: string,
  ): Promise<ChatFile> {
    const fileId = getUuid()
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
   * @description Get file content as a readable stream from S3.
   * @param {string} fileId - The chat file ID
   * @returns {Promise<{ stream: Readable; mimeType: string; originalName: string; size: number } | null>} Object with stream, mime type, and original name, or null if not found
   */
  async getFileContent(fileId: string): Promise<{
    stream: Readable
    mimeType: string
    originalName: string
    size: number
  } | null> {
    // Look up file metadata in the database
    const chatFile = await ModelFactory.chatFile.findById(fileId)
    if (!chatFile) return null

    // Stream file content directly from S3 without buffering
    const stream = await minioClient.getObject(chatFile.s3_bucket, chatFile.s3_key)
    return {
      stream,
      mimeType: chatFile.mime_type,
      originalName: chatFile.original_name,
      size: Number(chatFile.size),
    }
  }

  /**
   * @description Get file metadata by ID.
   * @param {string} fileId - The chat file ID
   * @returns {Promise<ChatFile | undefined>} The ChatFile record or undefined if not found
   */
  async getFile(fileId: string): Promise<ChatFile | undefined> {
    return ModelFactory.chatFile.findById(fileId)
  }

  /**
   * @description Get multiple files by their IDs.
   * @param {string[]} fileIds - Array of file IDs to look up
   * @returns {Promise<ChatFile[]>} Array of ChatFile records
   */
  async getFilesByIds(fileIds: string[]): Promise<ChatFile[]> {
    // Short-circuit for empty input to avoid unnecessary DB query
    if (fileIds.length === 0) return []
    return ModelFactory.chatFile.findByIds(fileIds)
  }

  /**
   * @description Generate a presigned URL for a file (for LLM consumption).
   * URL is valid for 1 hour.
   * @param {ChatFile} chatFile - The chat file record
   * @returns {Promise<string>} Presigned URL string
   */
  async getPresignedUrl(chatFile: ChatFile): Promise<string> {
    // Generate a presigned URL valid for 1 hour
    return minioClient.presignedGetObject(chatFile.s3_bucket, chatFile.s3_key, 3600)
  }

  /**
   * @description Clean up expired files from both S3 and the database.
   * Iterates expired files and removes them individually, logging any failures.
   * @returns {Promise<number>} Number of files cleaned up
   */
  async cleanupExpired(): Promise<number> {
    // Fetch all files past their expiration date
    const expired = await ModelFactory.chatFile.findExpired()
    // Short-circuit if nothing to clean
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
