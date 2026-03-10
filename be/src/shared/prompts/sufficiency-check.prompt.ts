/**
 * @fileoverview Sufficiency check prompt migrated from RAGFlow sufficiency_check.md.
 * Evaluates whether retrieved context is adequate to answer a question.
 * @module shared/prompts/sufficiency-check
 */

/**
 * Sufficiency check prompt templates.
 */
export const sufficiencyCheckPrompt = {
  /**
   * Build the sufficiency evaluation prompt.
   * @param question - User's question
   * @param retrievedDocs - Retrieved context content
   * @returns Formatted prompt string
   */
  build(question: string, retrievedDocs: string): string {
    return `You are a information retrieval evaluation expert. Please assess whether the currently retrieved content is sufficient to answer the user's question.

User question:
${question}

Retrieved content:
${retrievedDocs}

Please determine whether these content are sufficient to answer the user's question.

Output format (JSON):
\`\`\`json
{
    "is_sufficient": true/false,
    "reasoning": "Your reasoning for the judgment",
    "missing_information": ["Missing information 1", "Missing information 2"]
}
\`\`\`

Requirements:
1. If the retrieved content contains key information needed to answer the query, judge as sufficient (true).
2. If key information is missing, judge as insufficient (false), and list the missing information.
3. The \`reasoning\` should be concise and clear.
4. The \`missing_information\` should only be filled when insufficient, otherwise empty array.`
  },
} as const
