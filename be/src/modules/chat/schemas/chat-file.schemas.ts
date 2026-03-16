
/**
 * Zod validation schemas for chat file upload endpoints.
 * @module schemas/chat-file
 */
import { z } from 'zod'

/**
 * Schema for the conversation ID path parameter on file upload.
 */
export const fileUploadParamsSchema = z.object({
  id: z.string().uuid('Invalid conversation ID'),
})

/**
 * Schema for the file ID path parameter on file content retrieval.
 */
export const fileContentParamsSchema = z.object({
  fileId: z.string().uuid('Invalid file ID'),
})
