/**
 * @description Project category type constants
 */

export const CategoryType = {
  DOCUMENTS: 'documents',
  CODE: 'code',
  STANDARD: 'standard',
} as const

export type CategoryTypeValue = (typeof CategoryType)[keyof typeof CategoryType]

/** Knowledge base item types */
export const KnowledgeBaseType = {
  DATASET: 'dataset',
} as const

export type KnowledgeBaseTypeValue = (typeof KnowledgeBaseType)[keyof typeof KnowledgeBaseType]
