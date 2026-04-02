/**
 * @fileoverview Barrel export for the memory module.
 *
 * Public API for the memory module -- all external imports should go through this file.
 * Never import directly from internal files.
 *
 * @module modules/memory
 */

// Model + interface
export { MemoryModel } from './models/memory.model.js'
export type { Memory } from './models/memory.model.js'

// Zod schemas + inferred types
export {
  createMemorySchema,
  updateMemorySchema,
  queryMemoryMessagesSchema,
  memoryIdParamSchema,
} from './schemas/memory.schemas.js'
export type {
  CreateMemoryDto,
  UpdateMemoryDto,
  QueryMemoryMessagesDto,
} from './schemas/memory.schemas.js'

// Services
export { memoryService } from './services/memory.service.js'
export { memoryMessageService } from './services/memory-message.service.js'
export type { MemoryMessageDoc, MemorySearchResult } from './services/memory-message.service.js'
export { memoryExtractionService } from './services/memory-extraction.service.js'

// Controller
export { memoryController } from './controllers/memory.controller.js'

// Routes (default export)
export { default as memoryRoutes } from './routes/memory.routes.js'

// Extraction prompt templates
export {
  SEMANTIC_EXTRACTION_PROMPT,
  EPISODIC_EXTRACTION_PROMPT,
  PROCEDURAL_EXTRACTION_PROMPT,
  RAW_EXTRACTION_PROMPT,
  MEMORY_RANK_PROMPT,
} from './prompts/extraction.prompts.js'
export type { PromptTemplate } from './prompts/extraction.prompts.js'
