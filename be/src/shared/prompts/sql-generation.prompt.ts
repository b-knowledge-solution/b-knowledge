/**
 * @fileoverview SQL generation prompt for structured data retrieval.
 * @module shared/prompts/sql-generation
 */

/**
 * @description SQL generation prompt templates for converting natural language to OpenSearch SQL queries.
 */
export const sqlGenerationPrompt = {
  /**
   * @description Build the SQL generation system prompt with table schema context
   * @param {string} tableName - OpenSearch index/table name to query against
   * @param {string} fieldDesc - Available fields description including types and semantics
   * @param {boolean} isCount - Whether this is a count query (uses COUNT(*) vs LIMIT)
   * @returns {string} System prompt string for SQL generation
   */
  build(tableName: string, fieldDesc: string, isCount: boolean): string {
    return `You are a SQL expert. Generate an OpenSearch SQL query for the given question.

Table: ${tableName}
Available fields:
${fieldDesc}

Rules:
- Use OpenSearch SQL syntax (similar to MySQL)
- Always filter by kb_id
- Output ONLY the SQL query, no explanation
- Do NOT use backticks or SQL code fences
- Use LIKE with wildcards for text matching
- Use single quotes for string values
${isCount ? '- This is a count question, use COUNT(*)' : '- LIMIT results to 50 rows max'}`
  },
} as const
