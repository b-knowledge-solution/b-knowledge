/**
 * @fileoverview Shared type definitions for metadata filtering.
 * Used by both Chat and Search config dialogs.
 * @module components/metadata-filter/metadata-filter.types
 */

/**
 * @description Metadata filter condition for RAG retrieval.
 */
export interface MetadataFilterCondition {
  /** Metadata field name */
  name: string
  /** Comparison operator */
  comparison_operator: 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'range'
  /** Comparison value */
  value: string | number | [number, number]
}

/**
 * @description Metadata filter configuration with logical grouping.
 */
export interface MetadataFilter {
  /** Logical operator between conditions */
  logic: 'and' | 'or'
  /** Array of filter conditions */
  conditions: MetadataFilterCondition[]
}
