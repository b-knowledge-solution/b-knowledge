/**
 * @fileoverview Unit tests for memory module Zod schemas.
 *
 * Tests validation for createMemorySchema, updateMemorySchema,
 * queryMemoryMessagesSchema, memoryIdParamSchema, importHistorySchema,
 * and addMessageSchema -- covering valid inputs, invalid payloads,
 * missing required fields, defaults, and type coercion.
 */

import { describe, it, expect } from 'vitest'
import {
  createMemorySchema,
  updateMemorySchema,
  queryMemoryMessagesSchema,
  memoryIdParamSchema,
  importHistorySchema,
  addMessageSchema,
} from '../../src/modules/memory/schemas/memory.schemas.js'

// ---------------------------------------------------------------------------
// createMemorySchema
// ---------------------------------------------------------------------------

describe('createMemorySchema', () => {
  it('accepts a valid creation payload with required fields only', () => {
    const result = createMemorySchema.safeParse({ name: 'My Memory Pool' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('My Memory Pool')
      // Verify sensible defaults are applied
      expect(result.data.memory_type).toBe(15)
      expect(result.data.storage_type).toBe('table')
      expect(result.data.memory_size).toBe(5242880)
      expect(result.data.temperature).toBe(0.1)
      expect(result.data.extraction_mode).toBe('batch')
      expect(result.data.permission).toBe('me')
      expect(result.data.scope_type).toBe('user')
    }
  })

  it('accepts a full valid creation payload with all optional fields', () => {
    const result = createMemorySchema.safeParse({
      name: 'Full Pool',
      description: 'A fully-configured memory pool',
      memory_type: 7,
      storage_type: 'graph',
      memory_size: 10485760,
      embd_id: 'embedding-model-1',
      llm_id: 'llm-provider-1',
      temperature: 0.5,
      system_prompt: 'You are a helpful assistant.',
      user_prompt: 'Extract from: {{conversation}}',
      extraction_mode: 'realtime',
      permission: 'team',
      scope_type: 'agent',
      scope_id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.memory_type).toBe(7)
      expect(result.data.storage_type).toBe('graph')
      expect(result.data.scope_type).toBe('agent')
    }
  })

  it('rejects when name is missing', () => {
    const result = createMemorySchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects when name is empty string', () => {
    const result = createMemorySchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects when name exceeds 255 characters', () => {
    const result = createMemorySchema.safeParse({ name: 'a'.repeat(256) })
    expect(result.success).toBe(false)
  })

  it('rejects memory_type below 1 (bitmask minimum)', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', memory_type: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects memory_type above 15 (bitmask maximum)', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', memory_type: 16 })
    expect(result.success).toBe(false)
  })

  it('accepts valid bitmask values (1 through 15)', () => {
    for (const val of [1, 2, 4, 8, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]) {
      const result = createMemorySchema.safeParse({ name: 'Test', memory_type: val })
      expect(result.success).toBe(true)
    }
  })

  it('rejects non-integer memory_type', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', memory_type: 3.5 })
    expect(result.success).toBe(false)
  })

  it('rejects invalid storage_type value', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', storage_type: 'vector' })
    expect(result.success).toBe(false)
  })

  it('rejects memory_size below 1', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', memory_size: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects temperature below 0', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', temperature: -0.1 })
    expect(result.success).toBe(false)
  })

  it('rejects temperature above 2', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', temperature: 2.1 })
    expect(result.success).toBe(false)
  })

  it('rejects invalid extraction_mode value', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', extraction_mode: 'streaming' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid permission value', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', permission: 'admin' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid scope_type value', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', scope_type: 'global' })
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID scope_id', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', scope_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('accepts scope_type user with scope_id', () => {
    const result = createMemorySchema.safeParse({
      name: 'Test',
      scope_type: 'user',
      scope_id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
    })
    expect(result.success).toBe(true)
  })

  it('accepts scope_type team', () => {
    const result = createMemorySchema.safeParse({
      name: 'Test',
      scope_type: 'team',
    })
    expect(result.success).toBe(true)
  })

  it('rejects description exceeding 2000 characters', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', description: 'x'.repeat(2001) })
    expect(result.success).toBe(false)
  })

  it('rejects system_prompt exceeding 10000 characters', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', system_prompt: 'x'.repeat(10001) })
    expect(result.success).toBe(false)
  })

  it('rejects user_prompt exceeding 10000 characters', () => {
    const result = createMemorySchema.safeParse({ name: 'Test', user_prompt: 'x'.repeat(10001) })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// updateMemorySchema
// ---------------------------------------------------------------------------

describe('updateMemorySchema', () => {
  it('accepts an empty update payload (all fields optional)', () => {
    const result = updateMemorySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts a partial update with name only', () => {
    const result = updateMemorySchema.safeParse({ name: 'Updated Name' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Updated Name')
    }
  })

  it('accepts partial memory_type update', () => {
    const result = updateMemorySchema.safeParse({ memory_type: 3 })
    expect(result.success).toBe(true)
  })

  it('rejects invalid memory_type in update', () => {
    const result = updateMemorySchema.safeParse({ memory_type: 16 })
    expect(result.success).toBe(false)
  })

  it('rejects empty name in update', () => {
    const result = updateMemorySchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts temperature update', () => {
    const result = updateMemorySchema.safeParse({ temperature: 1.5 })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// queryMemoryMessagesSchema
// ---------------------------------------------------------------------------

describe('queryMemoryMessagesSchema', () => {
  it('applies default page and page_size when omitted', () => {
    const result = queryMemoryMessagesSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.page_size).toBe(20)
    }
  })

  it('coerces string page and page_size to numbers', () => {
    const result = queryMemoryMessagesSchema.safeParse({ page: '3', page_size: '50' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(3)
      expect(result.data.page_size).toBe(50)
    }
  })

  it('rejects page_size exceeding 100', () => {
    const result = queryMemoryMessagesSchema.safeParse({ page_size: '101' })
    expect(result.success).toBe(false)
  })

  it('rejects page_size of 0', () => {
    const result = queryMemoryMessagesSchema.safeParse({ page_size: '0' })
    expect(result.success).toBe(false)
  })

  it('rejects negative page', () => {
    const result = queryMemoryMessagesSchema.safeParse({ page: '-1' })
    expect(result.success).toBe(false)
  })

  it('accepts optional keyword filter', () => {
    const result = queryMemoryMessagesSchema.safeParse({ keyword: 'test query' })
    expect(result.success).toBe(true)
  })

  it('rejects keyword exceeding 255 characters', () => {
    const result = queryMemoryMessagesSchema.safeParse({ keyword: 'x'.repeat(256) })
    expect(result.success).toBe(false)
  })

  it('accepts optional message_type filter', () => {
    const result = queryMemoryMessagesSchema.safeParse({ message_type: '4' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message_type).toBe(4)
    }
  })

  it('rejects message_type above 8', () => {
    const result = queryMemoryMessagesSchema.safeParse({ message_type: '9' })
    expect(result.success).toBe(false)
  })

  it('rejects message_type below 1', () => {
    const result = queryMemoryMessagesSchema.safeParse({ message_type: '0' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// memoryIdParamSchema
// ---------------------------------------------------------------------------

describe('memoryIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    const result = memoryIdParamSchema.safeParse({ id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11' })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID id', () => {
    const result = memoryIdParamSchema.safeParse({ id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects missing id', () => {
    const result = memoryIdParamSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// importHistorySchema
// ---------------------------------------------------------------------------

describe('importHistorySchema', () => {
  it('accepts a valid session_id UUID', () => {
    const result = importHistorySchema.safeParse({
      session_id: 'a0eebc999c0b4ef8bb6d6bb9bd380a11',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing session_id', () => {
    const result = importHistorySchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects non-UUID session_id', () => {
    const result = importHistorySchema.safeParse({ session_id: 'not-valid' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// addMessageSchema
// ---------------------------------------------------------------------------

describe('addMessageSchema', () => {
  it('accepts valid content with default message_type', () => {
    const result = addMessageSchema.safeParse({ content: 'Hello world' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.content).toBe('Hello world')
      // Default message_type is RAW=1
      expect(result.data.message_type).toBe(1)
    }
  })

  it('accepts content with explicit message_type', () => {
    const result = addMessageSchema.safeParse({ content: 'Fact item', message_type: 4 })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message_type).toBe(4)
    }
  })

  it('rejects empty content', () => {
    const result = addMessageSchema.safeParse({ content: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing content', () => {
    const result = addMessageSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects content exceeding 50000 characters', () => {
    const result = addMessageSchema.safeParse({ content: 'x'.repeat(50001) })
    expect(result.success).toBe(false)
  })

  it('rejects message_type above 8', () => {
    const result = addMessageSchema.safeParse({ content: 'test', message_type: 9 })
    expect(result.success).toBe(false)
  })

  it('rejects message_type below 1', () => {
    const result = addMessageSchema.safeParse({ content: 'test', message_type: 0 })
    expect(result.success).toBe(false)
  })
})
