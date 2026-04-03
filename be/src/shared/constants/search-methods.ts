/**
 * @description Search method and comparison operator constants
 */

/** RAG search method types */
export const SearchMethod = {
  FULL_TEXT: 'full_text',
  SEMANTIC: 'semantic',
  HYBRID: 'hybrid',
} as const

export type SearchMethodType = (typeof SearchMethod)[keyof typeof SearchMethod]

/** Metadata filter comparison operators */
export const ComparisonOperator = {
  EQ: 'eq',
  IS: 'is',
  IS_NOT: 'is_not',
  CONTAINS: 'contains',
  GT: 'gt',
  LT: 'lt',
  RANGE: 'range',
} as const

export type ComparisonOperatorType = (typeof ComparisonOperator)[keyof typeof ComparisonOperator]
