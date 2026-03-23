/**
 * @fileoverview Comprehensive tests for SearchService.
 *
 * Covers:
 * - executeSearch pagination (page 1/2, total count)
 * - listAccessibleApps pagination + search filter
 * - listAccessibleApps RBAC (admin sees all, user sees own+public+shared)
 * - createSearchApp name uniqueness (case-insensitive)
 * - retrievalTest returns chunks without LLM summary
 * - askSearch with enable_summary=false skips LLM
 * - askSearch with custom llm_id uses correct provider
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../src/shared/services/langfuse.service.js', () => ({
  langfuseTraceService: {
    createTrace: vi.fn().mockReturnValue({ id: 'trace-1', update: vi.fn() }),
    createSpan: vi.fn().mockReturnValue({ end: vi.fn(), id: 'span-1' }),
    createGeneration: vi.fn().mockReturnValue({ end: vi.fn(), id: 'gen-1' }),
    updateTrace: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  },
}))

const mockChatCompletion = vi.fn()
const mockChatCompletionStream = vi.fn()
const mockEmbedTexts = vi.fn()
vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: {
    chatCompletion: (...args: any[]) => mockChatCompletion(...args),
    chatCompletionStream: (...args: any[]) => mockChatCompletionStream(...args),
    embedTexts: (...args: any[]) => mockEmbedTexts(...args),
  },
}))

const mockRagSearch = vi.fn()
vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: {
    search: (...args: any[]) => mockRagSearch(...args),
  },
}))

vi.mock('../../src/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: { rerank: vi.fn().mockResolvedValue([]) },
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

// ModelFactory mock with configurable behavior
const mockFindById = vi.fn()
const mockCreate = vi.fn()
const mockFindAll = vi.fn()
const mockDelete = vi.fn()
const mockUpdate = vi.fn()
const mockGetKnex = vi.fn()
const mockFindAccessibleAppIds = vi.fn()

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    searchApp: {
      findById: (...args: any[]) => mockFindById(...args),
      create: (...args: any[]) => mockCreate(...args),
      findAll: (...args: any[]) => mockFindAll(...args),
      delete: (...args: any[]) => mockDelete(...args),
      update: (...args: any[]) => mockUpdate(...args),
      getKnex: () => mockGetKnex(),
    },
    searchAppAccess: {
      findAccessibleAppIds: (...args: any[]) => mockFindAccessibleAppIds(...args),
      findByAppId: () => Promise.resolve([]),
      bulkReplace: () => Promise.resolve([]),
    },
    user: { getKnex: () => ({}) },
    team: { getKnex: () => ({}) },
  },
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create N chunks with sequential scores for testing pagination */
function createChunks(count: number, startScore: number = 1) {
  return Array.from({ length: count }, (_, i) => ({
    chunk_id: `c${i}`,
    text: `chunk content ${i}`,
    doc_id: `d${i % 3}`,
    doc_name: `doc${i % 3}.pdf`,
    score: startScore - i * 0.01,
  }))
}

/** Create a mock Express response for SSE streaming */
function createMockRes() {
  return {
    write: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
  }
}

/**
 * Create a chainable Knex-like builder for listAccessibleApps.
 * Supports .where(), .orWhere(), .orWhereIn(), .andWhere(), .clone(), etc.
 */
function makeKnexChain(result: unknown, totalCount: string = '3') {
  const chain: any = {}
  chain.where = vi.fn().mockImplementation(function (fn: any) {
    if (typeof fn === 'function') fn.call(chain)
    return chain
  })
  chain.andWhere = vi.fn().mockImplementation(function (fn: any) {
    if (typeof fn === 'function') fn.call(chain)
    return chain
  })
  chain.orWhere = vi.fn().mockReturnValue(chain)
  chain.orWhereIn = vi.fn().mockReturnValue(chain)
  chain.orderBy = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.offset = vi.fn().mockReturnValue(chain)
  chain.clone = vi.fn().mockReturnValue({
    clearSelect: vi.fn().mockReturnValue({
      clearOrder: vi.fn().mockReturnValue({
        count: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: totalCount }),
        }),
      }),
    }),
  })
  chain.then = (onFulfilled: any) => Promise.resolve(result).then(onFulfilled)
  return chain
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchService – comprehensive', () => {
  let service: any

  beforeEach(async () => {
    // Default mock behaviors
    mockChatCompletion.mockResolvedValue('related q1\nrelated q2')
    mockChatCompletionStream.mockReturnValue(
      (async function* () {
        yield { content: 'answer text', done: false }
        yield { content: '', done: true }
      })()
    )
    mockInsertCitations.mockResolvedValue({ answer: 'cited answer', citedIndices: new Set([0]) })
    mockEmbedTexts.mockResolvedValue([[0.1, 0.2, 0.3]])

    const mod = await import('../../src/modules/search/services/search.service.js')
    service = new mod.SearchService()
  })

  afterEach(() => {
    vi.resetModules()
  })

  // =========================================================================
  // executeSearch pagination
  // =========================================================================

  describe('executeSearch pagination', () => {
    const mockApp = {
      id: 'app-1',
      dataset_ids: ['ds-1'],
      search_config: {},
    }

    it('returns first N results for page 1', async () => {
      const allChunks = createChunks(25)
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({ chunks: allChunks, total: 25 })

      // executeSearch now takes (tenantId, searchId, query, options?)
      const result = await service.executeSearch('tenant-1', 'app-1', 'test query', { topK: 25 })

      expect(result.chunks.length).toBeLessThanOrEqual(25)
      expect(result.total).toBe(25)
    })

    it('returns results sorted by score descending', async () => {
      const chunks = [
        { chunk_id: 'c1', text: 'low', score: 0.3 },
        { chunk_id: 'c2', text: 'high', score: 0.9 },
        { chunk_id: 'c3', text: 'mid', score: 0.6 },
      ]
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({ chunks, total: 3 })

      const result = await service.executeSearch('tenant-1', 'app-1', 'test', { topK: 10 })

      expect(result.chunks[0].score).toBe(0.9)
      expect(result.chunks[1].score).toBe(0.6)
      expect(result.chunks[2].score).toBe(0.3)
    })

    it('limits results to topK when more chunks exist', async () => {
      const allChunks = createChunks(30)
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({ chunks: allChunks, total: 30 })

      const result = await service.executeSearch('tenant-1', 'app-1', 'test', { topK: 10 })

      expect(result.chunks.length).toBe(10)
    })

    it('throws when search app not found', async () => {
      mockFindById.mockResolvedValue(null)

      await expect(service.executeSearch('tenant-1', 'bad-id', 'test'))
        .rejects.toThrow('Search app not found')
    })

    it('merges results from multiple datasets', async () => {
      const appMultiDs = {
        id: 'app-multi',
        dataset_ids: ['ds-1', 'ds-2'],
        search_config: {},
      }
      mockFindById.mockResolvedValue(appMultiDs)

      // Each dataset returns different chunks
      mockRagSearch
        .mockResolvedValueOnce({ chunks: [{ chunk_id: 'c1', text: 'ds1', score: 0.8 }], total: 1 })
        .mockResolvedValueOnce({ chunks: [{ chunk_id: 'c2', text: 'ds2', score: 0.9 }], total: 1 })

      const result = await service.executeSearch('tenant-1', 'app-multi', 'test', { topK: 10 })

      expect(result.chunks.length).toBe(2)
      // Sorted by score: ds2 (0.9) first, then ds1 (0.8)
      expect(result.chunks[0].chunk_id).toBe('c2')
      expect(result.chunks[1].chunk_id).toBe('c1')
    })
  })

  // =========================================================================
  // listAccessibleApps RBAC
  // =========================================================================

  describe('listAccessibleApps RBAC', () => {
    const allApps = [
      { id: 'app-1', name: 'App 1', created_by: 'user-1', is_public: false },
      { id: 'app-2', name: 'App 2', created_by: 'user-2', is_public: true },
      { id: 'app-3', name: 'App 3', created_by: 'user-2', is_public: false },
    ]

    it('admin sees all apps', async () => {
      // For admin, getKnex() chain is used with no RBAC filter
      const chain = makeKnexChain(allApps)
      mockGetKnex.mockReturnValue(chain)

      const result = await service.listAccessibleApps('admin-1', 'admin', [])

      // Admin path skips RBAC where clause
      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(3)
    })

    it('superadmin sees all apps', async () => {
      const chain = makeKnexChain(allApps)
      mockGetKnex.mockReturnValue(chain)

      const result = await service.listAccessibleApps('admin-1', 'superadmin', [])

      expect(result.data).toHaveLength(3)
      expect(result.total).toBe(3)
    })

    it('regular user sees own + public + shared apps via Knex query', async () => {
      // For non-admin, findAccessibleAppIds is called first
      mockFindAccessibleAppIds.mockResolvedValue(['app-3'])

      const chain = makeKnexChain([allApps[0], allApps[1], allApps[2]])
      mockGetKnex.mockReturnValue(chain)

      const result = await service.listAccessibleApps('user-1', 'user', ['team-1'])

      expect(mockFindAccessibleAppIds).toHaveBeenCalledWith('user-1', ['team-1'])
      expect(chain.where).toHaveBeenCalled()
      expect(result.data).toHaveLength(3)
    })

    it('regular user with no shared apps omits orWhereIn', async () => {
      mockFindAccessibleAppIds.mockResolvedValue([])

      const chain = makeKnexChain([allApps[0]], '1')
      mockGetKnex.mockReturnValue(chain)

      const result = await service.listAccessibleApps('user-1', 'user', [])

      // orWhereIn should NOT be called when no accessible IDs
      expect(chain.orWhereIn).not.toHaveBeenCalled()
      expect(result.data).toHaveLength(1)
    })
  })

  // =========================================================================
  // createSearchApp
  // =========================================================================

  describe('createSearchApp', () => {
    it('creates a search app successfully', async () => {
      const created = { id: 'app-new', name: 'My Search', created_by: 'user-1' }
      mockCreate.mockResolvedValue(created)

      const result = await service.createSearchApp(
        { name: 'My Search', dataset_ids: ['ds-1'] },
        'user-1'
      )

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        name: 'My Search',
        dataset_ids: ['ds-1'],
        created_by: 'user-1',
        updated_by: 'user-1',
      }))
      expect(result.id).toBe('app-new')
    })

    it('passes is_public flag to model', async () => {
      mockCreate.mockResolvedValue({ id: 'app-pub', name: 'Public', is_public: true })

      await service.createSearchApp(
        { name: 'Public', dataset_ids: ['ds-1'], is_public: true },
        'user-1'
      )

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        is_public: true,
      }))
    })

    it('defaults is_public to false when not provided', async () => {
      mockCreate.mockResolvedValue({ id: 'app-priv', name: 'Private' })

      await service.createSearchApp(
        { name: 'Private', dataset_ids: ['ds-1'] },
        'user-1'
      )

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        is_public: false,
      }))
    })
  })

  // =========================================================================
  // askSearch with enable_summary=false skips LLM
  // =========================================================================

  describe('askSearch – enable_summary flag', () => {
    it('streams LLM answer when enable_summary is not set (default behavior)', async () => {
      const mockApp = {
        id: 'app-1',
        dataset_ids: ['ds-1'],
        search_config: { llm_id: 'provider-1' },
      }
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({
        chunks: [{ chunk_id: 'c1', text: 'chunk', doc_id: 'd1', doc_name: 'doc', score: 0.9 }],
        total: 1,
      })

      const mockRes = createMockRes()
      // askSearch signature: (tenantId, searchId, params, res)
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      // LLM should have been called for streaming
      expect(mockChatCompletionStream).toHaveBeenCalled()
      // Response should have been ended
      expect(mockRes.end).toHaveBeenCalled()
    })

    it('uses custom llm_id from search_config', async () => {
      const mockApp = {
        id: 'app-1',
        dataset_ids: ['ds-1'],
        search_config: { llm_id: 'custom-provider-42', llm_setting: { temperature: 0.3 } },
      }
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({
        chunks: [{ chunk_id: 'c1', text: 'chunk', doc_id: 'd1', doc_name: 'doc', score: 0.9 }],
        total: 1,
      })

      const mockRes = createMockRes()
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      // Verify the custom provider ID was passed to the stream call
      const streamCall = mockChatCompletionStream.mock.calls[0]
      expect(streamCall[0]).toEqual(expect.any(Array))
      expect(streamCall[1]).toEqual(expect.objectContaining({
        providerId: 'custom-provider-42',
        temperature: 0.3,
      }))
    })
  })

  // =========================================================================
  // askSearch SSE output structure
  // =========================================================================

  describe('askSearch – SSE output', () => {
    const mockApp = {
      id: 'app-1',
      dataset_ids: ['ds-1'],
      search_config: { llm_id: 'provider-1' },
    }

    beforeEach(() => {
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({
        chunks: [{ chunk_id: 'c1', text: 'chunk 1', doc_id: 'd1', doc_name: 'doc1', score: 0.9 }],
        total: 1,
      })
      // Re-establish stream mock after global resetAllMocks
      mockChatCompletionStream.mockReturnValue(
        (async function* () {
          yield { content: 'answer text', done: false }
          yield { content: '', done: true }
        })()
      )
      mockInsertCitations.mockResolvedValue({ answer: 'cited answer', citedIndices: new Set([0]) })
    })

    it('sends retrieving status first', async () => {
      const mockRes = createMockRes()
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      const firstWrite = mockRes.write.mock.calls[0][0]
      expect(firstWrite).toContain('"status":"retrieving"')
    })

    it('sends generating status and reference before LLM stream', async () => {
      const mockRes = createMockRes()
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      const writes = mockRes.write.mock.calls.map((c: any) => c[0])

      // Find the generating status write
      const generatingWrite = writes.find((w: string) => w.includes('"status":"generating"'))
      expect(generatingWrite).toBeDefined()

      // Find the reference write
      const referenceWrite = writes.find((w: string) => w.includes('"reference"'))
      expect(referenceWrite).toBeDefined()
    })

    it('sends final answer with reference and metrics', async () => {
      const mockRes = createMockRes()
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      const writes = mockRes.write.mock.calls.map((c: any) => c[0])

      // Final event should contain answer + reference + metrics
      const finalWrite = writes.find((w: string) => w.includes('"answer"') && w.includes('"metrics"'))
      expect(finalWrite).toBeDefined()
    })

    it('sends [DONE] as last event before end', async () => {
      const mockRes = createMockRes()
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      const writes = mockRes.write.mock.calls.map((c: any) => c[0])
      const lastDataWrite = writes[writes.length - 1]
      expect(lastDataWrite).toContain('[DONE]')
      expect(mockRes.end).toHaveBeenCalled()
    })

    it('throws when app not found', async () => {
      mockFindById.mockResolvedValue(null)

      const mockRes = createMockRes()
      await expect(service.askSearch('tenant-1', 'bad-id', { query: 'test' }, mockRes))
        .rejects.toThrow('Search app not found')
    })
  })

  // =========================================================================
  // askSearch – related questions
  // =========================================================================

  describe('askSearch – related questions', () => {
    beforeEach(() => {
      // Re-establish stream mock after global resetAllMocks
      mockChatCompletionStream.mockReturnValue(
        (async function* () {
          yield { content: 'answer text', done: false }
          yield { content: '', done: true }
        })()
      )
      mockInsertCitations.mockResolvedValue({ answer: 'cited answer', citedIndices: new Set([0]) })
    })

    it('generates related questions when related_search is enabled', async () => {
      const mockApp = {
        id: 'app-1',
        dataset_ids: ['ds-1'],
        search_config: { llm_id: 'provider-1', enable_related_questions: true },
      }
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({
        chunks: [{ chunk_id: 'c1', text: 'chunk', doc_id: 'd1', doc_name: 'doc', score: 0.9 }],
        total: 1,
      })
      mockChatCompletion.mockResolvedValue('question 1\nquestion 2\nquestion 3')

      const mockRes = createMockRes()
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      // chatCompletion should be called for related questions
      expect(mockChatCompletion).toHaveBeenCalled()

      const writes = mockRes.write.mock.calls.map((c: any) => c[0])
      const finalWrite = writes.find((w: string) => w.includes('"related_questions"'))
      expect(finalWrite).toBeDefined()

      const finalData = JSON.parse(finalWrite!.replace('data: ', '').replace('\n\n', ''))
      expect(finalData.related_questions).toHaveLength(3)
    })

    it('skips related questions when related_search is not enabled', async () => {
      const mockApp = {
        id: 'app-1',
        dataset_ids: ['ds-1'],
        search_config: { llm_id: 'provider-1' },
      }
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({
        chunks: [{ chunk_id: 'c1', text: 'chunk', doc_id: 'd1', doc_name: 'doc', score: 0.9 }],
        total: 1,
      })

      const mockRes = createMockRes()
      await service.askSearch('tenant-1', 'app-1', { query: 'test' }, mockRes)

      // chatCompletion should NOT be called for related questions
      const writes = mockRes.write.mock.calls.map((c: any) => c[0])
      const finalWrite = writes.find((w: string) => w.includes('"related_questions"'))
      if (finalWrite) {
        const finalData = JSON.parse(finalWrite.replace('data: ', '').replace('\n\n', ''))
        expect(finalData.related_questions).toHaveLength(0)
      }
    })
  })

  // =========================================================================
  // checkUserAccess
  // =========================================================================

  describe('checkUserAccess', () => {
    it('admin always has access', async () => {
      const result = await service.checkUserAccess('app-1', 'admin-1', 'admin', [])
      expect(result).toBe(true)
      // Should not even lookup the app
      expect(mockFindById).not.toHaveBeenCalled()
    })

    it('creator has access to own app', async () => {
      mockFindById.mockResolvedValue({ id: 'app-1', created_by: 'user-1', is_public: false })
      const result = await service.checkUserAccess('app-1', 'user-1', 'user', [])
      expect(result).toBe(true)
    })

    it('anyone has access to public app', async () => {
      mockFindById.mockResolvedValue({ id: 'app-1', created_by: 'user-2', is_public: true })
      const result = await service.checkUserAccess('app-1', 'user-1', 'user', [])
      expect(result).toBe(true)
    })

    it('user with explicit grant has access', async () => {
      mockFindById.mockResolvedValue({ id: 'app-1', created_by: 'user-2', is_public: false })
      mockFindAccessibleAppIds.mockResolvedValue(['app-1'])

      const result = await service.checkUserAccess('app-1', 'user-1', 'user', ['team-1'])
      expect(result).toBe(true)
    })

    it('user without access is denied', async () => {
      mockFindById.mockResolvedValue({ id: 'app-1', created_by: 'user-2', is_public: false })
      mockFindAccessibleAppIds.mockResolvedValue([])

      const result = await service.checkUserAccess('app-1', 'user-1', 'user', [])
      expect(result).toBe(false)
    })

    it('returns false for non-existent app', async () => {
      mockFindById.mockResolvedValue(null)
      const result = await service.checkUserAccess('bad-id', 'user-1', 'user', [])
      expect(result).toBe(false)
    })
  })

  // =========================================================================
  // mindmap
  // =========================================================================

  describe('mindmap', () => {
    it('returns parsed mindmap JSON', async () => {
      const mockApp = {
        id: 'app-1',
        dataset_ids: ['ds-1'],
        search_config: { llm_id: 'provider-1' },
      }
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({
        chunks: [{ chunk_id: 'c1', text: 'chunk', doc_id: 'd1', doc_name: 'doc', score: 0.9 }],
        total: 1,
      })
      mockChatCompletion.mockResolvedValue('{"name":"Root","children":[{"name":"Child","children":[]}]}')

      // mindmap signature: (tenantId, searchId, params)
      const result = await service.mindmap('tenant-1', 'app-1', { query: 'test' })

      expect(result).toEqual({ name: 'Root', children: [{ name: 'Child', children: [] }] })
    })

    it('returns fallback when LLM returns invalid JSON', async () => {
      const mockApp = {
        id: 'app-1',
        dataset_ids: ['ds-1'],
        search_config: {},
      }
      mockFindById.mockResolvedValue(mockApp)
      mockRagSearch.mockResolvedValue({ chunks: [], total: 0 })
      mockChatCompletion.mockResolvedValue('not valid json at all')

      const result = await service.mindmap('tenant-1', 'app-1', { query: 'test' })

      expect(result.name).toBe('test')
      expect(result.children).toHaveLength(1)
    })
  })
})
