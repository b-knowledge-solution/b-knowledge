
/**
 * @fileoverview Chat file upload routes.
 * Defines endpoints for uploading and retrieving chat file attachments.
 *
 * @module routes/chat-file
 */
import { Router } from 'express'
import multer from 'multer'
import { ChatFileController } from '../controllers/chat-file.controller.js'
import { requireAuth } from '@/shared/middleware/auth.middleware.js'
import { validate } from '@/shared/middleware/validate.middleware.js'
import { fileUploadParamsSchema, fileContentParamsSchema } from '../schemas/chat-file.schemas.js'

const router = Router()
const controller = new ChatFileController()
// Use in-memory storage for multer — files are streamed to S3 after validation
const upload = multer({ storage: multer.memoryStorage() })

/**
 * @route POST /api/chat/conversations/:id/files
 * @description Upload files to a chat conversation (max 5 files).
 * @access Private
 */
router.post(
  '/conversations/:id/files',
  requireAuth,
  validate({ params: fileUploadParamsSchema }),
  upload.array('files', 5),
  controller.uploadFiles.bind(controller),
)

/**
 * @route GET /api/chat/files/:fileId/content
 * @description Stream file content with correct Content-Type.
 * @access Private
 */
router.get(
  '/files/:fileId/content',
  requireAuth,
  validate({ params: fileContentParamsSchema }),
  controller.getFileContent.bind(controller),
)

export default router
