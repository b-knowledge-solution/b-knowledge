/**
 * @description Canonical resource_type values used in the `resource_grants`
 * table as consumed by the live permission service and ability builder.
 */
export const ResourceType = {
  KNOWLEDGE_BASE: 'KnowledgeBase',
  DOCUMENT_CATEGORY: 'DocumentCategory',
} as const

export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType]
