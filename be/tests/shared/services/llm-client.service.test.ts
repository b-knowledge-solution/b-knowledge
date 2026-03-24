/**
 * @fileoverview Unit tests for LlmClientService.
 * Tests chatCompletion, chatCompletionStream, and embedTexts with Langfuse tracing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateCompletion = vi.fn()
const mockCreateEmbeddings = vi.fn()

vi.mock('openai', () => ({
  default: function () {
    return {
      chat: {
        completions: {
          create: (...args: any[]) => mockCreateCompletion(...args),
        },
      },
      embeddings: {
        create: (...args: any[]) => mockCreateEmbeddings(...args),
      },
    }
  },
}))

const mockCreateGeneration = vi.fn().mockReturnValue({ end: vi.fn() })

vi.mock('../../../src/shared/services/langfuse.service.js', () => ({
  langfuseTraceService: {
    createGeneration: mockCreateGeneration,
  },
}))

vi.mock('../../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const mockFindById = vi.fn()
const mockFindDefaults = vi.fn()

vi.mock('../../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    modelProvider: {
      findById: (...args: any[]) => mockFindById(...args),
      findDefaults: (...args: any[]) => mockFindDefaults(...args),
    },
  },
}))

vi.mock('../../../src/shared/config/index.js', () => ({
  config: {
    langfuse: {
      traceEmbeddings: true,
    },
  },
}))

describe('LlmClientService', () => {
  let LlmClientService: any

  const mockProvider = {
    id: 'provider-1',
    model_name: 'gpt-4',
    api_key: 'test-key',
    api_base: 'https://api.test.com',
    max_tokens: 4096,
    status: 'active',
    factory_name: 'openai',
    model_type: 'chat',
  }

  const mockEmbeddingProvider = {
    id: 'emb-1',
    model_name: 'text-embedding-3-small',
    api_key: 'test-key',
    api_base: 'https://api.test.com',
    max_tokens: 8192,
    status: 'active',
    factory_name: 'openai',
    model_type: 'embedding',
  }

  beforeEach(async () => {
    mockCreateCompletion.mockReset()
    mockCreateEmbeddings.mockReset()
    mockCreateGeneration.mockReset()
    mockCreateGeneration.mockReturnValue({ end: vi.fn() })
    mockFindById.mockReset()
    mockFindDefaults.mockReset()
    mockFindById.mockResolvedValue(mockProvider)
    mockFindDefaults.mockResolvedValue([mockProvider, mockEmbeddingProvider])
    const mod = await import('../../../src/shared/services/llm-client.service.js')
    LlmClientService = mod.LlmClientService
  })

  describe('chatCompletion', () => {
    it('returns content and creates generation when parent provided', async () => {
      mockCreateCompletion.mockResolvedValue({
        choices: [{ message: { content: 'Hello world' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })

      const service = new LlmClientService()
      const mockParent = { span: vi.fn(), generation: vi.fn() }

      const result = await service.chatCompletion(
        [{ role: 'user', content: 'Hi' }],
        { providerId: 'provider-1' },
        mockParent
      )

      expect(result).toBe('Hello world')
      expect(mockCreateGeneration).toHaveBeenCalledWith(mockParent, expect.objectContaining({
        name: 'gpt-4',
        input: [{ role: 'user', content: 'Hi' }],
        output: 'Hello world',
        model: 'gpt-4',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }))
    })

    it('does not create generation when no parent', async () => {
      mockCreateCompletion.mockResolvedValue({
        choices: [{ message: { content: 'response' } }],
      })

      const service = new LlmClientService()
      await service.chatCompletion([{ role: 'user', content: 'test' }], { providerId: 'provider-1' })

      expect(mockCreateGeneration).not.toHaveBeenCalled()
    })

    it('handles generation trace error gracefully', async () => {
      mockCreateCompletion.mockResolvedValue({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
      mockCreateGeneration.mockImplementationOnce(() => { throw new Error('trace fail') })

      const service = new LlmClientService()
      const mockParent = {} as any

      // Should not throw
      const result = await service.chatCompletion(
        [{ role: 'user', content: 'test' }],
        { providerId: 'provider-1' },
        mockParent
      )
      expect(result).toBe('ok')
    })
  })

  describe('chatCompletionStream', () => {
    it('creates generation at start and ends it after stream', async () => {
      const mockEnd = vi.fn()
      mockCreateGeneration.mockReturnValue({ end: mockEnd })

      // Simulate async iterable stream
      const chunks = [
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] },
        { choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } },
      ]
      mockCreateCompletion.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const c of chunks) yield c
        },
      })

      const service = new LlmClientService()
      const mockParent = {} as any
      const collected: any[] = []

      for await (const chunk of service.chatCompletionStream(
        [{ role: 'user', content: 'Hi' }],
        { providerId: 'provider-1' },
        mockParent
      )) {
        collected.push(chunk)
      }

      expect(collected).toHaveLength(2)
      expect(collected[0].content).toBe('Hello')
      expect(collected[1].content).toBe(' world')
      expect(collected[1].done).toBe(true)

      // Generation should be created at start
      expect(mockCreateGeneration).toHaveBeenCalledWith(mockParent, expect.objectContaining({
        name: 'gpt-4',
        model: 'gpt-4',
      }))

      // Generation should be ended with full output
      expect(mockEnd).toHaveBeenCalledWith(expect.objectContaining({
        output: 'Hello world',
      }))
    })
  })

  describe('embedTexts', () => {
    it('traces embedding when LANGFUSE_TRACE_EMBEDDINGS is on and parent provided', async () => {
      mockCreateEmbeddings.mockResolvedValue({
        data: [
          { index: 0, embedding: [0.1, 0.2] },
          { index: 1, embedding: [0.3, 0.4] },
        ],
        usage: { prompt_tokens: 10, total_tokens: 10 },
      })

      const service = new LlmClientService()
      const mockParent = {} as any

      const result = await service.embedTexts(['hello', 'world'], undefined, mockParent)

      expect(result).toEqual([[0.1, 0.2], [0.3, 0.4]])
      expect(mockCreateGeneration).toHaveBeenCalledWith(mockParent, expect.objectContaining({
        name: 'embedding:text-embedding-3-small',
        input: ['hello', 'world'],
        output: '2 vectors',
      }))
    })

    it('does not trace embedding when no parent', async () => {
      mockCreateEmbeddings.mockResolvedValue({
        data: [{ index: 0, embedding: [0.1] }],
        usage: { prompt_tokens: 5, total_tokens: 5 },
      })

      const service = new LlmClientService()
      await service.embedTexts(['test'])

      expect(mockCreateGeneration).not.toHaveBeenCalled()
    })
  })
})
