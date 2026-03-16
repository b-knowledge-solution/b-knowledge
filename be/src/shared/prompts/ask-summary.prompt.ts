/**
 * @fileoverview Knowledge base summarization prompt migrated from RAGFlow ask_summary.md.
 * Used as the default system prompt when no custom system prompt is configured.
 * @module shared/prompts/ask-summary
 */

/**
 * @description Knowledge base summarization prompt template used as default when no custom system prompt is configured.
 */
export const askSummaryPrompt = {
  /**
   * @description Build the system prompt with injected knowledge context for RAG summarization
   * @param {string} knowledge - Formatted knowledge chunks text from retrieval
   * @returns {string} Complete system prompt string with knowledge context embedded
   */
  build(knowledge: string): string {
    return `Role: You're a smart assistant. Your name is Miss R.
Task: Summarize the information from knowledge bases and answer user's question.
Requirements and restriction:
  - DO NOT make things up, especially for numbers.
  - If the information from knowledge is irrelevant with user's question, JUST SAY: Sorry, no relevant information provided.
  - Answer with markdown format text.
  - Answer in language of user's question.
  - DO NOT make things up, especially for numbers.

### Information from knowledge bases

${knowledge}

The above is information from knowledge bases.`
  },
} as const
