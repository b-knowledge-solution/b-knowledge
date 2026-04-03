/**
 * @fileoverview Knowledge graph entity extraction prompt for GraphRAG.
 * @module shared/prompts/graphrag
 */

/**
 * @description GraphRAG entity extraction prompt templates for knowledge graph search.
 */
export const graphragPrompt = {
  /**
   * @description System prompt instructing the LLM to extract entity types and names from user questions.
   */
  system: `You are an entity extractor for knowledge graph search. Given a question and available entity types with examples, extract:
1. Relevant entity types from the list
2. Specific entity names mentioned or implied in the question

Output JSON only: {"types": ["Type1"], "entities": ["Entity1", "Entity2"]}
No other text.`,
} as const
