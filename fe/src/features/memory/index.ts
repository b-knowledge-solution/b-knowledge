/**
 * @fileoverview Barrel export for the memory feature module.
 *
 * Public API for the memory feature -- all external imports should go through this file.
 * Never import directly from internal files.
 *
 * @module features/memory
 */

// Types
export type {
  Memory,
  MemoryMessage,
  MemorySearchResult,
  MemoryStorageType,
  MemoryExtractionMode,
  MemoryPermission,
  MemoryScopeType,
  CreateMemoryDto,
  UpdateMemoryDto,
} from './types/memory.types'

// Constants + helpers
export { MemoryType, hasMemoryType } from './types/memory.types'

// API
export { memoryApi } from './api/memoryApi'
export {
  useMemories,
  useMemory,
  useCreateMemory,
  useUpdateMemory,
  useDeleteMemory,
  useMemoryMessages,
  useSearchMemoryMessages,
  useDeleteMemoryMessage,
  useForgetMemoryMessage,
} from './api/memoryQueries'

// Components
export { MemoryCard } from './components/MemoryCard'
