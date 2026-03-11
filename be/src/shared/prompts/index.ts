/**
 * @fileoverview Centralized prompt template registry for RAG pipeline.
 * Migrated from RAGFlow's rag/prompts/ directory.
 * All prompt templates are organized by feature domain.
 *
 * @module shared/prompts
 */

export { citationPrompt } from './citation.prompt.js'
export { keywordPrompt } from './keyword.prompt.js'
export { fullQuestionPrompt } from './full-question.prompt.js'
export { crossLanguagePrompt } from './cross-language.prompt.js'
export { sufficiencyCheckPrompt } from './sufficiency-check.prompt.js'
export { multiQueriesPrompt } from './multi-queries.prompt.js'
export { relatedQuestionPrompt } from './related-question.prompt.js'
export { askSummaryPrompt } from './ask-summary.prompt.js'
export { metaFilterPrompt } from './meta-filter.prompt.js'
export { graphragPrompt } from './graphrag.prompt.js'
export { sqlGenerationPrompt } from './sql-generation.prompt.js'
