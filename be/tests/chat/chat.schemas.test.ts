/**
 * @fileoverview Tests for chat Zod validation schemas.
 *
 * Validates that mutation route schemas accept valid input
 * and reject malformed data with correct error messages.
 */

import { describe, expect, it } from 'vitest'
import { uuidParamSchema, deleteSessionsSchema } from '../../src/modules/chat/schemas/chat.schemas'

describe('Chat Zod Schemas', () => {
  // -----------------------------------------------------------------------
  // uuidParamSchema
  // -----------------------------------------------------------------------

  describe('uuidParamSchema', () => {
    it('accepts a valid hex ID', () => {
      const result = uuidParamSchema.safeParse({ id: 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d' })
      expect(result.success).toBe(true)
    })

    it('rejects a non-UUID string', () => {
      const result = uuidParamSchema.safeParse({ id: 'not-a-uuid' })
      expect(result.success).toBe(false)
    })

    it('rejects missing id', () => {
      const result = uuidParamSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects empty string', () => {
      const result = uuidParamSchema.safeParse({ id: '' })
      expect(result.success).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // deleteSessionsSchema
  // -----------------------------------------------------------------------

  describe('deleteSessionsSchema', () => {
    it('accepts array of valid hex IDs', () => {
      const result = deleteSessionsSchema.safeParse({
        ids: ['a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d'],
      })
      expect(result.success).toBe(true)
    })

    it('rejects empty ids array', () => {
      const result = deleteSessionsSchema.safeParse({ ids: [] })
      expect(result.success).toBe(false)
    })

    it('rejects ids with non-UUID strings', () => {
      const result = deleteSessionsSchema.safeParse({ ids: ['bad-id'] })
      expect(result.success).toBe(false)
    })

    it('rejects missing ids field', () => {
      const result = deleteSessionsSchema.safeParse({})
      expect(result.success).toBe(false)
    })
  })
})
