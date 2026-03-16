/**
 * @fileoverview Unit tests for dataset API methods.
 * Verifies correct HTTP calls, parameter passing, and URL construction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  apiFetch: vi.fn(),
}))

import { datasetApi } from '../../../src/features/datasets/api/datasetApi'
import { api } from '../../../src/lib/api'

describe('datasetApi', () => {
  beforeEach(() => vi.clearAllMocks())

  // --------------------------------------------------------------------------
  // addChunk
  // --------------------------------------------------------------------------
  describe('addChunk', () => {
    it('sends content field (not text) with keywords', async () => {
      vi.mocked(api.post).mockResolvedValue({ chunk_id: 'c1' })

      await datasetApi.addChunk('ds1', {
        content: 'hello world',
        important_keywords: ['key1'],
        question_keywords: ['q1'],
      })

      expect(api.post).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/chunks',
        expect.objectContaining({
          content: 'hello world',
          important_keywords: ['key1'],
          question_keywords: ['q1'],
        }),
      )
    })

    it('does not send a text field', async () => {
      vi.mocked(api.post).mockResolvedValue({ chunk_id: 'c2' })

      await datasetApi.addChunk('ds1', { content: 'test' })

      // Verify the payload uses 'content', not 'text'
      const payload = vi.mocked(api.post).mock.calls[0]![1] as Record<string, unknown>
      expect(payload).toHaveProperty('content')
      expect(payload).not.toHaveProperty('text')
    })
  })

  // --------------------------------------------------------------------------
  // bulkSwitchChunks
  // --------------------------------------------------------------------------
  describe('bulkSwitchChunks', () => {
    it('calls POST with chunk_ids and available flag', async () => {
      vi.mocked(api.post).mockResolvedValue({ updated: 3 })

      await datasetApi.bulkSwitchChunks('ds1', {
        chunk_ids: ['c1', 'c2', 'c3'],
        available: true,
      })

      expect(api.post).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/chunks/bulk-switch',
        { chunk_ids: ['c1', 'c2', 'c3'], available: true },
      )
    })

    it('passes available=false correctly', async () => {
      vi.mocked(api.post).mockResolvedValue({ updated: 1 })

      await datasetApi.bulkSwitchChunks('ds1', {
        chunk_ids: ['c1'],
        available: false,
      })

      expect(api.post).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/chunks/bulk-switch',
        { chunk_ids: ['c1'], available: false },
      )
    })
  })

  // --------------------------------------------------------------------------
  // listChunks
  // --------------------------------------------------------------------------
  describe('listChunks', () => {
    it('passes available as "1" when true', async () => {
      vi.mocked(api.get).mockResolvedValue({ chunks: [], total: 0 })

      await datasetApi.listChunks('ds1', { available: true })

      // URL should contain available=1
      const url = vi.mocked(api.get).mock.calls[0]![0] as string
      expect(url).toContain('available=1')
    })

    it('passes available as "0" when false', async () => {
      vi.mocked(api.get).mockResolvedValue({ chunks: [], total: 0 })

      await datasetApi.listChunks('ds1', { available: false })

      const url = vi.mocked(api.get).mock.calls[0]![0] as string
      expect(url).toContain('available=0')
    })

    it('omits available param when undefined', async () => {
      vi.mocked(api.get).mockResolvedValue({ chunks: [], total: 0 })

      await datasetApi.listChunks('ds1', { page: 1, limit: 10 })

      const url = vi.mocked(api.get).mock.calls[0]![0] as string
      expect(url).not.toContain('available')
    })

    it('builds query string with multiple params', async () => {
      vi.mocked(api.get).mockResolvedValue({ chunks: [], total: 0 })

      await datasetApi.listChunks('ds1', {
        doc_id: 'd1',
        page: 2,
        limit: 20,
        search: 'hello',
      })

      const url = vi.mocked(api.get).mock.calls[0]![0] as string
      expect(url).toContain('doc_id=d1')
      expect(url).toContain('page=2')
      expect(url).toContain('limit=20')
      expect(url).toContain('search=hello')
    })

    it('calls base URL with no query string when no params', async () => {
      vi.mocked(api.get).mockResolvedValue({ chunks: [], total: 0 })

      await datasetApi.listChunks('ds1')

      expect(api.get).toHaveBeenCalledWith('/api/rag/datasets/ds1/chunks')
    })
  })

  // --------------------------------------------------------------------------
  // runRetrievalTest
  // --------------------------------------------------------------------------
  describe('runRetrievalTest', () => {
    it('passes similarity_threshold, vector_similarity_weight, and doc_ids', async () => {
      vi.mocked(api.post).mockResolvedValue({ chunks: [] })

      await datasetApi.runRetrievalTest('ds1', {
        query: 'test query',
        method: 'hybrid',
        top_k: 5,
        similarity_threshold: 0.7,
        vector_similarity_weight: 0.5,
        doc_ids: ['d1', 'd2'],
      })

      expect(api.post).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/retrieval-test',
        {
          query: 'test query',
          method: 'hybrid',
          top_k: 5,
          similarity_threshold: 0.7,
          vector_similarity_weight: 0.5,
          doc_ids: ['d1', 'd2'],
        },
      )
    })

    it('works with only required query param', async () => {
      vi.mocked(api.post).mockResolvedValue({ chunks: [] })

      await datasetApi.runRetrievalTest('ds1', { query: 'simple' })

      expect(api.post).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/retrieval-test',
        { query: 'simple' },
      )
    })
  })

  // --------------------------------------------------------------------------
  // changeDocumentParser
  // --------------------------------------------------------------------------
  describe('changeDocumentParser', () => {
    it('calls PUT with parser_id', async () => {
      vi.mocked(api.put).mockResolvedValue({ id: 'd1', parser_id: 'naive' })

      await datasetApi.changeDocumentParser('ds1', 'd1', { parser_id: 'naive' })

      expect(api.put).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/documents/d1/parser',
        { parser_id: 'naive' },
      )
    })

    it('includes parser_config when provided', async () => {
      vi.mocked(api.put).mockResolvedValue({ id: 'd1', parser_id: 'custom' })

      await datasetApi.changeDocumentParser('ds1', 'd1', {
        parser_id: 'custom',
        parser_config: { chunk_size: 512 },
      })

      expect(api.put).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/documents/d1/parser',
        { parser_id: 'custom', parser_config: { chunk_size: 512 } },
      )
    })
  })

  // --------------------------------------------------------------------------
  // webCrawlDocument
  // --------------------------------------------------------------------------
  describe('webCrawlDocument', () => {
    it('calls POST with url, name, and auto_parse', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'd1', name: 'Example' })

      await datasetApi.webCrawlDocument('ds1', {
        url: 'https://example.com',
        name: 'Example',
        auto_parse: true,
      })

      expect(api.post).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/documents/web-crawl',
        { url: 'https://example.com', name: 'Example', auto_parse: true },
      )
    })

    it('works with only url', async () => {
      vi.mocked(api.post).mockResolvedValue({ id: 'd2' })

      await datasetApi.webCrawlDocument('ds1', { url: 'https://test.com' })

      expect(api.post).toHaveBeenCalledWith(
        '/api/rag/datasets/ds1/documents/web-crawl',
        { url: 'https://test.com' },
      )
    })
  })
})
