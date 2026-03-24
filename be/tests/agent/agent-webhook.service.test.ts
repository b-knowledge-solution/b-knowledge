/**
 * @fileoverview Unit tests for AgentWebhookService.
 *
 * Tests webhook payload validation (input/message/query field names),
 * agent status checks, and execution delegation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAgentModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

const mockExecutorService = vi.hoisted(() => ({
  startRun: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agent: mockAgentModel,
  },
}))

vi.mock('../../src/modules/agents/services/agent-executor.service.js', () => ({
  agentExecutorService: mockExecutorService,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { agentWebhookService } from '../../src/modules/agents/services/agent-webhook.service.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentWebhookService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // validateWebhookPayload
  // -----------------------------------------------------------------------

  describe('validateWebhookPayload', () => {
    it('accepts body with "input" field', () => {
      const result = agentWebhookService.validateWebhookPayload({ input: 'Hello' })
      expect(result.input).toBe('Hello')
    })

    it('accepts body with "message" field', () => {
      const result = agentWebhookService.validateWebhookPayload({ message: 'Hi there' })
      expect(result.input).toBe('Hi there')
    })

    it('accepts body with "query" field', () => {
      const result = agentWebhookService.validateWebhookPayload({ query: 'Search this' })
      expect(result.input).toBe('Search this')
    })

    it('trims whitespace from input', () => {
      const result = agentWebhookService.validateWebhookPayload({ input: '  Hello  ' })
      expect(result.input).toBe('Hello')
    })

    it('prefers "input" over "message" and "query"', () => {
      const result = agentWebhookService.validateWebhookPayload({
        input: 'from input',
        message: 'from message',
        query: 'from query',
      })
      expect(result.input).toBe('from input')
    })

    it('throws 400 when body is null', () => {
      expect(() => agentWebhookService.validateWebhookPayload(null)).toThrow(
        'Request body must be a JSON object',
      )
    })

    it('throws 400 when body is not an object', () => {
      expect(() => agentWebhookService.validateWebhookPayload('string')).toThrow(
        'Request body must be a JSON object',
      )
    })

    it('throws 400 when no recognizable input field is present', () => {
      expect(() => agentWebhookService.validateWebhookPayload({ data: 'value' })).toThrow(
        'must contain a non-empty "input", "message", or "query"',
      )
    })

    it('throws 400 when input is an empty string', () => {
      expect(() => agentWebhookService.validateWebhookPayload({ input: '' })).toThrow(
        'must contain a non-empty',
      )
    })

    it('throws 400 when input is whitespace only', () => {
      expect(() => agentWebhookService.validateWebhookPayload({ input: '   ' })).toThrow(
        'must contain a non-empty',
      )
    })

    it('throws 400 when input is a number (not string)', () => {
      expect(() => agentWebhookService.validateWebhookPayload({ input: 42 })).toThrow(
        'must contain a non-empty',
      )
    })
  })

  // -----------------------------------------------------------------------
  // handleWebhook
  // -----------------------------------------------------------------------

  describe('handleWebhook', () => {
    it('starts a run and returns the run_id', async () => {
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        status: 'published',
        tenant_id: 'tenant-1',
      })
      mockExecutorService.startRun.mockResolvedValue('run-uuid-1')

      const result = await agentWebhookService.handleWebhook('agent-1', { input: 'Hello' })

      expect(result).toEqual({ run_id: 'run-uuid-1' })
      expect(mockExecutorService.startRun).toHaveBeenCalledWith(
        'agent-1',
        'Hello',
        'tenant-1',
        'webhook',
        'webhook',
      )
    })

    it('throws 404 when agent not found', async () => {
      mockAgentModel.findById.mockResolvedValue(null)

      await expect(
        agentWebhookService.handleWebhook('missing', { input: 'Hello' }),
      ).rejects.toThrow('Agent not found')
    })

    it('throws 400 when agent is not published', async () => {
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        status: 'draft',
        tenant_id: 'tenant-1',
      })

      await expect(
        agentWebhookService.handleWebhook('agent-1', { input: 'Hello' }),
      ).rejects.toThrow('Agent must be published')
    })

    it('throws 400 for invalid payload', async () => {
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        status: 'published',
        tenant_id: 'tenant-1',
      })

      await expect(
        agentWebhookService.handleWebhook('agent-1', { data: 'no input field' }),
      ).rejects.toThrow('must contain a non-empty')
    })
  })
})
