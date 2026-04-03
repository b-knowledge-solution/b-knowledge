
/**
 * @fileoverview Shared RAG query utilities for cross-language expansion
 * and keyword extraction. Used by both chat and search pipelines.
 *
 * @module shared/services/rag-query
 */

import { llmClientService, LlmMessage } from '@/shared/services/llm-client.service.js'
import { crossLanguagePrompt, keywordPrompt } from '@/shared/prompts/index.js'
import { log } from '@/shared/services/logger.service.js'
import type { LangfuseParent } from '@/shared/services/langfuse.service.js'

/**
 * Expand query with cross-language translations for multilingual retrieval.
 * @description Uses the LLM to translate the query into target languages,
 * appending translations to the original for broader retrieval coverage.
 * Falls back to the original query on error.
 * @param query - Original query text
 * @param targetLanguages - Comma-separated language list (e.g. "English,Japanese,Vietnamese")
 * @param providerId - LLM provider ID
 * @param parent - Optional Langfuse parent for tracing
 * @returns Expanded query with translations appended
 */
export async function expandCrossLanguage(
  query: string,
  targetLanguages: string,
  providerId?: string,
  parent?: LangfuseParent
): Promise<string> {
  // Use RAGFlow's cross-language prompt with proper formatting rules
  const languages = targetLanguages.split(',').map(l => l.trim())
  const prompt: LlmMessage[] = [
    {
      role: 'system',
      content: crossLanguagePrompt.system,
    },
    {
      role: 'user',
      content: crossLanguagePrompt.buildUser(query, languages),
    },
  ]

  try {
    const translations = await llmClientService.chatCompletion(prompt, {
      providerId,
      temperature: 0.1,
      max_tokens: 512,
    }, parent)
    // Append translations to original query for broader retrieval
    return `${query}\n${translations.trim()}`
  } catch (err) {
    log.warn('Cross-language expansion failed', { error: String(err) })
    return query
  }
}

/**
 * Extract keywords from query for enhanced keyword-based retrieval.
 * @description Uses the LLM to identify key terms from the user query,
 * returning them as an array. Falls back to an empty array on error.
 * @param query - User query text
 * @param providerId - LLM provider ID
 * @param parent - Optional Langfuse parent for tracing
 * @returns Array of extracted keywords
 */
export async function extractKeywords(
  query: string,
  providerId?: string,
  parent?: LangfuseParent
): Promise<string[]> {
  // Use RAGFlow's keyword extraction prompt with structured template
  const prompt: LlmMessage[] = [
    {
      role: 'user',
      content: keywordPrompt.build(query, 8),
    },
  ]

  try {
    const result = await llmClientService.chatCompletion(prompt, {
      providerId,
      temperature: 0.1,
      max_tokens: 128,
    }, parent)
    return result.split(',').map(k => k.trim()).filter(Boolean)
  } catch (err) {
    log.warn('Keyword extraction failed', { error: String(err) })
    return []
  }
}
