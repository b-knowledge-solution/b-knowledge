/**
 * @fileoverview Knowledge base summarization prompt migrated from RAGFlow ask_summary.md.
 * Used as the default system prompt when no custom system prompt is configured.
 * @module shared/prompts/ask-summary
 */

/**
 * Knowledge base summarization prompt template.
 */
export const askSummaryPrompt = {
  /**
   * Build the system prompt with knowledge context.
   * @param knowledge - Formatted knowledge chunks text
   * @returns System prompt string
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
