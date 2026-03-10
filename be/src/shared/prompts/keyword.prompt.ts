/**
 * @fileoverview Keyword extraction prompt migrated from RAGFlow keyword_prompt.md.
 * @module shared/prompts/keyword
 */

/**
 * Keyword extraction prompt templates.
 */
export const keywordPrompt = {
  /**
   * Build keyword extraction prompt.
   * @param content - Text content to extract keywords from
   * @param topN - Number of keywords to extract
   * @returns Formatted prompt string
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
