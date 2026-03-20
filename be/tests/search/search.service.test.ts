/**
 * @fileoverview Tests for SearchService Langfuse tracing in askSearch.
 *
 * Verifies that search pipeline creates trace with retrieval span
 * and completion span, and updates trace with final answer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateTrace = vi.fn()
const mockCreateSpan = vi.fn()
const mockUpdateTrace = vi.fn()
const mockFlush = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/shared/services/langfuse.service.js', () => ({
  langfuseTraceService: {
    createTrace: mockCreateTrace,
    createSpan: mockCreateSpan,
    updateTrace: mockUpdateTrace,
    flush: mockFlush,
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

const mockChatCompletion = vi.fn()
const mockChatCompletionStream = vi.fn()
vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: {
    chatCompletion: (...args: any[]) => mockChatCompletion(...args),
    chatCompletionStream: (...args: any[]) => mockChatCompletionStream(...args),
  },
}))

const mockRagSearch = vi.fn()
vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: {
    search: (...args: any[]) => mockRagSearch(...args),
  },
}))

vi.mock('../../src/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: { rerank: () => Promise.resolve([]) },
}))

const mockInsertCitations = vi.fn()
vi.mock('../../src/modules/rag/services/rag-citation.service.js', () => ({
  ragCitationService: {
    insertCitations: (...args: any[]) => mockInsertCitations(...args),
  },
}))

vi.mock('../../src/shared/prompts/index.js', () => ({
  askSummaryPrompt: { build: () => 'summary prompt' },
  citationPrompt: { system: 'cite instructions' },
  relatedQuestionPrompt: { system: 'related q prompt' },
}))

vi.mock('../../src/modules/rag/index.js', () => ({
  queryLogService: { logQuery: vi.fn() },
}))

vi.mock('../../src/shared/services/web-search.service.js', () => ({
  searchWeb: vi.fn(),
}))

const mockFindById = vi.fn()

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    searchApp: {
      findById: (...args: any[]) => mockFindById(...args),
      create: () => Promise.resolve({}),
      findAll: () => Promise.resolve([]),
      delete: () => Promise.resolve(),
      update: () => Promise.resolve({}),
      getKnex: () => ({}),
    },
    searchAppAccess: {
      findAccessibleAppIds: () => Promise.resolve([]),
      findByAppId: () => Promise.resolve([]),
      bulkReplace: () => Promise.resolve([]),
    },
    user: { getKnex: () => ({}) },
    team: { getKnex: () => ({}) },
  },
}))

describe('SearchService – askSearch tracing', () => {
  let service: any
  let mockRes: any

  beforeEach(async () => {
    mockCreateTrace.mockReset()
    mockCreateSpan.mockReset()
    mockUpdateTrace.mockReset()
    mockFlush.mockReset()
    mockFindById.mockReset()
    mockRagSearch.mockReset()
    mockInsertCitations.mockReset()
    mockChatCompletion.mockReset()
    mockChatCompletionStream.mockReset()

    const mockApp = {
      id: 'app-1',
      dataset_ids: ['ds-1'],
      search_config: { llm_id: 'provider-1', temperature: 0.5 },
    }

    const mockSpan = { end: vi.fn(), id: 'span-1' }
    const mockTrace = { id: 'trace-1', update: vi.fn() }
    mockCreateTrace.mockReturnValue(mockTrace)
    mockCreateSpan.mockReturnValue(mockSpan)
    mockFlush.mockResolvedValue(undefined)
    mockFindById.mockResolvedValue(mockApp)
    mockRagSearch.mockResolvedValue({
      chunks: [{ chunk_id: 'c1', text: 'chunk 1', doc_id: 'd1', doc_name: 'doc1', score: 0.9 }],
      total: 1,
    })
    mockInsertCitations.mockResolvedValue({ answer: 'cited answer', citedIndices: new Set([0]) })
    mockChatCompletion.mockResolvedValue('related q1\nrelated q2')

    mockChatCompletionStream.mockReturnValue(
      (async function* () {
        yield { content: 'answer text', done: false }
        yield { content: '', done: true }
      })()
    )

    mockRes = {
      write: vi.fn(),
      end: vi.fn(),
    }

    const mod = await import('../../src/modules/search/services/search.service.js')
    service = new mod.SearchService()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('creates a search-pipeline trace', async () => {
    await service.askSearch('tenant-1', 'app-1', { query: 'test query' }, mockRes)

    expect(mockCreateTrace).toHaveBeenCalledWith(expect.objectContaining({
      name: 'search-pipeline',
      input: 'test query',
      tags: ['search', 'ask-search'],
      metadata: { searchId: 'app-1' },
    }))
  })

  it('creates retrieval span with query input', async () => {
    await service.askSearch('tenant-1', 'app-1', { query: 'test query' }, mockRes)

    expect(mockCreateSpan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'retrieval', input: 'test query' })
    )
  })

  it('creates main-completion span', async () => {
    await service.askSearch('tenant-1', 'app-1', { query: 'test query' }, mockRes)

    const spanNames = mockCreateSpan.mock.calls.map((c: any) => c[1]?.name)
    expect(spanNames).toContain('main-completion')
  })

  it('updates trace with final output and flushes', async () => {
    await service.askSearch('tenant-1', 'app-1', { query: 'test query' }, mockRes)

    expect(mockUpdateTrace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ output: expect.anything() })
    )
    expect(mockFlush).toHaveBeenCalled()
  })

  it('completes stream even when trace creation fails', async () => {
    mockCreateTrace.mockImplementation(() => { throw new Error('trace fail') })

    await service.askSearch('tenant-1', 'app-1', { query: 'test query' }, mockRes)

    expect(mockRes.end).toHaveBeenCalled()
  })
})
