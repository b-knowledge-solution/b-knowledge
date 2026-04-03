/**
 * @fileoverview Tests for search Zod validation schemas.
 *
 * Validates that schemas accept valid input, apply defaults,
 * coerce types, and reject malformed data.
 */

import { describe, it, expect } from 'vitest'
import {
  createSearchAppSchema,
  updateSearchAppSchema,
  executeSearchSchema,
  askSearchSchema,
  relatedQuestionsSchema,
  mindmapSchema,
  searchAppAccessSchema,
  searchAppIdParamSchema,
} from '../../src/modules/search/schemas/search.schemas'

// ---------------------------------------------------------------------------
// executeSearchSchema
// ---------------------------------------------------------------------------

describe('executeSearchSchema', () => {
  it('accepts valid input with all fields', () => {
    const result = executeSearchSchema.safeParse({
      query: 'test query',
      top_k: 20,
      method: 'hybrid',
      similarity_threshold: 0.5,
      page: 2,
      page_size: 15,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.query).toBe('test query')
      expect(result.data.top_k).toBe(20)
      expect(result.data.method).toBe('hybrid')
      expect(result.data.page).toBe(2)
      expect(result.data.page_size).toBe(15)
    }
  })

  it('applies default page=1 when not provided', () => {
    const result = executeSearchSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
    }
  })

  it('applies default page_size=10 when not provided', () => {
    const result = executeSearchSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page_size).toBe(10)
    }
  })

  it('applies default top_k=10 when not provided', () => {
    const result = executeSearchSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.top_k).toBe(10)
    }
  })

  it('applies default method=full_text when not provided', () => {
    const result = executeSearchSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.method).toBe('full_text')
    }
  })

  it('applies default similarity_threshold=0 when not provided', () => {
    const result = executeSearchSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.similarity_threshold).toBe(0)
    }
  })

  it('rejects empty query', () => {
    const result = executeSearchSchema.safeParse({ query: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing query', () => {
    const result = executeSearchSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects page < 1', () => {
    const result = executeSearchSchema.safeParse({ query: 'test', page: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects page_size > 50', () => {
    const result = executeSearchSchema.safeParse({ query: 'test', page_size: 51 })
    expect(result.success).toBe(false)
  })

  it('rejects top_k > 100', () => {
    const result = executeSearchSchema.safeParse({ query: 'test', top_k: 101 })
    expect(result.success).toBe(false)
  })

  it('rejects top_k < 1', () => {
    const result = executeSearchSchema.safeParse({ query: 'test', top_k: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects invalid method', () => {
    const result = executeSearchSchema.safeParse({ query: 'test', method: 'vector' })
    expect(result.success).toBe(false)
  })

  it('rejects similarity_threshold > 1', () => {
    const result = executeSearchSchema.safeParse({ query: 'test', similarity_threshold: 1.5 })
    expect(result.success).toBe(false)
  })

  it('rejects similarity_threshold < 0', () => {
    const result = executeSearchSchema.safeParse({ query: 'test', similarity_threshold: -0.1 })
    expect(result.success).toBe(false)
  })

  it('accepts all valid methods', () => {
    for (const method of ['full_text', 'semantic', 'hybrid']) {
      const result = executeSearchSchema.safeParse({ query: 'test', method })
      expect(result.success).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// askSearchSchema
// ---------------------------------------------------------------------------

describe('askSearchSchema', () => {
  it('accepts minimal valid input', () => {
    const result = askSearchSchema.safeParse({ query: 'hello' })
    expect(result.success).toBe(true)
  })

  it('accepts all optional fields', () => {
    const result = askSearchSchema.safeParse({
      query: 'test',
      top_k: 50,
      method: 'semantic',
      similarity_threshold: 0.8,
      vector_similarity_weight: 0.5,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty query', () => {
    const result = askSearchSchema.safeParse({ query: '' })
    expect(result.success).toBe(false)
  })

  it('rejects vector_similarity_weight > 1', () => {
    const result = askSearchSchema.safeParse({ query: 'test', vector_similarity_weight: 1.5 })
    expect(result.success).toBe(false)
  })

  it('rejects vector_similarity_weight < 0', () => {
    const result = askSearchSchema.safeParse({ query: 'test', vector_similarity_weight: -0.1 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createSearchAppSchema
// ---------------------------------------------------------------------------

describe('createSearchAppSchema', () => {
  it('accepts valid input', () => {
    const result = createSearchAppSchema.safeParse({
      name: 'My Search App',
      dataset_ids: ['a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createSearchAppSchema.safeParse({
      name: '',
      dataset_ids: ['a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects name > 128 chars', () => {
    const result = createSearchAppSchema.safeParse({
      name: 'a'.repeat(129),
      dataset_ids: ['a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty dataset_ids', () => {
    const result = createSearchAppSchema.safeParse({
      name: 'Test',
      dataset_ids: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID dataset_ids', () => {
    const result = createSearchAppSchema.safeParse({
      name: 'Test',
      dataset_ids: ['not-a-uuid'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = createSearchAppSchema.safeParse({
      name: 'Test',
      dataset_ids: ['a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d'],
      description: 'A description',
      search_config: { top_k: 10 },
      is_public: true,
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// updateSearchAppSchema
// ---------------------------------------------------------------------------

describe('updateSearchAppSchema', () => {
  it('accepts partial update with just name', () => {
    const result = updateSearchAppSchema.safeParse({ name: 'Updated Name' })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (no changes)', () => {
    const result = updateSearchAppSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = updateSearchAppSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID dataset_ids', () => {
    const result = updateSearchAppSchema.safeParse({ dataset_ids: ['bad'] })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// relatedQuestionsSchema
// ---------------------------------------------------------------------------

describe('relatedQuestionsSchema', () => {
  it('accepts valid query', () => {
    const result = relatedQuestionsSchema.safeParse({ query: 'what is AI?' })
    expect(result.success).toBe(true)
  })

  it('rejects empty query', () => {
    const result = relatedQuestionsSchema.safeParse({ query: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing query', () => {
    const result = relatedQuestionsSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// mindmapSchema
// ---------------------------------------------------------------------------

describe('mindmapSchema', () => {
  it('accepts minimal input', () => {
    const result = mindmapSchema.safeParse({ query: 'test' })
    expect(result.success).toBe(true)
  })

  it('accepts all optional fields', () => {
    const result = mindmapSchema.safeParse({
      query: 'test',
      top_k: 50,
      method: 'hybrid',
      similarity_threshold: 0.5,
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty query', () => {
    const result = mindmapSchema.safeParse({ query: '' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// searchAppAccessSchema
// ---------------------------------------------------------------------------

describe('searchAppAccessSchema', () => {
  it('accepts valid user access entry', () => {
    const result = searchAppAccessSchema.safeParse({
      entries: [{ entity_type: 'user', entity_id: 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid team access entry', () => {
    const result = searchAppAccessSchema.safeParse({
      entries: [{ entity_type: 'team', entity_id: 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d' }],
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty entries array', () => {
    const result = searchAppAccessSchema.safeParse({ entries: [] })
    expect(result.success).toBe(true)
  })

  it('rejects invalid entity_type', () => {
    const result = searchAppAccessSchema.safeParse({
      entries: [{ entity_type: 'group', entity_id: 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID entity_id', () => {
    const result = searchAppAccessSchema.safeParse({
      entries: [{ entity_type: 'user', entity_id: 'not-uuid' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple entries', () => {
    const result = searchAppAccessSchema.safeParse({
      entries: [
        { entity_type: 'user', entity_id: 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d' },
        { entity_type: 'team', entity_id: 'b2c3d4e5f6a74b8c9d0e1f2a3b4c5d6e' },
      ],
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// searchAppIdParamSchema
// ---------------------------------------------------------------------------

describe('searchAppIdParamSchema', () => {
  it('accepts valid UUID', () => {
    const result = searchAppIdParamSchema.safeParse({ id: 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d' })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID', () => {
    const result = searchAppIdParamSchema.safeParse({ id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects empty string', () => {
    const result = searchAppIdParamSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing id', () => {
    const result = searchAppIdParamSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
