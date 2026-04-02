
/**
 * @fileoverview Shared service for generating related questions from a user query via LLM.
 * Extracted from SearchService to enable reuse across search, chat, and embed modules.
 *
 * @module shared/services/related-questions
 */

import { llmClientService } from '@/shared/services/llm-client.service.js'
import { relatedQuestionPrompt } from '@/shared/prompts/index.js'

/**
 * @description Shared singleton service that generates related questions from a user query
 *   using the related question prompt and an LLM provider
 */
export class RelatedQuestionsService {
  /**
   * @description Generate related questions for a given query using LLM completion
   * @param {string} query - The original user query to generate related questions from
   * @param {string} [providerId] - Optional LLM provider ID to use for generation
   * @returns {Promise<string[]>} Array of related question strings (5-10 questions)
   */
  async generateRelatedQuestions(query: string, providerId?: string): Promise<string[]> {
    const response = await llmClientService.chatCompletion(
      [
        { role: 'system', content: relatedQuestionPrompt.system },
        { role: 'user', content: query },
      ],
      { providerId }
    )

    // Parse response lines into array, filtering empty lines
    return response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  }
}

/** @description Singleton instance of the related questions service */
export const relatedQuestionsService = new RelatedQuestionsService()
