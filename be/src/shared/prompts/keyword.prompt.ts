/**
 * @fileoverview Keyword extraction prompt migrated from RAGFlow keyword_prompt.md.
 * @module shared/prompts/keyword
 */

/**
 * @description Keyword extraction prompt templates for extracting important terms from text content.
 */
export const keywordPrompt = {
  /**
   * @description Build keyword extraction prompt for LLM call
   * @param {string} content - Text content to extract keywords from
   * @param {number} topN - Number of keywords to extract (defaults to 5)
   * @returns {string} Formatted prompt string for keyword extraction
   */
  build(content: string, topN: number = 5): string {
    return `## Role
You are a text analyzer.

## Task
Extract the most important keywords/phrases of a given piece of text content.

## Requirements
- Summarize the text content, and give the top ${topN} important keywords/phrases.
- The keywords MUST be in the same language as the given piece of text content.
- The keywords are delimited by ENGLISH COMMA.
- Include synonyms and related terms that would help find relevant documents.
- Output keywords ONLY.

---

## Text Content
${content}`
  },
} as const
