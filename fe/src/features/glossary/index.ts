/**
 * @fileoverview Barrel exports for the glossary feature module.
 * Exports only what is necessary for other features to consume.
 * @module features/glossary
 */

// API
export { glossaryApi } from './api/glossaryApi'

// Query hooks
export { useGlossaryKeywords, useGlossaryTasks } from './api/glossaryQueries'
export type { UseGlossaryKeywordsReturn, UseGlossaryTasksReturn } from './api/glossaryQueries'

// Components
export { PromptBuilderModal } from '@/components/PromptBuilderModal'

// Types
export type {
    GlossaryTask,
    GlossaryKeyword,
    CreateTaskDto,
    CreateKeywordDto,
    BulkImportRow,
    BulkImportResult,
} from './api/glossaryApi'

export type {
    KeywordFormData,
    TaskFormData,
} from './types/glossary.types'
