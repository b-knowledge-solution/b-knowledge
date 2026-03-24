/**
 * @fileoverview Type definitions for the glossary feature.
 * Centralizes all glossary-related types used across hooks and components.
 * @module features/glossary/types/glossary.types
 */

// ============================================================================
// Re-export entity types from API layer
// ============================================================================

export type {
    GlossaryTask,
    GlossaryKeyword,
    CreateTaskDto,
    CreateKeywordDto,
    BulkImportRow,
    BulkImportResult,
    BulkImportKeywordRow,
    BulkImportKeywordResult,
    KeywordSearchParams,
    KeywordSearchResult,
} from '../api/glossaryApi'

// ============================================================================
// Form data types
// ============================================================================

/** @description Form data shape for the keyword create/edit form. */
export interface KeywordFormData {
    name: string
    en_keyword: string
    description: string
    sort_order: number
    is_active: boolean
}

/** @description Form data shape for the task create/edit form. */
export interface TaskFormData {
    name: string
    description: string
    task_instruction_en: string
    task_instruction_ja: string
    task_instruction_vi: string
    context_template: string
    sort_order: number
    is_active: boolean
}
