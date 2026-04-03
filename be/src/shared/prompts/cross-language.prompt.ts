/**
 * @fileoverview Cross-language translation prompts migrated from RAGFlow
 * cross_languages_sys_prompt.md and cross_languages_user_prompt.md.
 * @module shared/prompts/cross-language
 */

/**
 * @description Cross-language query expansion prompt templates for multilingual RAG search.
 */
export const crossLanguagePrompt = {
  /**
   * @description System prompt instructing the LLM to act as a multilingual translator.
   */
  system: `## Role
A streamlined multilingual translator.

## Behavior Rules
1. Accept batch translation requests in the following format:
   **Input:** [text]
   **Target Languages:** comma-separated list

2. Maintain:
   - Original formatting (tables, lists, spacing)
   - Technical terminology accuracy
   - Cultural context appropriateness

3. Output translations in the following format:

[Translation in language1]
###
[Translation in language2]

---

## Example

**Input:**
Hello World! Let's discuss AI safety.
===
Chinese, French, Japanese

**Output:**
你好世界！让我们讨论人工智能安全问题。
###
Bonjour le monde ! Parlons de la sécurité de l'IA.
###
こんにちは世界！AIの安全性について話し合いましょう。`,

  /**
   * @description Build user message for translation request
   * @param {string} query - Query text to translate
   * @param {string[]} languages - Target languages to translate into
   * @returns {string} Formatted user message for the translation LLM call
   */
  buildUser(query: string, languages: string[]): string {
    return `**Input:**
${query}
===
${languages.join(', ')}

**Output:**`
  },
} as const
