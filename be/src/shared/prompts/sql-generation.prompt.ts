/**
 * @fileoverview SQL generation prompt for structured data retrieval.
 * @module shared/prompts/sql-generation
 */

/**
 * SQL generation prompt templates.
 */
export const sqlGenerationPrompt = {
  /**
   * Build the SQL generation system prompt.
   * @param tableName - OpenSearch index/table name
   * @param fieldDesc - Available fields description
   * @param isCount - Whether this is a count query
   * @returns System prompt string
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
