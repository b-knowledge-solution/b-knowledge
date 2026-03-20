/**
 * @fileoverview Unit tests for Zod-based request validation middleware.
 *
 * Tests the validate() middleware factory with both direct ZodSchema
 * (body-only) and ValidationTarget (body + params + query) inputs.
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { validate } from '../../../src/shared/middleware/validate.middleware.js'
import { createMockRequest, createMockResponse, createMockNext } from '../../setup.js'

describe('Validate Middleware', () => {
  describe('ZodSchema directly (body validation only)', () => {
    /**
     * @description Schema used across body-only validation tests
     */
    const bodySchema = z.object({
      name: z.string().min(1),
      age: z.number().int().positive(),
    })

    it('should call next when body is valid', () => {
      const req = createMockRequest({ body: { name: 'Alice', age: 30 } })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(bodySchema)
      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should return 400 when body is invalid', () => {
      const req = createMockRequest({ body: { name: '', age: -1 } })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(bodySchema)
      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          details: expect.arrayContaining([
            expect.objectContaining({ target: 'body' }),
          ]),
        })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('should replace req.body with parsed/coerced values', () => {
      // Schema that coerces string to number
      const coerceSchema = z.object({
        count: z.coerce.number(),
      })

      const req = createMockRequest({ body: { count: '42' } })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(coerceSchema)
      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      // Body should contain coerced number value
      expect(req.body.count).toBe(42)
      expect(typeof req.body.count).toBe('number')
    })
  })

  describe('ValidationTarget (body + params + query)', () => {
    /**
     * @description Schemas used across multi-target validation tests
     */
    const schemas = {
      body: z.object({ title: z.string().min(1) }),
      params: z.object({ id: z.string().uuid() }),
      query: z.object({ page: z.coerce.number().int().positive().optional() }),
    }

    it('should call next when all targets are valid', () => {
      const req = createMockRequest({
        body: { title: 'Test' },
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        query: { page: '1' },
      })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(schemas)
      middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.status).not.toHaveBeenCalled()
    })

    it('should return 400 when body is invalid', () => {
      const req = createMockRequest({
        body: { title: '' },
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        query: {},
      })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(schemas)
      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          details: expect.arrayContaining([
            expect.objectContaining({ target: 'body', field: 'title' }),
          ]),
        })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('should return 400 when params are invalid', () => {
      const req = createMockRequest({
        body: { title: 'Test' },
        params: { id: 'not-a-uuid' },
        query: {},
      })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(schemas)
      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          details: expect.arrayContaining([
            expect.objectContaining({ target: 'params', field: 'id' }),
          ]),
        })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('should return 400 when query is invalid', () => {
      const req = createMockRequest({
        body: { title: 'Test' },
        params: { id: '550e8400-e29b-41d4-a716-446655440000' },
        query: { page: 'not-a-number' },
      })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(schemas)
      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          details: expect.arrayContaining([
            expect.objectContaining({ target: 'query' }),
          ]),
        })
      )
      expect(next).not.toHaveBeenCalled()
    })

    it('should return multiple validation errors in a single response', () => {
      const req = createMockRequest({
        body: { title: '' },
        params: { id: 'bad-uuid' },
        query: {},
      })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(schemas)
      middleware(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      const jsonCall = res.json.mock.calls[0][0]
      // Should contain errors from both body and params targets
      const targets = jsonCall.details.map((d: any) => d.target)
      expect(targets).toContain('body')
      expect(targets).toContain('params')
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('partial ValidationTarget', () => {
    it('should validate only body when params and query schemas are omitted', () => {
      const bodyOnly = { body: z.object({ name: z.string() }) }

      const req = createMockRequest({
        body: { name: 'Bob' },
        params: { anything: 'goes' },
      })
      const res = createMockResponse()
      const next = createMockNext()

      const middleware = validate(bodyOnly)
      middleware(req, res, next)

      // Params are not validated so request passes
      expect(next).toHaveBeenCalled()
    })
  })
})
