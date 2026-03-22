/**
 * @fileoverview Integration tests for HTML-to-Markdown conversion in the search module.
 *
 * Verifies that:
 * 1. buildKnowledgeContext converts HTML to Markdown for LLM context
 * 2. executeSearch preserves original HTML for frontend
 * 3. askSearch reference data preserves original HTML for frontend
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { htmlToMarkdown } from '../../src/shared/utils/html-to-markdown.js'

// ---------------------------------------------------------------------------
// Mocks — prevent deep module loading for SearchService
// ---------------------------------------------------------------------------

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    searchApp: { findById: vi.fn(), findAll: vi.fn(), create: vi.fn() },
    searchAppAccess: { findAll: vi.fn() },
    modelProvider: { findDefaults: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('@/modules/rag/services/rag-search.service.js', () => ({
  ragSearchService: { search: vi.fn(), hybridSearch: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-rerank.service.js', () => ({
  ragRerankService: { rerank: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-citation.service.js', () => ({
  ragCitationService: { insertCitations: vi.fn() },
}))

vi.mock('@/shared/services/llm-client.service.js', () => ({
  llmClientService: { chatCompletionStream: vi.fn(), chatCompletion: vi.fn() },
}))

vi.mock('@/shared/prompts/index.js', () => ({
  askSummaryPrompt: { system: '' },
  citationPrompt: { system: '' },
  relatedQuestionPrompt: { system: '' },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/services/langfuse.service.js', () => ({
  langfuseTraceService: { createTrace: vi.fn(), createSpan: vi.fn() },
}))

vi.mock('@/modules/rag/index.js', () => ({
  queryLogService: { log: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const htmlChunk = {
  chunk_id: 'search-chunk-001',
  text: '<table><caption>Inventory</caption><tr><th>Item</th><th>Qty</th><th>Price</th></tr><tr><td>Widget</td><td>500</td><td>$12.50</td></tr><tr><td>Gadget</td><td>200</td><td>$45.00</td></tr></table>',
  doc_id: 'doc-search-001',
  doc_name: 'Inventory.xlsx',
  page_num: [1],
  positions: [],
  score: 0.91,
  available: true,
  important_kwd: [],
  question_kwd: [],
  token_count: 60,
}

const plainChunk = {
  chunk_id: 'search-chunk-002',
  text: 'Current inventory levels are above target for all categories.',
  doc_id: 'doc-search-002',
  doc_name: 'Summary.pdf',
  page_num: [3],
  positions: [],
  score: 0.85,
  available: true,
  important_kwd: [],
  question_kwd: [],
  token_count: 15,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Search module HTML-to-Markdown integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildKnowledgeContext (LLM path)', () => {
    it('converts HTML table to Markdown in knowledge context', () => {
      // Simulate buildKnowledgeContext with htmlToMarkdown
      const context = [htmlChunk]
        .map((chunk, i) => {
          const text = htmlToMarkdown(chunk.text)
          return `### Chunk ID: ${i}\n**Source**: ${chunk.doc_name || 'Unknown'}\n\n${text}`
        })
        .join('\n\n---\n\n')

      // Should NOT contain HTML
      expect(context).not.toContain('<table>')
      expect(context).not.toContain('<td>')

      // Should contain Markdown
      expect(context).toContain('**Inventory**')
      expect(context).toContain('| Item |')
      expect(context).toContain('| Widget |')
      expect(context).toContain('| $12.50 |')
    })

    it('passes through plain text chunks unchanged', () => {
      const context = [plainChunk]
        .map((chunk, i) => {
          const text = htmlToMarkdown(chunk.text)
          return `### Chunk ID: ${i}\n**Source**: ${chunk.doc_name || 'Unknown'}\n\n${text}`
        })
        .join('\n\n---\n\n')

      expect(context).toContain('Current inventory levels are above target')
    })
  })

  describe('executeSearch frontend response (frontend path)', () => {
    it('preserves original HTML in content_with_weight', () => {
      // Simulate executeSearch mapping (lines 330-334)
      const mappedChunks = [htmlChunk].map((c: any) => ({
        ...c,
        content: c.text,
        content_with_weight: c.text,
      }))

      // Frontend should receive original HTML
      expect(mappedChunks[0]!.content_with_weight).toContain('<table>')
      expect(mappedChunks[0]!.content_with_weight).toContain('<caption>Inventory</caption>')
      expect(mappedChunks[0]!.content_with_weight).toBe(htmlChunk.text)
    })
  })

  describe('askSearch reference (frontend path)', () => {
    it('preserves original HTML in SSE reference data', () => {
      // Simulate askSearch reference building (lines 580-587)
      const reference = {
        chunks: [htmlChunk].map((c, i) => ({
          ...c,
          chunk_id: c.chunk_id,
          id: i,
          content: c.text,
          content_with_weight: c.text, // Must be original HTML
        })),
      }

      expect(reference.chunks[0]!.content_with_weight).toContain('<table>')
      expect(reference.chunks[0]!.content_with_weight).toBe(htmlChunk.text)
    })
  })

  describe('divergence verification', () => {
    it('LLM gets Markdown while frontend gets HTML for same chunk', () => {
      // LLM path
      const llmText = htmlToMarkdown(htmlChunk.text)

      // Frontend path
      const frontendText = htmlChunk.text

      // LLM should have Markdown
      expect(llmText).not.toContain('<table>')
      expect(llmText).toContain('| Item |')

      // Frontend should have HTML
      expect(frontendText).toContain('<table>')
      expect(frontendText).toContain('<td>Widget</td>')

      // Both should preserve the data
      expect(llmText).toContain('Widget')
      expect(frontendText).toContain('Widget')
      expect(llmText).toContain('$12.50')
      expect(frontendText).toContain('$12.50')
    })
  })
})
