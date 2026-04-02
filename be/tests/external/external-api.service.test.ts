/**
 * @fileoverview Unit tests for the External API service.
 *
 * Tests the retrieval, chat, and search pipelines with mocked dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockChatAssistant = vi.hoisted(() => ({
  findById: vi.fn(),
}))

const mockSearchApp = vi.hoisted(() => ({
  findById: vi.fn(),
}))

const mockApiKeyModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findByHash: vi.fn(),
  listByUser: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    chatAssistant: mockChatAssistant,
    searchApp: mockSearchApp,
    apiKey: mockApiKeyModel,
  },
}))

const mockSearch = vi.hoisted(() => vi.fn())
vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: { search: mockSearch },
}))

const mockRerank = vi.hoisted(() => vi.fn())
vi.mock('../../src/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: { rerank: mockRerank },
}))

const mockInsertCitations = vi.hoisted(() => vi.fn())
vi.mock('../../src/modules/rag/services/rag-citation.service.js', () => ({
  ragCitationService: { insertCitations: mockInsertCitations },
}))

const mockChatCompletion = vi.hoisted(() => vi.fn())
const mockEmbedTexts = vi.hoisted(() => vi.fn())
vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: {
    chatCompletion: mockChatCompletion,
    embedTexts: mockEmbedTexts,
  },
  LlmMessage: {},
}))

vi.mock('../../src/shared/prompts/index.js', () => ({
  askSummaryPrompt: {
    build: vi.fn((knowledge: string) => `Summary prompt: ${knowledge.slice(0, 20)}`),
  },
  citationPrompt: {
    system: 'Use citations.',
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { externalApiService } from '../../src/modules/external/services/external-api.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock chunk result
 */
function buildMockChunk(overrides: Partial<any> = {}): any {
  return {
    chunk_id: 'chunk-1',
    text: 'This is a test chunk of knowledge.',
    doc_id: 'doc-1',
    doc_name: 'test-doc.pdf',
    score: 0.85,
    page_num: [1],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExternalApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock behavior for embedding
    mockEmbedTexts.mockResolvedValue([[0.1, 0.2, 0.3]])
  })

  // -----------------------------------------------------------------------
  // retrieval
  // -----------------------------------------------------------------------

  describe('retrieval', () => {
    it('returns contexts and sources for matching chunks', async () => {
      const chunks = [buildMockChunk(), buildMockChunk({ chunk_id: 'chunk-2', score: 0.7 })]
      mockSearch.mockResolvedValue({ chunks, total: 2 })

      const result = await externalApiService.retrieval(
        'test query',
        ['dataset-1'],
        { top_k: 5, method: 'hybrid' }
      )

      expect(result.contexts).toHaveLength(2)
      expect(result.contexts[0]!.chunk_id).toBe('chunk-1')
      expect(result.sources).toHaveLength(1) // Same doc_id
      expect(result.sources[0]!.chunk_count).toBe(2)
      expect(result.metadata.chunks_retrieved).toBe(2)
    })

    it('returns empty contexts when no chunks match', async () => {
      mockSearch.mockResolvedValue({ chunks: [], total: 0 })

      const result = await externalApiService.retrieval(
        'obscure query',
        ['dataset-1']
      )

      expect(result.contexts).toEqual([])
      expect(result.sources).toEqual([])
    })

    it('merges results from multiple datasets sorted by score', async () => {
      mockSearch
        .mockResolvedValueOnce({ chunks: [buildMockChunk({ score: 0.9 })], total: 1 })
        .mockResolvedValueOnce({ chunks: [buildMockChunk({ chunk_id: 'chunk-2', doc_id: 'doc-2', score: 0.6 })], total: 1 })

      const result = await externalApiService.retrieval(
        'multi-dataset query',
        ['ds-1', 'ds-2'],
        { top_k: 10 }
      )

      // Should be sorted by score descending
      expect(result.contexts[0]!.score).toBe(0.9)
      expect(result.contexts[1]!.score).toBe(0.6)
      expect(result.sources).toHaveLength(2) // Two different docs
    })

    it('handles search errors gracefully for individual datasets', async () => {
      mockSearch
        .mockResolvedValueOnce({ chunks: [buildMockChunk()], total: 1 })
        .mockRejectedValueOnce(new Error('OpenSearch unavailable'))

      const result = await externalApiService.retrieval(
        'partial failure',
        ['ds-ok', 'ds-fail']
      )

      // Should still return results from successful dataset
      expect(result.contexts).toHaveLength(1)
    })

    it('falls back to full-text when embedding fails', async () => {
      mockEmbedTexts.mockRejectedValue(new Error('Embedding service down'))
      mockSearch.mockResolvedValue({ chunks: [buildMockChunk()], total: 1 })

      const result = await externalApiService.retrieval(
        'fallback query',
        ['ds-1'],
        { method: 'semantic' }
      )

      // Should still return results (via full-text fallback)
      expect(result.contexts).toHaveLength(1)
    })

    it('excludes contexts when include_contexts is false', async () => {
      mockSearch.mockResolvedValue({ chunks: [buildMockChunk()], total: 1 })

      const result = await externalApiService.retrieval(
        'no contexts',
        ['ds-1'],
        { include_contexts: false }
      )

      expect(result.contexts).toEqual([])
      // Sources should still be present
      expect(result.sources).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // chat
  // -----------------------------------------------------------------------

  describe('chat', () => {
    it('retrieves chunks, generates answer, and returns structured response', async () => {
      const chunks = [buildMockChunk()]
      mockSearch.mockResolvedValue({ chunks, total: 1 })
      mockChatCompletion.mockResolvedValue('This is the AI answer.')
      mockInsertCitations.mockResolvedValue({
        answer: 'This is the AI answer. [1]',
        citedIndices: new Set([0]),
      })

      const result = await externalApiService.chat(
        'What is the test about?',
        { dataset_ids: ['ds-1'] },
        'user-1'
      )

      expect(result.answer).toBe('This is the AI answer. [1]')
      expect(result.contexts).toHaveLength(1)
      expect(result.sources).toHaveLength(1)
      expect(result.metadata.model).toBe('b-knowledge-rag')
      expect(result.metadata.retrieval_ms).toBeGreaterThanOrEqual(0)
      expect(result.metadata.generation_ms).toBeGreaterThanOrEqual(0)
    })

    it('resolves datasets from assistant_id when provided', async () => {
      mockChatAssistant.findById.mockResolvedValue({
        id: 'assistant-1',
        kb_ids: ['ds-from-assistant'],
        llm_id: 'provider-1',
        prompt_config: {},
      })
      mockSearch.mockResolvedValue({ chunks: [buildMockChunk()], total: 1 })
      mockChatCompletion.mockResolvedValue('Answer from assistant')
      mockInsertCitations.mockResolvedValue({
        answer: 'Answer from assistant',
        citedIndices: new Set(),
      })

      const result = await externalApiService.chat(
        'question',
        { assistant_id: 'assistant-1' },
        'user-1'
      )

      expect(result.answer).toBe('Answer from assistant')
      expect(result.metadata.assistant_id).toBe('assistant-1')
    })

    it('throws when assistant_id not found', async () => {
      mockChatAssistant.findById.mockResolvedValue(undefined)

      await expect(
        externalApiService.chat('q', { assistant_id: 'bad-id' }, 'user-1')
      ).rejects.toThrow('Assistant not found')
    })

    it('throws when no datasets are provided', async () => {
      await expect(
        externalApiService.chat('q', { dataset_ids: [] }, 'user-1')
      ).rejects.toThrow('No datasets specified')
    })
  })

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------

  describe('search', () => {
    it('retrieves chunks, generates summary, and returns structured response', async () => {
      const chunks = [buildMockChunk()]
      mockSearch.mockResolvedValue({ chunks, total: 1 })
      mockChatCompletion.mockResolvedValue('Search summary answer.')
      mockInsertCitations.mockResolvedValue({
        answer: 'Search summary answer.',
        citedIndices: new Set(),
      })

      const result = await externalApiService.search(
        'search query',
        { dataset_ids: ['ds-1'] },
        'user-1'
      )

      expect(result.answer).toBe('Search summary answer.')
      expect(result.metadata.model).toBe('b-knowledge-search')
    })

    it('resolves datasets from search_app_id', async () => {
      mockSearchApp.findById.mockResolvedValue({
        id: 'search-app-1',
        dataset_ids: ['ds-from-app'],
        search_config: { llm_id: 'provider-2' },
      })
      mockSearch.mockResolvedValue({ chunks: [buildMockChunk()], total: 1 })
      mockChatCompletion.mockResolvedValue('App-based answer')
      mockInsertCitations.mockResolvedValue({
        answer: 'App-based answer',
        citedIndices: new Set(),
      })

      const result = await externalApiService.search(
        'query',
        { search_app_id: 'search-app-1' },
        'user-1'
      )

      expect(result.answer).toBe('App-based answer')
      expect(result.metadata.search_app_id).toBe('search-app-1')
    })

    it('throws when search app not found', async () => {
      mockSearchApp.findById.mockResolvedValue(undefined)

      await expect(
        externalApiService.search('q', { search_app_id: 'bad-id' }, 'user-1')
      ).rejects.toThrow('Search app not found')
    })
  })
})
