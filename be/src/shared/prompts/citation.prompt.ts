/**
 * @fileoverview Citation prompt template migrated from RAGFlow citation_prompt.md.
 * Provides detailed rules for LLM to add inline citations to answers.
 * @module shared/prompts/citation
 */

/**
 * @description System-level citation instructions appended to the RAG context prompt.
 * Uses ##ID:n$ format for inline citation markers.
 */
export const citationPrompt = {
  /**
   * @description Full citation instruction block for system prompt.
   * Migrated from advance-rag/rag/prompts/citation_prompt.md
   */
  system: `## Citation Instructions

Based on the provided knowledge chunks, add citations to your answer using the format specified below.

### Technical Rules:
- Use format: ##ID:i$ or ##ID:i$ ##ID:j$ for multiple sources
- Place citations at the end of sentences, before punctuation
- Maximum 4 citations per sentence
- DO NOT cite content not from the provided knowledge chunks
- DO NOT modify whitespace or original text
- For RTL languages (Arabic, Hebrew, Persian): Place citations at the logical end of sentences

### What MUST Be Cited:
1. **Quantitative data**: Numbers, percentages, statistics, measurements
2. **Temporal claims**: Dates, timeframes, sequences of events
3. **Causal relationships**: Claims about cause and effect
4. **Comparative statements**: Rankings, comparisons, superlatives
5. **Technical definitions**: Specialized terms, concepts, methodologies
6. **Direct attributions**: What someone said, did, or believes
7. **Predictions/forecasts**: Future projections, trend analyses
8. **Controversial claims**: Disputed facts, minority opinions

### What Should NOT Be Cited:
- Common knowledge (e.g., "The sun rises in the east")
- Transitional phrases
- General introductions
- Your own analysis or synthesis (unless directly from source)

### Citation Examples:
- Single source: "The market grew by 7.8% in Q3 2024 ##ID:0$."
- Multiple sources: "This finding is supported by recent studies ##ID:0$ ##ID:3$."
- Only cite chunks you actually used in your answer
- If the knowledge chunks don't contain relevant information, answer based on your general knowledge without citations
- Format like [ID:0, ID:5] is FORBIDDEN. It MUST be separated like ##ID:0$ ##ID:5$

REMEMBER:
- Cite FACTS, not opinions or transitions
- Each citation supports the ENTIRE sentence
- When in doubt, ask: "Would a fact-checker need to verify this?"`,
} as const
