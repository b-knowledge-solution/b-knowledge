/**
 * @fileoverview Tests for RAG Zod validation schemas.
 *
 * Validates createDatasetSchema, updateDatasetSchema, and searchChunksSchema
 * accept correct input and reject invalid data.
 */

import { describe, expect, it } from 'vitest'
import {
  uuidParamSchema,
  createDatasetSchema,
  updateDatasetSchema,
  searchChunksSchema,
} from '../../src/modules/rag/schemas/rag.schemas'

describe('RAG Zod Schemas', () => {
  // -----------------------------------------------------------------------
  // uuidParamSchema
  // -----------------------------------------------------------------------

  describe('uuidParamSchema', () => {
    it('accepts valid UUID', () => {
      expect(uuidParamSchema.safeParse({ id: '550e8400e29b41d4a716446655440000' }).success).toBe(true)
    })

    it('rejects invalid UUID', () => {
      expect(uuidParamSchema.safeParse({ id: 'abc' }).success).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // createDatasetSchema
  // -----------------------------------------------------------------------

  describe('createDatasetSchema', () => {
    it('accepts minimal valid input', () => {
      const result = createDatasetSchema.safeParse({ name: 'My Dataset' })
      expect(result.success).toBe(true)
    })

    it('accepts full valid input', () => {
      const result = createDatasetSchema.safeParse({
        name: 'Full Dataset',
        description: 'A description',
        language: 'English',
        embedding_model: 'BAAI/bge-large-en-v1.5',
        parser_id: 'naive',
        parser_config: { pages: [[1, 100]] },
        access_control: {
          public: true,
          team_ids: ['550e8400e29b41d4a716446655440000'],
          user_ids: [],
        },
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty name', () => {
      const result = createDatasetSchema.safeParse({ name: '' })
      expect(result.success).toBe(false)
    })

    it('rejects missing name', () => {
      const result = createDatasetSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects name exceeding 255 chars', () => {
      const result = createDatasetSchema.safeParse({ name: 'x'.repeat(256) })
      expect(result.success).toBe(false)
    })

    it('rejects non-UUID team_ids', () => {
      const result = createDatasetSchema.safeParse({
        name: 'DS',
        access_control: { team_ids: ['not-uuid'] },
      })
      expect(result.success).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // updateDatasetSchema
  // -----------------------------------------------------------------------

  describe('updateDatasetSchema', () => {
    it('accepts partial update', () => {
      const result = updateDatasetSchema.safeParse({ description: 'updated desc' })
      expect(result.success).toBe(true)
    })

    it('accepts empty object (no fields to update)', () => {
      const result = updateDatasetSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('accepts null description', () => {
      const result = updateDatasetSchema.safeParse({ description: null })
      expect(result.success).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // searchChunksSchema
  // -----------------------------------------------------------------------

  describe('searchChunksSchema', () => {
    it('accepts minimal query', () => {
      const result = searchChunksSchema.safeParse({ query: 'hello' })
      expect(result.success).toBe(true)
    })

    it('accepts full search params', () => {
      const result = searchChunksSchema.safeParse({
        query: 'test search',
        method: 'hybrid',
        top_k: 20,
        similarity_threshold: 0.5,
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty query', () => {
      const result = searchChunksSchema.safeParse({ query: '' })
      expect(result.success).toBe(false)
    })

    it('rejects missing query', () => {
      const result = searchChunksSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects invalid method', () => {
      const result = searchChunksSchema.safeParse({ query: 'q', method: 'invalid' })
      expect(result.success).toBe(false)
    })

    it('rejects top_k above 100', () => {
      const result = searchChunksSchema.safeParse({ query: 'q', top_k: 101 })
      expect(result.success).toBe(false)
    })

    it('rejects top_k below 1', () => {
      const result = searchChunksSchema.safeParse({ query: 'q', top_k: 0 })
      expect(result.success).toBe(false)
    })

    it('rejects similarity_threshold above 1', () => {
      const result = searchChunksSchema.safeParse({ query: 'q', similarity_threshold: 1.5 })
      expect(result.success).toBe(false)
    })

    it('rejects similarity_threshold below 0', () => {
      const result = searchChunksSchema.safeParse({ query: 'q', similarity_threshold: -0.1 })
      expect(result.success).toBe(false)
    })

    it('accepts all valid method options', () => {
      for (const method of ['hybrid', 'semantic', 'full_text']) {
        const result = searchChunksSchema.safeParse({ query: 'q', method })
        expect(result.success).toBe(true)
      }
    })
  })
})
