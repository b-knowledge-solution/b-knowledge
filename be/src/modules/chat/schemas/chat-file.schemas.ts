
/**
 * Zod validation schemas for chat file upload endpoints.
 * @module schemas/chat-file
 */
import { z } from 'zod'
import { hexId, hexIdWith } from '@/shared/utils/uuid.js'

/**
 * @description Schema for the conversation ID path parameter on file upload.
 */
export const fileUploadParamsSchema = z.object({
  id: hexIdWith('Invalid conversation ID'),
})

/**
 * @description Schema for the file ID path parameter on file content retrieval.
 */
export const fileContentParamsSchema = z.object({
  fileId: hexIdWith('Invalid file ID'),
})
