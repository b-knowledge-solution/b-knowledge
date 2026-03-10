/**
 * @fileoverview Metadata filtering prompt migrated from RAGFlow meta_filter.md.
 * Generates JSON filter conditions from user queries for document metadata filtering.
 * @module shared/prompts/meta-filter
 */

/**
 * Metadata filter prompt template.
 */
export const metaFilterPrompt = {
  /**
   * Build the metadata filter generation prompt.
   * @param currentDate - Today's date (YYYY-MM-DD)
   * @param metadataKeys - JSON string of available metadata structure
   * @param userQuestion - User's question
   * @param constraints - Optional operator constraints per key
   * @returns Formatted prompt string
   */
  build(currentDate: string, metadataKeys: string, userQuestion: string, constraints?: string): string {
    return `You are a metadata filtering condition generator. Analyze the user's question and available document metadata to output a JSON array of filter objects. Follow these rules:

1. **Metadata Structure**:
   - Metadata is provided as JSON where keys are attribute names (e.g., "color"), and values are objects mapping attribute values to document IDs.

2. **Output Requirements**:
   - Always output a JSON dictionary with only 2 keys: 'conditions'(filter objects) and 'logic' between the conditions ('and' or 'or').
   - Each filter object in conditions must have:
        "key": (metadata attribute name),
        "value": (string value to compare),
        "op": (operator from allowed list)
   - Logic between all the conditions: 'and'(Intersection of results for each condition) / 'or' (union of results for all conditions)

3. **Operator Guide**:
   - Use these operators only: ["contains", "not contains","in", "not in", "start with", "end with", "empty", "not empty", "=", "≠", ">", "<", "≥", "≤"]
   - Date ranges: Break into two conditions (≥ start_date AND < next_month_start)
   - Negations: Always use "≠" for exclusion terms ("not", "except", "exclude", "≠")
   - Implicit logic: Derive unstated filters (e.g., "July" → [≥ YYYY-07-01, < YYYY-08-01])

4. **Processing Steps**:
   a) Identify ALL filterable attributes in the query (both explicit and implicit)
   b) For dates:
        - Infer missing year from current date if needed
        - Always format dates as "YYYY-MM-DD"
        - Convert ranges: [≥ start, < end]
   c) For values: Match EXACTLY to metadata's value keys
   d) Skip conditions if:
        - Attribute doesn't exist in metadata
        - Value has no match in metadata

5. **Final Output**:
   - ONLY output valid JSON dictionary
   - NO additional text/explanations

**Current Task**:
- Today's date: ${currentDate}
- Available metadata keys: ${metadataKeys}
- User query: "${userQuestion}"${constraints ? `\n- Operator constraints: ${constraints}` : ''}`
  },
} as const
