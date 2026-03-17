/**
 * @fileoverview Shared type definitions for metadata filtering.
 * Used by both Chat and Search config dialogs.
 * @module components/metadata-filter/metadata-filter.types
 */

/**
 * @description Metadata filter condition for RAG retrieval.
 * Each condition filters documents by a metadata field using a comparison operator.
 */
export interface MetadataFilterCondition {
  /** Metadata field name (e.g. 'source', 'author', 'date') */
  name: string
  /** Comparison operator for the filter */
  comparison_operator: 'is' | 'is_not' | 'contains' | 'gt' | 'lt' | 'range'
  /** Comparison value — string, number, or [min, max] tuple for range operator */
  value: string | number | [number, number]
}

/**
 * @description Metadata filter configuration with logical grouping.
 * Combines multiple conditions with AND/OR logic for document filtering.
 */
export interface MetadataFilter {
  /** Logical operator between conditions */
  logic: 'and' | 'or'
  /** Array of filter conditions */
  conditions: MetadataFilterCondition[]
}
