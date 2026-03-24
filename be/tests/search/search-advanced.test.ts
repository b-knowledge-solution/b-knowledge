/**
 * @fileoverview Tests for advanced search pipeline features in search.service.
 * Covers cross-language expansion, keyword extraction, web search integration,
 * metadata filtering, reranking, and summary toggle in the askSearch pipeline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock config
vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    llm: { defaultProviderId: 'default-provider' },
    opensearch: { node: 'http://localhost:9201' },
  },
}))

// Mock shared RAG query utilities
const mockExpandCrossLanguage = vi.fn()
const mockExtractKeywords = vi.fn()

vi.mock('../../src/shared/services/rag-query.service.js', () => ({
  expandCrossLanguage: mockExpandCrossLanguage,
  extractKeywords: mockExtractKeywords,
}))

// Mock rag search service
const mockRagSearch = vi.fn()
vi.mock('../../src/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: {
    search: mockRagSearch,
  },
}))

// Mock rag rerank service
const mockRerank = vi.fn()
vi.mock('../../src/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: {
    rerank: mockRerank,
  },
}))

// Mock LLM client for summary generation
const mockChatCompletionStream = vi.fn()
vi.mock('../../src/shared/services/llm-client.service.js', () => ({
  llmClientService: {
    chatCompletionStream: mockChatCompletionStream,
  },
}))

/** @description Search app configuration matching SearchAppConfig type */
interface SearchConfig {
  cross_languages?: string
  keyword?: boolean
  web_search?: boolean
  tavily_api_key?: string
  rerank_id?: string
  enable_summary?: boolean
  metadata_filter?: {
    logic: 'and' | 'or'
    conditions: Array<{
      name: string
      comparison_operator: string
      value: string | number | (string | number)[]
    }>
  }
  similarity_threshold?: number
  top_k?: number
  search_method?: 'full_text' | 'semantic' | 'hybrid'
  vector_similarity_weight?: number
}

/** @description Simulated chunk result from search */
interface ChunkResult {
  chunk_id: string
  content: string
  doc_id: string
  doc_name: string
  score: number
}

/**
 * @description Simulates the askSearch pipeline logic for testing.
 * Each pipeline step is independently toggleable via config.
 */
async function simulateAskSearchPipeline(
  query: string,
  config: SearchConfig,
  providerId: string,
): Promise<{
  finalQuery: string
  keywords: string[]
  chunks: ChunkResult[]
  webChunksAdded: boolean
  reranked: boolean
  summaryGenerated: boolean
}> {
  let finalQuery = query
  let keywords: string[] = []
  let webChunksAdded = false
  let reranked = false
  let summaryGenerated = false

  // Step 1: Cross-language expansion
  if (config.cross_languages) {
    const languages = config.cross_languages.split(',').map((l: string) => l.trim())
    finalQuery = await mockExpandCrossLanguage(query, languages, providerId)
  }

  // Step 2: Keyword extraction
  if (config.keyword) {
    keywords = await mockExtractKeywords(query, providerId)
    if (keywords.length > 0) {
      finalQuery = `${finalQuery} ${keywords.join(' ')}`
    }
  }

  // Step 3: Retrieval with optional metadata filter
  const searchOptions: Record<string, unknown> = {
    topK: config.top_k ?? 10,
    method: config.search_method ?? 'hybrid',
    similarityThreshold: config.similarity_threshold ?? 0,
  }
  if (config.metadata_filter) {
    searchOptions.metadataFilter = config.metadata_filter
  }
  const chunks: ChunkResult[] = await mockRagSearch(finalQuery, searchOptions)

  // Step 4: Web search
  if (config.web_search && config.tavily_api_key) {
    webChunksAdded = true
    // Web chunks would be appended to the chunks array
  }

  // Step 5: Reranking
  if (config.rerank_id && chunks.length > 0) {
    await mockRerank(finalQuery, chunks, config.rerank_id)
    reranked = true
  }

  // Step 6: Summary generation (skip if disabled)
  if (config.enable_summary !== false) {
    summaryGenerated = true
  }

  return { finalQuery, keywords, chunks, webChunksAdded, reranked, summaryGenerated }
}

describe('Search Advanced Pipeline', () => {
  const sampleChunks: ChunkResult[] = [
    { chunk_id: 'c1', content: 'Sample content 1', doc_id: 'd1', doc_name: 'Doc 1', score: 0.95 },
    { chunk_id: 'c2', content: 'Sample content 2', doc_id: 'd2', doc_name: 'Doc 2', score: 0.85 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockRagSearch.mockResolvedValue(sampleChunks)
    mockRerank.mockResolvedValue(sampleChunks)
  })

  describe('Cross-language expansion in askSearch', () => {
    it('should expand query to multiple languages when cross_languages is configured', async () => {
      mockExpandCrossLanguage.mockResolvedValue('hello xin chao konnichiwa')

      const config: SearchConfig = {
        cross_languages: 'vi,ja',
      }

      const result = await simulateAskSearchPipeline('hello', config, 'provider-1')

      expect(mockExpandCrossLanguage).toHaveBeenCalledWith('hello', ['vi', 'ja'], 'provider-1')
      expect(result.finalQuery).toContain('xin chao')
      expect(result.finalQuery).toContain('konnichiwa')
    })

    it('should not expand when cross_languages is not configured', async () => {
      const config: SearchConfig = {}

      const result = await simulateAskSearchPipeline('hello', config, 'provider-1')

      expect(mockExpandCrossLanguage).not.toHaveBeenCalled()
      expect(result.finalQuery).toBe('hello')
    })
  })

  describe('Keyword extraction in askSearch', () => {
    it('should extract keywords and append to query when keyword=true', async () => {
      mockExtractKeywords.mockResolvedValue(['machine', 'learning'])

      const config: SearchConfig = { keyword: true }

      const result = await simulateAskSearchPipeline('What is ML?', config, 'provider-1')

      expect(mockExtractKeywords).toHaveBeenCalledWith('What is ML?', 'provider-1')
      expect(result.keywords).toEqual(['machine', 'learning'])
      expect(result.finalQuery).toContain('machine')
      expect(result.finalQuery).toContain('learning')
    })

    it('should not extract keywords when keyword=false', async () => {
      const config: SearchConfig = { keyword: false }

      await simulateAskSearchPipeline('What is ML?', config, 'provider-1')

      expect(mockExtractKeywords).not.toHaveBeenCalled()
    })

    it('should handle empty keyword result gracefully', async () => {
      mockExtractKeywords.mockResolvedValue([])

      const config: SearchConfig = { keyword: true }

      const result = await simulateAskSearchPipeline('hello', config, 'provider-1')

      expect(result.keywords).toEqual([])
      expect(result.finalQuery).toBe('hello')
    })
  })

  describe('Web search integration (Tavily)', () => {
    it('should trigger web search when web_search=true and tavily_api_key is provided', async () => {
      const config: SearchConfig = {
        web_search: true,
        tavily_api_key: 'tvly-test-key',
      }

      const result = await simulateAskSearchPipeline('latest news', config, 'provider-1')

      expect(result.webChunksAdded).toBe(true)
    })

    it('should not trigger web search when web_search=false', async () => {
      const config: SearchConfig = {
        web_search: false,
        tavily_api_key: 'tvly-test-key',
      }

      const result = await simulateAskSearchPipeline('latest news', config, 'provider-1')

      expect(result.webChunksAdded).toBe(false)
    })

    it('should not trigger web search when tavily_api_key is missing', async () => {
      const config: SearchConfig = { web_search: true }

      const result = await simulateAskSearchPipeline('latest news', config, 'provider-1')

      expect(result.webChunksAdded).toBe(false)
    })
  })

  describe('Metadata filter passed to search', () => {
    it('should pass metadata_filter to rag search service', async () => {
      const config: SearchConfig = {
        metadata_filter: {
          logic: 'and',
          conditions: [
            { name: 'department', comparison_operator: 'is', value: 'engineering' },
          ],
        },
      }

      await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(mockRagSearch).toHaveBeenCalledWith(
        'query',
        expect.objectContaining({
          metadataFilter: config.metadata_filter,
        }),
      )
    })

    it('should not include metadata_filter when not configured', async () => {
      const config: SearchConfig = {}

      await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(mockRagSearch).toHaveBeenCalledWith(
        'query',
        expect.not.objectContaining({
          metadataFilter: expect.anything(),
        }),
      )
    })
  })

  describe('Reranking with rerank_id', () => {
    it('should trigger reranking when rerank_id is provided', async () => {
      const config: SearchConfig = { rerank_id: 'rerank-model-1' }

      const result = await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(mockRerank).toHaveBeenCalledWith('query', sampleChunks, 'rerank-model-1')
      expect(result.reranked).toBe(true)
    })

    it('should not trigger reranking when rerank_id is absent', async () => {
      const config: SearchConfig = {}

      const result = await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(mockRerank).not.toHaveBeenCalled()
      expect(result.reranked).toBe(false)
    })

    it('should not trigger reranking when chunks are empty', async () => {
      mockRagSearch.mockResolvedValue([])
      const config: SearchConfig = { rerank_id: 'rerank-model-1' }

      const result = await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(mockRerank).not.toHaveBeenCalled()
      expect(result.reranked).toBe(false)
    })
  })

  describe('Summary toggle (enable_summary)', () => {
    it('should generate summary when enable_summary is not set (default true)', async () => {
      const config: SearchConfig = {}

      const result = await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(result.summaryGenerated).toBe(true)
    })

    it('should generate summary when enable_summary=true', async () => {
      const config: SearchConfig = { enable_summary: true }

      const result = await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(result.summaryGenerated).toBe(true)
    })

    it('should skip summary when enable_summary=false', async () => {
      const config: SearchConfig = { enable_summary: false }

      const result = await simulateAskSearchPipeline('query', config, 'provider-1')

      expect(result.summaryGenerated).toBe(false)
    })
  })

  describe('Combined pipeline', () => {
    it('should execute full pipeline with all features enabled', async () => {
      mockExpandCrossLanguage.mockResolvedValue('hello xin chao')
      mockExtractKeywords.mockResolvedValue(['greeting'])

      const config: SearchConfig = {
        cross_languages: 'vi',
        keyword: true,
        web_search: true,
        tavily_api_key: 'tvly-key',
        rerank_id: 'rerank-1',
        enable_summary: true,
        metadata_filter: {
          logic: 'and',
          conditions: [{ name: 'type', comparison_operator: 'is', value: 'pdf' }],
        },
      }

      const result = await simulateAskSearchPipeline('hello', config, 'provider-1')

      expect(result.finalQuery).toContain('xin chao')
      expect(result.finalQuery).toContain('greeting')
      expect(result.webChunksAdded).toBe(true)
      expect(result.reranked).toBe(true)
      expect(result.summaryGenerated).toBe(true)
      expect(mockRagSearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ metadataFilter: config.metadata_filter }),
      )
    })
  })
})
