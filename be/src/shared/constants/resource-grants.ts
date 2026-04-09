/**
 * @description Canonical resource_type values used in the `resource_grants`
 * table. Must match the check constraint introduced by the Phase 1 rename
 * migration.
 */
export const ResourceType = {
  KNOWLEDGE_BASE: 'knowledge_base',
  DOCUMENT_CATEGORY: 'document_category',
} as const

export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType]
