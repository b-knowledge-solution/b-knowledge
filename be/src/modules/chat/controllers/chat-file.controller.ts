
/**
 * @fileoverview Chat file upload controller.
 * Handles HTTP requests for uploading and retrieving chat file attachments.
 *
 * @module controllers/chat-file
 */

import { Request, Response } from 'express'
import { log } from '@/shared/services/logger.service.js'
import { chatFileService } from '../services/chat-file.service.js'

/**
 * Controller class for chat file upload endpoints.
 */
export class ChatFileController {
  /**
   * Upload files to a conversation.
   * @description Handles multipart/form-data uploads via multer.
   * Validates each file's type and size, uploads to S3, and returns metadata.
   * @param req - Express request with files array and :id param
   * @param res - Express response
   */
  async uploadFiles(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const sessionId = req.params.id
      const files = req.files as Express.Multer.File[] | undefined

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files provided' })
        return
      }

      // Validate all files before uploading any
      const validationErrors: string[] = []
      for (const file of files) {
        const result = chatFileService.validateFile(file)
        if (!result.valid) {
          validationErrors.push(result.error!)
        }
      }

      if (validationErrors.length > 0) {
        res.status(400).json({ error: validationErrors.join('; ') })
        return
      }

      // Upload all validated files
      const uploaded = await Promise.all(
        files.map((file) => chatFileService.uploadFile(file, sessionId!, userId)),
      )

      res.status(201).json(uploaded)
    } catch (error) {
      log.error('Error uploading chat files', { error: (error as Error).message })
      res.status(500).json({ error: (error as Error).message })
    }
  }

  /**
   * Get file content by streaming from S3.
   * @description Streams the file with correct Content-Type header.
   * @param req - Express request with :fileId param
   * @param res - Express response
   */
  async getFileContent(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.id
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const { fileId } = req.params

      const result = await chatFileService.getFileContent(fileId!)
      if (!result) {
        res.status(404).json({ error: 'File not found' })
        return
      }

      // Set response headers for file streaming
      res.setHeader('Content-Type', result.mimeType)
      res.setHeader('Content-Length', result.size)
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.originalName)}"`)

      // Pipe the S3 stream to the response
      result.stream.pipe(res)
    } catch (error) {
      log.error('Error getting chat file content', { error: (error as Error).message })
      res.status(500).json({ error: (error as Error).message })
    }
  }
}
