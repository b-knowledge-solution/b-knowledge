/**
 * @fileoverview Multi-query generation prompt migrated from RAGFlow multi_queries_gen.md.
 * Generates complementary queries when initial retrieval is insufficient.
 * @module shared/prompts/multi-queries
 */

/**
 * @description Multi-query generation prompt templates for generating complementary queries when initial retrieval is insufficient.
 */
export const multiQueriesPrompt = {
  /**
   * @description Build the multi-query generation prompt with context about retrieval gaps
   * @param {string} originalQuery - Original search query that returned insufficient results
   * @param {string} originalQuestion - Original user question in natural language
   * @param {string} retrievedDocs - Currently retrieved content from initial search
   * @param {string} missingInfo - List of missing information items identified by sufficiency check
   * @returns {string} Formatted prompt string for generating 2-3 complementary queries
   */
  build(originalQuery: string, originalQuestion: string, retrievedDocs: string, missingInfo: string): string {
    return `You are a query optimization expert.
The user's original query failed to retrieve sufficient information;
please generate multiple complementary improved questions and corresponding queries.

Original query:
${originalQuery}

Original question:
${originalQuestion}

Currently, retrieved content:
${retrievedDocs}

Missing information:
${missingInfo}

Please generate 2-3 complementary queries to help find the missing information. These queries should:
1. Focus on different missing information points.
2. Use different expressions.
3. Avoid being identical to the original query.
4. Remain concise and clear.

Output format (JSON):
\`\`\`json
{
    "reasoning": "Explanation of query generation strategy",
    "questions": [
        {"question": "Improved question 1", "query": "Improved query 1"},
        {"question": "Improved question 2", "query": "Improved query 2"},
        {"question": "Improved question 3", "query": "Improved query 3"}
    ]
}
\`\`\`

Requirements:
1. Questions array contains 1-3 questions and corresponding queries.
2. Each question length is between 5-200 characters.
3. Each query length is between 1-5 keywords.
4. Each query MUST be in the same language as the retrieved content.
5. DO NOT generate question and query that is similar to the original query.
6. Reasoning explains the generation strategy.`
  },
} as const
