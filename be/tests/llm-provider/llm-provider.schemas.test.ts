/**
 * @fileoverview Tests for LLM provider Zod validation schemas.
 *
 * Validates that schemas accept valid input, enforce constraints,
 * reject malformed data, and that MODEL_TYPES is correctly defined.
 */

import { describe, it, expect } from 'vitest'
import {
  createProviderSchema,
  updateProviderSchema,
  uuidParamSchema,
  MODEL_TYPES,
} from '../../src/modules/llm-provider/schemas/llm-provider.schemas'

// ---------------------------------------------------------------------------
// MODEL_TYPES constant
// ---------------------------------------------------------------------------

describe('MODEL_TYPES', () => {
  it('contains the six canonical model types', () => {
    expect(MODEL_TYPES).toEqual([
      'chat',
      'embedding',
      'image2text',
      'speech2text',
      'rerank',
      'tts',
    ])
  })

  it('is a readonly tuple with fixed length', () => {
    expect(MODEL_TYPES).toHaveLength(6)
  })
})

// ---------------------------------------------------------------------------
// uuidParamSchema
// ---------------------------------------------------------------------------

describe('uuidParamSchema', () => {
  it('accepts a valid UUID v4', () => {
    const result = uuidParamSchema.safeParse({
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-UUID string', () => {
    const result = uuidParamSchema.safeParse({ id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty string', () => {
    const result = uuidParamSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing id field', () => {
    const result = uuidParamSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects a numeric id', () => {
    const result = uuidParamSchema.safeParse({ id: 12345 })
    expect(result.success).toBe(false)
  })

  it('provides custom error message on invalid UUID', () => {
    const result = uuidParamSchema.safeParse({ id: 'bad' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('id'))
      expect(issue?.message).toBe('Invalid UUID format')
    }
  })
})

// ---------------------------------------------------------------------------
// createProviderSchema
// ---------------------------------------------------------------------------

describe('createProviderSchema', () => {
  /**
   * @description Returns a minimal valid payload for createProviderSchema
   * @returns {object} Valid provider creation data with required fields only
   */
  function validPayload() {
    return {
      factory_name: 'OpenAI',
      model_type: 'chat' as const,
      model_name: 'gpt-4o',
    }
  }

  it('accepts minimal valid input (required fields only)', () => {
    const result = createProviderSchema.safeParse(validPayload())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.factory_name).toBe('OpenAI')
      expect(result.data.model_type).toBe('chat')
      expect(result.data.model_name).toBe('gpt-4o')
    }
  })

  it('accepts all optional fields', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      api_key: 'sk-abc123',
      api_base: 'https://api.openai.com/v1',
      max_tokens: 4096,
      is_default: true,
      vision: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.api_key).toBe('sk-abc123')
      expect(result.data.api_base).toBe('https://api.openai.com/v1')
      expect(result.data.max_tokens).toBe(4096)
      expect(result.data.is_default).toBe(true)
      expect(result.data.vision).toBe(true)
    }
  })

  it('accepts null api_key', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      api_key: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts null api_base', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      api_base: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts null max_tokens', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      max_tokens: null,
    })
    expect(result.success).toBe(true)
  })

  // -- factory_name validation --

  it('rejects empty factory_name', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      factory_name: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects factory_name exceeding 100 characters', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      factory_name: 'a'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  it('accepts factory_name at max length (100)', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      factory_name: 'a'.repeat(100),
    })
    expect(result.success).toBe(true)
  })

  // -- model_type validation --

  it('accepts all valid model types', () => {
    for (const modelType of MODEL_TYPES) {
      const result = createProviderSchema.safeParse({
        ...validPayload(),
        model_type: modelType,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid model_type', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      model_type: 'invalid_type',
    })
    expect(result.success).toBe(false)
  })

  it('provides custom error message for invalid model_type', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      model_type: 'bogus',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const typeError = result.error.issues.find(i => i.path.includes('model_type'))
      expect(typeError?.message).toContain('Model type must be one of')
    }
  })

  it('rejects missing model_type', () => {
    const { model_type: _, ...noType } = validPayload()
    const result = createProviderSchema.safeParse(noType)
    expect(result.success).toBe(false)
  })

  // -- model_name validation --

  it('rejects empty model_name', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      model_name: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects model_name exceeding 255 characters', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      model_name: 'x'.repeat(256),
    })
    expect(result.success).toBe(false)
  })

  it('accepts model_name at max length (255)', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      model_name: 'x'.repeat(255),
    })
    expect(result.success).toBe(true)
  })

  // -- api_key validation --

  it('rejects api_key exceeding 500 characters', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      api_key: 'k'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('accepts api_key at max length (500)', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      api_key: 'k'.repeat(500),
    })
    expect(result.success).toBe(true)
  })

  // -- api_base validation --

  it('rejects invalid URL for api_base', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      api_base: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a valid HTTPS URL for api_base', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      api_base: 'https://my-llm.example.com/v1',
    })
    expect(result.success).toBe(true)
  })

  // -- max_tokens validation --

  it('rejects max_tokens less than 1', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      max_tokens: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rejects negative max_tokens', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      max_tokens: -5,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer max_tokens', () => {
    const result = createProviderSchema.safeParse({
      ...validPayload(),
      max_tokens: 1.5,
    })
    expect(result.success).toBe(false)
  })

  // -- missing required fields --

  it('rejects missing factory_name', () => {
    const { factory_name: _, ...rest } = validPayload()
    const result = createProviderSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing model_name', () => {
    const { model_name: _, ...rest } = validPayload()
    const result = createProviderSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects empty object', () => {
    const result = createProviderSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateProviderSchema
// ---------------------------------------------------------------------------

describe('updateProviderSchema', () => {
  it('accepts an empty object (no changes)', () => {
    const result = updateProviderSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts partial update with just factory_name', () => {
    const result = updateProviderSchema.safeParse({ factory_name: 'Anthropic' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.factory_name).toBe('Anthropic')
    }
  })

  it('accepts partial update with just model_type', () => {
    const result = updateProviderSchema.safeParse({ model_type: 'embedding' })
    expect(result.success).toBe(true)
  })

  it('accepts partial update with just is_default', () => {
    const result = updateProviderSchema.safeParse({ is_default: true })
    expect(result.success).toBe(true)
  })

  it('accepts partial update with multiple fields', () => {
    const result = updateProviderSchema.safeParse({
      factory_name: 'Updated',
      model_name: 'new-model',
      vision: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid model_type even in partial update', () => {
    const result = updateProviderSchema.safeParse({ model_type: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('rejects empty factory_name even in partial update', () => {
    const result = updateProviderSchema.safeParse({ factory_name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid api_base even in partial update', () => {
    const result = updateProviderSchema.safeParse({ api_base: 'not-a-url' })
    expect(result.success).toBe(false)
  })
})
