
/**
 * Zod validation schemas for chat dialog endpoints.
 * @module schemas/chat-dialog
 */
import { z } from 'zod'

/**
 * Schema for creating a new dialog.
 */
export const createDialogSchema = z.object({
  /** Display name for the dialog */
  name: z.string().min(1, 'Name is required').max(128),
  /** Description of the dialog */
  description: z.string().optional(),
  /** Icon identifier */
  icon: z.string().optional(),
  /** Knowledge base IDs to associate */
  kb_ids: z.array(z.string().uuid()).min(1, 'At least one knowledge base ID is required'),
  /** LLM model identifier */
  llm_id: z.string().optional(),
  /** Prompt configuration object */
  prompt_config: z.record(z.unknown()).optional(),
  /** Whether the dialog is publicly accessible */
  is_public: z.boolean().optional(),
})

/**
 * Schema for updating an existing dialog.
 */
export const updateDialogSchema = z.object({
  /** Display name for the dialog */
  name: z.string().min(1).max(128).optional(),
  /** Description of the dialog */
  description: z.string().optional(),
  /** Icon identifier */
  icon: z.string().optional(),
  /** Knowledge base IDs to associate */
  kb_ids: z.array(z.string().uuid()).optional(),
  /** LLM model identifier */
  llm_id: z.string().optional(),
  /** Prompt configuration object */
  prompt_config: z.record(z.unknown()).optional(),
  /** Whether the dialog is publicly accessible */
  is_public: z.boolean().optional(),
})

/**
 * Schema for setting dialog access control entries.
 * Validates the array of user/team access grants.
 */
export const dialogAccessSchema = z.object({
  /** Array of access entries to assign to the dialog */
  entries: z.array(
    z.object({
      /** Type of entity being granted access */
      entity_type: z.enum(['user', 'team']),
      /** UUID of the user or team */
      entity_id: z.string().uuid(),
    })
  ),
})

/**
 * Schema for dialog UUID path param.
 */
export const dialogIdParamSchema = z.object({
  id: z.string().uuid('Invalid dialog ID'),
})
