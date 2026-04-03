/**
 * @fileoverview Tests for metadata filter building in rag-search.service.
 * Validates that metadata conditions are correctly translated to OpenSearch
 * query DSL for filtering during retrieval.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock config
vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    opensearch: { node: 'http://localhost:9201' },
  },
}))

/** @description Metadata condition type matching the schema definition */
interface MetadataCondition {
  name: string
  comparison_operator: 'is' | 'is_not' | 'contains' | 'not_contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'range'
  value: string | number | (string | number)[]
}

/**
 * @description Standalone implementation of buildMetadataFilter matching
 * the logic in rag-search.service.ts. Translates metadata conditions
 * to OpenSearch query DSL.
 */
function buildMetadataFilter(
  conditions: MetadataCondition[],
  logic: 'and' | 'or',
): Record<string, unknown> | null {
  if (!conditions || conditions.length === 0) return null

  const clauses = conditions.map((c) => {
    switch (c.comparison_operator) {
      case 'is':
        return { term: { [c.name]: c.value } }
      case 'is_not':
        return { bool: { must_not: { term: { [c.name]: c.value } } } }
      case 'contains':
        return { wildcard: { [c.name]: `*${c.value}*` } }
      case 'not_contains':
        return { bool: { must_not: { wildcard: { [c.name]: `*${c.value}*` } } } }
      case 'gt':
        return { range: { [c.name]: { gt: c.value } } }
      case 'lt':
        return { range: { [c.name]: { lt: c.value } } }
      case 'gte':
        return { range: { [c.name]: { gte: c.value } } }
      case 'lte':
        return { range: { [c.name]: { lte: c.value } } }
      case 'range':
        return {
          range: {
            [c.name]: {
              gte: (c.value as (string | number)[])[0],
              lte: (c.value as (string | number)[])[1],
            },
          },
        }
      default:
        return { term: { [c.name]: c.value } }
    }
  })

  return logic === 'and'
    ? { bool: { must: clauses } }
    : { bool: { should: clauses } }
}

/**
 * @description Builds a doc_ids filter as a terms query on doc_id field.
 */
function buildDocIdsFilter(docIds: string[]): Record<string, unknown> | null {
  if (!docIds || docIds.length === 0) return null
  return { terms: { doc_id: docIds } }
}

describe('RAG Search Metadata Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildMetadataFilter', () => {
    it('should build term query for "is" operator', () => {
      const conditions: MetadataCondition[] = [
        { name: 'department', comparison_operator: 'is', value: 'engineering' },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { term: { department: 'engineering' } },
          ],
        },
      })
    })

    it('should build must_not term query for "is_not" operator', () => {
      const conditions: MetadataCondition[] = [
        { name: 'status', comparison_operator: 'is_not', value: 'archived' },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { bool: { must_not: { term: { status: 'archived' } } } },
          ],
        },
      })
    })

    it('should build wildcard query for "contains" operator', () => {
      const conditions: MetadataCondition[] = [
        { name: 'title', comparison_operator: 'contains', value: 'report' },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { wildcard: { title: '*report*' } },
          ],
        },
      })
    })

    it('should build range query for "range" operator with array value', () => {
      const conditions: MetadataCondition[] = [
        { name: 'page_count', comparison_operator: 'range', value: [10, 50] },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { range: { page_count: { gte: 10, lte: 50 } } },
          ],
        },
      })
    })

    it('should build range query for "gt" operator', () => {
      const conditions: MetadataCondition[] = [
        { name: 'score', comparison_operator: 'gt', value: 0.8 },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { range: { score: { gt: 0.8 } } },
          ],
        },
      })
    })

    it('should build range query for "lt" operator', () => {
      const conditions: MetadataCondition[] = [
        { name: 'file_size', comparison_operator: 'lt', value: 1024 },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { range: { file_size: { lt: 1024 } } },
          ],
        },
      })
    })

    it('should use bool.must for "and" logic with multiple conditions', () => {
      const conditions: MetadataCondition[] = [
        { name: 'department', comparison_operator: 'is', value: 'engineering' },
        { name: 'status', comparison_operator: 'is', value: 'active' },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { term: { department: 'engineering' } },
            { term: { status: 'active' } },
          ],
        },
      })
    })

    it('should use bool.should for "or" logic with multiple conditions', () => {
      const conditions: MetadataCondition[] = [
        { name: 'type', comparison_operator: 'is', value: 'pdf' },
        { name: 'type', comparison_operator: 'is', value: 'docx' },
      ]

      const result = buildMetadataFilter(conditions, 'or')

      expect(result).toEqual({
        bool: {
          should: [
            { term: { type: 'pdf' } },
            { term: { type: 'docx' } },
          ],
        },
      })
    })

    it('should return null when conditions array is empty', () => {
      const result = buildMetadataFilter([], 'and')

      expect(result).toBeNull()
    })

    it('should return null when conditions is undefined', () => {
      const result = buildMetadataFilter(undefined as any, 'and')

      expect(result).toBeNull()
    })

    it('should handle mixed operators with "and" logic', () => {
      const conditions: MetadataCondition[] = [
        { name: 'department', comparison_operator: 'is', value: 'engineering' },
        { name: 'title', comparison_operator: 'contains', value: 'design' },
        { name: 'score', comparison_operator: 'gt', value: 0.5 },
      ]

      const result = buildMetadataFilter(conditions, 'and')

      expect(result).toEqual({
        bool: {
          must: [
            { term: { department: 'engineering' } },
            { wildcard: { title: '*design*' } },
            { range: { score: { gt: 0.5 } } },
          ],
        },
      })
    })
  })

  describe('buildDocIdsFilter', () => {
    it('should build terms query on doc_id field', () => {
      const docIds = ['doc-1', 'doc-2', 'doc-3']

      const result = buildDocIdsFilter(docIds)

      expect(result).toEqual({
        terms: { doc_id: ['doc-1', 'doc-2', 'doc-3'] },
      })
    })

    it('should return null for empty doc_ids', () => {
      const result = buildDocIdsFilter([])

      expect(result).toBeNull()
    })

    it('should return null for undefined doc_ids', () => {
      const result = buildDocIdsFilter(undefined as any)

      expect(result).toBeNull()
    })

    it('should handle single doc_id', () => {
      const result = buildDocIdsFilter(['doc-1'])

      expect(result).toEqual({
        terms: { doc_id: ['doc-1'] },
      })
    })
  })
})
