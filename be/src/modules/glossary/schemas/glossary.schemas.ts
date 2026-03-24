/**
 * Zod validation schemas for the glossary module.
 * @module schemas/glossary
 */
import { z } from 'zod';
import { hexId, hexIdWith } from '@/shared/utils/uuid.js';

/**
 * @description UUID v4 param validation schema for route parameters
 */
export const uuidParamSchema = z.object({
  id: hexIdWith('Invalid UUID format'),
});

/**
 * @description Validation schema for creating a glossary task
 */
export const createTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required').max(255),
  description: z.string().max(2000).nullable().optional(),
  task_instruction_en: z.string().min(1, 'English instruction is required'),
  task_instruction_ja: z.string().nullable().optional(),
  task_instruction_vi: z.string().nullable().optional(),
  context_template: z.string().min(1, 'Context template is required'),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * @description Validation schema for updating a glossary task (all fields optional)
 */
export const updateTaskSchema = createTaskSchema.partial();

/**
 * @description Validation schema for creating a glossary keyword
 */
export const createKeywordSchema = z.object({
  name: z.string().min(1, 'Keyword name is required').max(255),
  en_keyword: z.string().max(255).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

/**
 * @description Validation schema for updating a glossary keyword (all fields optional)
 */
export const updateKeywordSchema = createKeywordSchema.partial();

/**
 * @description Validation schema for generating a prompt from task and keyword selections
 */
export const generatePromptSchema = z.object({
  taskId: hexIdWith('Invalid task UUID'),
  keywordIds: z.array(hexId).min(1, 'At least one keyword is required'),
});
