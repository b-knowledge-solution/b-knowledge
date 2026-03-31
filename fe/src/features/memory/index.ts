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
  useImportChatHistory,
} from './api/memoryQueries'

// Components
export { MemoryCard } from './components/MemoryCard'
export { MemoryMessageTable } from './components/MemoryMessageTable'
export { MemorySettingsPanel } from './components/MemorySettingsPanel'
export { ImportHistoryDialog } from './components/ImportHistoryDialog'

// Pages (default exports for lazy loading -- import via React.lazy() in App.tsx)
// MemoryListPage: ./pages/MemoryListPage
// MemoryDetailPage: ./pages/MemoryDetailPage
