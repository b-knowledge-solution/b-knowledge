/**
 * @fileoverview Tests for ChatConversationService RAG pipeline Langfuse tracing.
 *
 * Verifies that the streamChat method creates traces, spans, and updates them
 * correctly through the RAG pipeline, and that tracing errors do not break
 * the pipeline flow.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Delegate mocks (survive resetAllMocks)
// ---------------------------------------------------------------------------

const mockCreateTrace = vi.fn()
const mockCreateSpan = vi.fn()
const mockUpdateTrace = vi.fn()
const mockFlush = vi.fn()
const mockCreateGeneration = vi.fn()

vi.mock('../../src/shared/services/langfuse.service.js', () => ({
  langfuseTraceService: {
    createTrace: (...a: any[]) => mockCreateTrace(...a),
    createSpan: (...a: any[]) => mockCreateSpan(...a),
    createGeneration: (...a: any[]) => mockCreateGeneration(...a),
    updateTrace: (...a: any[]) => mockUpdateTrace(...a),
    flush: (...a: any[]) => mockFlush(...a),
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}))

vi.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}))

const mockChatCompletion = vi.fn()
const mockChatCompletionStream = vi.fn()
vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: {
    chatCompletion: (...a: any[]) => mockChatCompletion(...a),
    chatCompletionStream: (...a: any[]) => mockChatCompletionStream(...a),
  },
}))

const mockRagSearch = vi.fn()
vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: {
    search: (...a: any[]) => mockRagSearch(...a),
  },
}))

vi.mock('../../src/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: { rerank: () => Promise.resolve([]) },
}))

const mockInsertCitations = vi.fn()
vi.mock('../../src/modules/rag/services/rag-citation.service.js', () => ({
  ragCitationService: {
    insertCitations: (...a: any[]) => mockInsertCitations(...a),
  },
}))

vi.mock('../../src/modules/rag/services/rag-sql.service.js', () => ({
  ragSqlService: { querySql: () => Promise.resolve(null) },
}))

vi.mock('../../src/modules/rag/services/rag-graphrag.service.js', () => ({
  ragGraphragService: { retrieval: () => Promise.resolve('') },
}))

vi.mock('../../src/modules/rag/services/rag-deep-research.service.js', () => ({
  ragDeepResearchService: { research: () => Promise.resolve([]) },
}))

vi.mock('../../src/shared/services/web-search.service.js', () => ({
  searchWeb: () => Promise.resolve([]),
}))

vi.mock('@/modules/rag/index.js', () => ({
  queryLogService: { logQuery: vi.fn() },
}))

vi.mock('@/shared/utils/language-detect.js', () => ({
  detectLanguage: () => 'en',
  buildLanguageInstruction: () => '',
}))

vi.mock('@/shared/services/ability.service.js', () => ({
  abilityService: { buildAbility: vi.fn() },
  buildOpenSearchAbacFilters: () => [],
}))

vi.mock('../../src/shared/prompts/index.js', () => ({
  fullQuestionPrompt: { system: 'sys', buildUser: () => 'user prompt' },
  crossLanguagePrompt: { system: 'sys', buildUser: () => 'cross prompt' },
  keywordPrompt: { build: () => 'kw prompt' },
  citationPrompt: { system: 'cite instructions' },
  askSummaryPrompt: { build: () => 'summary' },
}))

// Mock knex builder
function makeBuilder(result: unknown = []) {
  const builder: any = {
    where: () => builder,
    andWhere: () => builder,
    orderBy: () => builder,
    limit: () => builder,
    whereIn: () => builder,
    delete: () => Promise.resolve(1),
    count: () => ({ first: () => Promise.resolve({ count: '2' }) }),
    first: () => Promise.resolve({ count: 2 }),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  }
  return builder
}

const mockDialogFindById = vi.fn()
const mockSessionCreate = vi.fn()
const mockSessionUpdate = vi.fn()
const mockMessageCreate = vi.fn()
const mockFindDefaults = vi.fn()

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    chatAssistant: { findById: (...a: any[]) => mockDialogFindById(...a) },
    chatSession: {
      findById: () => Promise.resolve({ id: 'sess-1', user_id: 'user-1' }),
      create: (...a: any[]) => mockSessionCreate(...a),
      update: (...a: any[]) => mockSessionUpdate(...a),
      getKnex: () => makeBuilder([]),
    },
    chatMessage: {
      create: (...a: any[]) => mockMessageCreate(...a),
      findById: () => Promise.resolve(null),
      getKnex: () => makeBuilder([]),
    },
    modelProvider: {
      findDefaults: (...a: any[]) => mockFindDefaults(...a),
    },
  },
}))

describe('ChatConversationService – RAG pipeline tracing', () => {
  let service: any
  let mockRes: any

  beforeEach(async () => {
    mockCreateTrace.mockReset()
    mockCreateSpan.mockReset()
    mockUpdateTrace.mockReset()
    mockFlush.mockReset()
    mockCreateGeneration.mockReset()
    mockChatCompletion.mockReset()
    mockChatCompletionStream.mockReset()
    mockRagSearch.mockReset()
    mockInsertCitations.mockReset()
    mockDialogFindById.mockReset()
    mockSessionCreate.mockReset()
    mockSessionUpdate.mockReset()
    mockMessageCreate.mockReset()
    mockFindDefaults.mockReset()

    const mockDialog = {
      id: 'dialog-1',
      kb_ids: ['kb-1'],
      llm_id: 'provider-1',
      prompt_config: { system: 'You are helpful.', top_n: 3, quote: true },
    }

    // Set up mock implementations
    const mockSpan = { end: vi.fn(), id: 'span-1' }
    const mockTrace = { id: 'trace-1', span: vi.fn().mockReturnValue(mockSpan), update: vi.fn() }
    mockCreateTrace.mockReturnValue(mockTrace)
    mockCreateSpan.mockReturnValue(mockSpan)
    mockFlush.mockResolvedValue(undefined)
    mockDialogFindById.mockResolvedValue(mockDialog)
    mockSessionCreate.mockResolvedValue({ id: 'sess-1' })
    mockSessionUpdate.mockResolvedValue({})
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' })
    mockFindDefaults.mockResolvedValue([
      { model_type: 'embedding', id: 'emb-1' },
      { model_type: 'chat', id: 'chat-1' },
    ])
    mockChatCompletion.mockResolvedValue('refined question')
    mockRagSearch.mockResolvedValue({
      chunks: [
        { chunk_id: 'c1', text: 'chunk text 1', doc_id: 'd1', doc_name: 'doc1', score: 0.9 },
        { chunk_id: 'c2', text: 'chunk text 2', doc_id: 'd1', doc_name: 'doc1', score: 0.8 },
      ],
      total: 2,
    })
    mockInsertCitations.mockResolvedValue({
      answer: 'processed answer',
      citedIndices: new Set([0]),
    })

    mockChatCompletionStream.mockReturnValue(
      (async function* () {
        yield { content: 'hello', done: false }
        yield { content: ' world', done: true }
      })()
    )

    mockRes = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    }

    const mod = await import('../../src/modules/chat/services/chat-conversation.service.js')
    service = new mod.ChatConversationService()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('creates a Langfuse trace at pipeline start', async () => {
    await service.streamChat('sess-1', 'hello?', 'dialog-1', 'user-1', mockRes)

    expect(mockCreateTrace).toHaveBeenCalledWith(expect.objectContaining({
      name: 'chat-rag-pipeline',
      userId: 'user-1',
      sessionId: 'sess-1',
      input: 'hello?',
      tags: ['chat', 'rag-pipeline'],
    }))
  })

  it('creates retrieval span with chunk texts output', async () => {
    await service.streamChat('sess-1', 'hello?', 'dialog-1', 'user-1', mockRes)

    expect(mockCreateSpan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'retrieval' })
    )
  })

  it('updates trace with final answer and flushes', async () => {
    await service.streamChat('sess-1', 'hello?', 'dialog-1', 'user-1', mockRes)

    expect(mockUpdateTrace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ output: 'processed answer' })
    )
    expect(mockFlush).toHaveBeenCalled()
  })

  it('does not break pipeline when trace creation fails', async () => {
    mockCreateTrace.mockImplementation(() => { throw new Error('trace fail') })

    await service.streamChat('sess-1', 'hello?', 'dialog-1', 'user-1', mockRes)

    expect(mockRes.end).toHaveBeenCalled()
    expect(mockRes.write).toHaveBeenCalled()
  })

  it('does not break pipeline when span creation fails', async () => {
    const mockTrace = { id: 'trace-1', span: vi.fn(), update: vi.fn() }
    mockCreateTrace.mockReturnValue(mockTrace)
    mockCreateSpan.mockImplementation(() => { throw new Error('span fail') })

    await service.streamChat('sess-1', 'hello?', 'dialog-1', 'user-1', mockRes)

    expect(mockRes.end).toHaveBeenCalled()
  })

  it('creates reranking and main-completion spans', async () => {
    await service.streamChat('sess-1', 'hello?', 'dialog-1', 'user-1', mockRes)

    const spanNames = mockCreateSpan.mock.calls.map((c: any) => c[1]?.name)
    expect(spanNames).toContain('retrieval')
    expect(spanNames).toContain('reranking')
    expect(spanNames).toContain('main-completion')
  })
})
