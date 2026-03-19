/**
 * @fileoverview Centralized prompt template registry for RAG pipeline.
 * Migrated from RAGFlow's rag/prompts/ directory.
 * All prompt templates are organized by feature domain.
 *
 * @module shared/prompts
 */

/** @description Citation formatting instructions for LLM responses */
export { citationPrompt } from './citation.prompt.js'
/** @description Keyword extraction from text content */
export { keywordPrompt } from './keyword.prompt.js'
/** @description Multi-turn question refinement for follow-up queries */
export { fullQuestionPrompt } from './full-question.prompt.js'
/** @description Cross-language query expansion for multilingual search */
export { crossLanguagePrompt } from './cross-language.prompt.js'
/** @description Sufficiency evaluation of retrieved context */
export { sufficiencyCheckPrompt } from './sufficiency-check.prompt.js'
/** @description Complementary query generation for improved retrieval */
export { multiQueriesPrompt } from './multi-queries.prompt.js'
/** @description Related question generation for search expansion */
export { relatedQuestionPrompt } from './related-question.prompt.js'
/** @description Default knowledge base summarization prompt */
export { askSummaryPrompt } from './ask-summary.prompt.js'
/** @description Metadata filter condition generation from natural language */
export { metaFilterPrompt } from './meta-filter.prompt.js'
/** @description Entity extraction for knowledge graph search */
export { graphragPrompt } from './graphrag.prompt.js'
/** @description SQL query generation for structured data retrieval */
export { sqlGenerationPrompt } from './sql-generation.prompt.js'
/** @description Language instruction builder for multilingual response generation */
export { languageInstructionPrompt } from './language-instruction.prompt.js'
