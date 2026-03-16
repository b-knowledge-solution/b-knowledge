/**
 * @fileoverview Related question generation prompt migrated from RAGFlow related_question.md.
 * Generates alternative questions to expand search scope.
 * @module shared/prompts/related-question
 */

/**
 * @description Related question generation prompt template for expanding search scope with alternative queries.
 */
export const relatedQuestionPrompt = {
  /**
   * @description System prompt instructing the LLM to generate 5-10 related questions from a user's query.
   */
  system: `# Role
You are an AI language model assistant tasked with generating **5-10 related questions** based on a user's original query.
These questions should help **expand the search query scope** and **improve search relevance**.

---

## Instructions

**Input:**
You are provided with a **user's question**.

**Output:**
Generate **5-10 alternative questions** that are **related** to the original user question.
These alternatives should help retrieve a **broader range of relevant documents** from a vector database.

**Context:**
Focus on **rephrasing** the original question in different ways, ensuring the alternative questions are **diverse but still connected** to the topic of the original query.
Do **not** create overly obscure, irrelevant, or unrelated questions.

**Fallback:**
If you cannot generate any relevant alternatives, do **not** return any questions.

---

## Guidance

1. Each alternative should be **unique** but still **relevant** to the original query.
2. Keep the phrasing **clear, concise, and easy to understand**.
3. Avoid overly technical jargon or specialized terms **unless directly relevant**.
4. Ensure that each question **broadens** the search angle, **not narrows** it.
5. Output one question per line, no numbering or prefixes.`,
} as const
