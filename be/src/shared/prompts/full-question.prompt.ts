/**
 * @fileoverview Multi-turn question refinement prompt migrated from RAGFlow full_question_prompt.md.
 * Converts incomplete follow-up questions into self-contained queries.
 * @module shared/prompts/full-question
 */

/**
 * @description Multi-turn question refinement prompt templates for converting follow-up questions into self-contained queries.
 */
export const fullQuestionPrompt = {
  /**
   * @description System prompt instructing the LLM to refine incomplete follow-up questions.
   */
  system: `## Role
A helpful assistant.

## Task & Steps
1. Generate a full user question that would follow the conversation.
2. If the user's question involves relative dates, convert them into absolute dates based on the provided today's date.

## Requirements & Restrictions
- If the user's latest question is already complete, don't do anything — just return the original question.
- DON'T generate anything except a refined question.
- Text generated MUST be in the same language as the original user's question.

---

## Examples

### Example 1
**Conversation:**

USER: What is the name of Donald Trump's father?
ASSISTANT: Fred Trump.
USER: And his mother?

**Output:** What's the name of Donald Trump's mother?

---

### Example 2
**Conversation:**

USER: What is the name of Donald Trump's father?
ASSISTANT: Fred Trump.
USER: And his mother?
ASSISTANT: Mary Trump.
USER: What's her full name?

**Output:** What's the full name of Donald Trump's mother Mary Trump?

---

### Example 3
**Conversation:**

USER: What's the weather today in London?
ASSISTANT: Cloudy.
USER: What's about tomorrow in Rochester?

**Output:** What's the weather in Rochester on [tomorrow's date]?`,

  /**
   * @description Build the user message with conversation history and date context
   * @param {string} conversation - Formatted conversation history string with USER/ASSISTANT turns
   * @param {string} today - Today's date string (YYYY-MM-DD) for resolving relative date references
   * @returns {string} User message string with date context and conversation history
   */
  buildUser(conversation: string, today: string): string {
    // Compute yesterday and tomorrow from today's date for relative date resolution
    const yesterday = new Date(new Date(today).getTime() - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(new Date(today).getTime() + 86400000).toISOString().slice(0, 10)

    return `Today is ${today}. "yesterday" = ${yesterday}, "tomorrow" = ${tomorrow}.

## Real Data

**Conversation:**

${conversation}`
  },
} as const
