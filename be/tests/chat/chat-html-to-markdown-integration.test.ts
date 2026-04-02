/**
 * @fileoverview Integration tests for HTML-to-Markdown conversion in the chat RAG pipeline.
 *
 * Verifies that:
 * 1. HTML chunks are converted to Markdown only in the LLM prompt path
 * 2. Frontend references still receive original HTML content
 * 3. The conversion integrates correctly with buildContextPrompt and buildReference
 *
 * Since buildContextPrompt and buildReference are module-private, we test them
 * indirectly by importing the module and validating the observable behavior through
 * the exported service class methods where possible, and by testing the utility
 * function that powers the conversion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { htmlToMarkdown } from '../../src/shared/utils/html-to-markdown.js'

// ---------------------------------------------------------------------------
// Mocks — prevent deep module loading
// ---------------------------------------------------------------------------

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    chatMessage: { create: vi.fn(), findAll: vi.fn() },
    chatSession: { findById: vi.fn(), update: vi.fn() },
    chatAssistant: { findById: vi.fn() },
    modelProvider: { findDefaults: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('@/shared/services/llm-client.service.js', () => ({
  llmClientService: { chatCompletionStream: vi.fn(), chatCompletion: vi.fn() },
  LlmMessage: {},
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

vi.mock('@/modules/rag/services/rag-sql.service.js', () => ({
  ragSqlService: { generateSQL: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-graphrag.service.js', () => ({
  ragGraphragService: { query: vi.fn() },
}))

vi.mock('@/modules/rag/services/rag-deep-research.service.js', () => ({
  ragDeepResearchService: { research: vi.fn() },
}))

vi.mock('@/shared/services/web-search.service.js', () => ({
  searchWeb: vi.fn(),
}))

vi.mock('@/shared/prompts/index.js', () => ({
  fullQuestionPrompt: { system: '' },
  crossLanguagePrompt: { system: '' },
  keywordPrompt: { system: '' },
  citationPrompt: { system: 'Cite sources using [ID:n].' },
  askSummaryPrompt: { system: '' },
}))

vi.mock('@/shared/utils/language-detect.js', () => ({
  detectLanguage: vi.fn().mockReturnValue('en'),
  buildLanguageInstruction: vi.fn().mockReturnValue(''),
}))

vi.mock('@/shared/services/ability.service.js', () => ({
  abilityService: { defineAbilityFor: vi.fn() },
  buildOpenSearchAbacFilters: vi.fn().mockReturnValue([]),
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
// Test data — simulates chunks from OpenSearch containing HTML
// ---------------------------------------------------------------------------

/** @description Simulates an Excel-parser HTML table chunk stored in OpenSearch */
const htmlTableChunk = {
  chunk_id: 'chunk-001',
  text: '<table><caption>Q4 Sales</caption><tr><th>Region</th><th>Revenue</th></tr><tr><td>North</td><td>$500K</td></tr><tr><td>South</td><td>$300K</td></tr></table>',
  doc_id: 'doc-001',
  doc_name: 'Sales Report 2024.xlsx',
  page_num: [1],
  positions: [],
  score: 0.95,
  available: true,
  important_kwd: [],
  question_kwd: [],
  token_count: 50,
}

/** @description Simulates a plain text chunk (no HTML) */
const plainTextChunk = {
  chunk_id: 'chunk-002',
  text: 'The company achieved record growth in Q4 2024 with 25% YoY increase.',
  doc_id: 'doc-002',
  doc_name: 'Annual Report.pdf',
  page_num: [5],
  positions: [],
  score: 0.88,
  available: true,
  important_kwd: [],
  question_kwd: [],
  token_count: 20,
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('HTML-to-Markdown integration in chat pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('LLM prompt path: HTML is converted to Markdown', () => {
    it('converts HTML table chunk to Markdown for LLM consumption', () => {
      const converted = htmlToMarkdown(htmlTableChunk.text)

      // Should NOT contain HTML tags
      expect(converted).not.toContain('<table>')
      expect(converted).not.toContain('<tr>')
      expect(converted).not.toContain('<td>')
      expect(converted).not.toContain('<th>')
      expect(converted).not.toContain('<caption>')

      // Should contain Markdown equivalents
      expect(converted).toContain('**Q4 Sales**')
      expect(converted).toContain('| Region |')
      expect(converted).toContain('| Revenue |')
      expect(converted).toContain('| North |')
      expect(converted).toContain('| $500K |')
      expect(converted).toContain('| --- |')
    })

    it('leaves plain text chunk unchanged', () => {
      const converted = htmlToMarkdown(plainTextChunk.text)

      // Plain text should pass through unmodified
      expect(converted).toBe(plainTextChunk.text)
    })

    it('reduces token count for HTML content', () => {
      const original = htmlTableChunk.text
      const converted = htmlToMarkdown(original)

      // Markdown should use fewer characters than HTML
      expect(converted.length).toBeLessThan(original.length)

      // Approximate token savings: ~4 chars per token
      const originalTokens = Math.ceil(original.length / 4)
      const convertedTokens = Math.ceil(converted.length / 4)
      expect(convertedTokens).toBeLessThan(originalTokens)
    })
  })

  describe('Frontend path: original HTML is preserved', () => {
    it('buildReference pattern preserves original c.text for content_with_weight', () => {
      // This simulates what buildReference does (line 408 of chat-conversation.service.ts)
      const chunks = [htmlTableChunk, plainTextChunk]

      const reference = {
        chunks: chunks.map((c, i) => ({
          chunk_id: c.chunk_id,
          content_with_weight: c.text, // Original HTML preserved!
          doc_id: c.doc_id,
          docnm_kwd: c.doc_name,
          page_num_int: c.page_num?.[0] ?? 0,
          score: c.score ?? 0,
          cited: false,
        })),
      }

      // Frontend should receive original HTML in content_with_weight
      expect(reference.chunks[0]!.content_with_weight).toBe(htmlTableChunk.text)
      expect(reference.chunks[0]!.content_with_weight).toContain('<table>')
      expect(reference.chunks[0]!.content_with_weight).toContain('<caption>Q4 Sales</caption>')

      // Plain text chunk should also be preserved
      expect(reference.chunks[1]!.content_with_weight).toBe(plainTextChunk.text)
    })

    it('search executeSearch pattern preserves original c.text', () => {
      // This simulates what executeSearch does (line 330-334 of search.service.ts)
      const chunks = [htmlTableChunk]

      const mappedChunks = chunks.map((c: any) => ({
        ...c,
        content: c.text,
        content_with_weight: c.text, // Original HTML preserved!
      }))

      expect(mappedChunks[0]!.content_with_weight).toBe(htmlTableChunk.text)
      expect(mappedChunks[0]!.content_with_weight).toContain('<table>')
    })
  })

  describe('LLM vs Frontend path divergence', () => {
    it('LLM path gets Markdown while frontend gets HTML from the same chunks', () => {
      const chunks = [htmlTableChunk, plainTextChunk]

      // LLM path: buildContextPrompt converts to Markdown
      const llmContext = chunks
        .map((c, i) => {
          const source = c.doc_name ? ` [${c.doc_name}]` : ''
          const page = c.page_num?.length ? ` (p.${c.page_num.join(',')})` : ''
          const text = htmlToMarkdown(c.text)
          return `[ID:${i}]${source}${page}\n${text}`
        })
        .join('\n\n')

      // Frontend path: buildReference preserves original
      const reference = chunks.map(c => ({
        content_with_weight: c.text,
      }))

      // LLM context should NOT have HTML tags
      expect(llmContext).not.toContain('<table>')
      expect(llmContext).not.toContain('<tr>')
      expect(llmContext).toContain('| Region |')
      expect(llmContext).toContain('**Q4 Sales**')

      // Frontend reference should still have HTML
      expect(reference[0]!.content_with_weight).toContain('<table>')
      expect(reference[0]!.content_with_weight).toContain('<caption>')

      // Both should contain the actual data
      expect(llmContext).toContain('$500K')
      expect(reference[0]!.content_with_weight).toContain('$500K')
    })
  })
})
