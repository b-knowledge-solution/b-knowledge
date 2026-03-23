/**
 * @fileoverview E2E tests for HTML-to-Markdown conversion in the full RAG chat pipeline.
 *
 * Validates the end-to-end flow: HTML chunks from OpenSearch → conversion → LLM prompt,
 * while ensuring frontend SSE reference data retains original HTML.
 *
 * These tests simulate the complete data flow through the chat conversation service
 * without requiring a running server, by testing the conversion utility with realistic
 * data shapes matching the actual OpenSearch chunk format.
 */

import { describe, it, expect } from 'vitest'
import { htmlToMarkdown } from '../../src/shared/utils/html-to-markdown.js'

// ---------------------------------------------------------------------------
// Realistic chunk data matching OpenSearch _source format
// ---------------------------------------------------------------------------

/**
 * @description Simulates raw OpenSearch hit._source for an Excel-parsed chunk.
 * This is the exact shape that rag-search.service.ts mapHits() receives.
 */
function createOpenSearchHit(overrides: Partial<Record<string, any>> = {}) {
  return {
    _id: overrides._id || 'chunk-e2e-001',
    _score: overrides._score ?? 0.92,
    _source: {
      content_with_weight: overrides.content ?? '<table><caption>Employee List</caption><tr><th>Name</th><th>Role</th><th>Location</th></tr><tr><td>Alice Chen</td><td>Engineer</td><td>Tokyo</td></tr><tr><td>Bob Kim</td><td>Designer</td><td>Seoul</td></tr><tr><td>Carlos Ruiz</td><td>PM</td><td>Madrid</td></tr></table>',
      doc_id: overrides.doc_id || 'doc-e2e-001',
      docnm_kwd: overrides.docnm_kwd || 'HR Report Q4.xlsx',
      page_num_int: overrides.page_num_int || [1],
      position_int: overrides.position_int || [],
      available_int: overrides.available_int ?? 1,
      important_kwd: overrides.important_kwd || [],
      question_kwd: overrides.question_kwd || [],
      kb_id: overrides.kb_id || 'kb-e2e-001',
      ...(overrides.img_id ? { img_id: overrides.img_id } : {}),
    },
    highlight: overrides.highlight || {},
  }
}

/**
 * @description Simulates the mapHits() output shape from rag-search.service.ts.
 * This is ChunkResult as used throughout the pipeline.
 */
function mapHitToChunkResult(hit: ReturnType<typeof createOpenSearchHit>) {
  const src = hit._source
  return {
    chunk_id: hit._id,
    text: src.content_with_weight || '',
    doc_id: src.doc_id,
    doc_name: src.docnm_kwd,
    page_num: src.page_num_int || [],
    positions: src.position_int || [],
    score: hit._score ?? 0,
    available: src.available_int === undefined ? true : src.available_int === 1,
    important_kwd: src.important_kwd || [],
    question_kwd: src.question_kwd || [],
    token_count: Math.ceil((src.content_with_weight || '').length / 4),
    ...(src.kb_id ? { kb_id: src.kb_id } : {}),
  }
}

/**
 * @description Simulates buildContextPrompt from chat-conversation.service.ts.
 * Replicates the exact logic used in the actual service.
 */
function simulateBuildContextPrompt(
  systemPrompt: string,
  chunks: ReturnType<typeof mapHitToChunkResult>[],
  enableCitations: boolean
): string {
  if (!chunks.length) return systemPrompt

  const context = chunks
    .map((c, i) => {
      const source = c.doc_name ? ` [${c.doc_name}]` : ''
      const page = c.page_num?.length ? ` (p.${c.page_num.join(',')})` : ''
      // This is the key conversion step
      const text = htmlToMarkdown(c.text)
      return `[ID:${i}]${source}${page}\n${text}`
    })
    .join('\n\n')

  let prompt = `${systemPrompt}\n\n## Retrieved Knowledge\n${context}`
  if (enableCitations) {
    prompt += '\n\nCite sources using [ID:n].'
  }
  return prompt
}

/**
 * @description Simulates buildReference from chat-conversation.service.ts.
 * This sends data to the frontend via SSE.
 */
function simulateBuildReference(chunks: ReturnType<typeof mapHitToChunkResult>[]) {
  return {
    chunks: chunks.map((c, i) => ({
      chunk_id: c.chunk_id,
      content_with_weight: c.text, // Original HTML preserved for frontend
      doc_id: c.doc_id || '',
      docnm_kwd: c.doc_name || '',
      page_num_int: c.page_num?.[0] ?? 0,
      score: c.score ?? 0,
      cited: false,
    })),
  }
}

/**
 * @description Simulates buildKnowledgeContext from search.service.ts.
 */
function simulateBuildKnowledgeContext(chunks: ReturnType<typeof mapHitToChunkResult>[]): string {
  return chunks
    .map((chunk, i) => {
      const text = htmlToMarkdown(chunk.text)
      return `### Chunk ID: ${i}\n**Source**: ${chunk.doc_name || 'Unknown'}\n\n${text}`
    })
    .join('\n\n---\n\n')
}

// ---------------------------------------------------------------------------
// E2E Tests
// ---------------------------------------------------------------------------

describe('E2E: HTML-to-Markdown in RAG pipeline', () => {
  describe('full pipeline: OpenSearch → ChunkResult → LLM prompt + Frontend reference', () => {
    it('processes Excel HTML table chunk through the complete pipeline', () => {
      // Step 1: Simulate OpenSearch hit (what comes from the search index)
      const hit = createOpenSearchHit()

      // Step 2: Map to ChunkResult (what rag-search.service.ts produces)
      const chunk = mapHitToChunkResult(hit)
      expect(chunk.text).toContain('<table>')
      expect(chunk.text).toContain('Alice Chen')

      // Step 3A: Build LLM prompt (should convert HTML to Markdown)
      const llmPrompt = simulateBuildContextPrompt(
        'You are a helpful assistant.',
        [chunk],
        true
      )

      // LLM prompt should NOT contain HTML tags
      expect(llmPrompt).not.toContain('<table>')
      expect(llmPrompt).not.toContain('<tr>')
      expect(llmPrompt).not.toContain('<td>')
      expect(llmPrompt).not.toContain('<th>')
      expect(llmPrompt).not.toContain('<caption>')

      // LLM prompt SHOULD contain Markdown equivalents
      expect(llmPrompt).toContain('**Employee List**')
      expect(llmPrompt).toContain('| Name |')
      expect(llmPrompt).toContain('| Alice Chen |')
      expect(llmPrompt).toContain('| --- |')
      expect(llmPrompt).toContain('[ID:0]')
      expect(llmPrompt).toContain('[HR Report Q4.xlsx]')

      // Step 3B: Build frontend reference (should preserve original HTML)
      const reference = simulateBuildReference([chunk])

      // Frontend reference SHOULD contain original HTML
      expect(reference.chunks[0]!.content_with_weight).toContain('<table>')
      expect(reference.chunks[0]!.content_with_weight).toContain('<caption>Employee List</caption>')
      expect(reference.chunks[0]!.content_with_weight).toContain('<td>Alice Chen</td>')
      expect(reference.chunks[0]!.content_with_weight).toBe(chunk.text)
    })

    it('handles mixed chunk types (HTML + plain text) in same context', () => {
      const htmlHit = createOpenSearchHit({
        _id: 'chunk-html',
        content: '<table><tr><th>Metric</th><th>Value</th></tr><tr><td>Revenue</td><td>$10M</td></tr></table>',
        docnm_kwd: 'Financials.xlsx',
      })

      const plainHit = createOpenSearchHit({
        _id: 'chunk-plain',
        content: 'The company reported strong earnings in Q4, exceeding analyst expectations by 15%.',
        docnm_kwd: 'Earnings Call.pdf',
      })

      const htmlChunk = mapHitToChunkResult(htmlHit)
      const plainChunk = mapHitToChunkResult(plainHit)

      // Build LLM prompt with mixed chunks
      const llmPrompt = simulateBuildContextPrompt(
        'Answer questions based on the documents.',
        [htmlChunk, plainChunk],
        true
      )

      // HTML chunk should be converted
      expect(llmPrompt).not.toContain('<table>')
      expect(llmPrompt).toContain('| Metric |')
      expect(llmPrompt).toContain('| $10M |')

      // Plain text chunk should pass through unchanged
      expect(llmPrompt).toContain('exceeding analyst expectations by 15%')

      // Both chunk IDs should be present
      expect(llmPrompt).toContain('[ID:0]')
      expect(llmPrompt).toContain('[ID:1]')

      // Frontend references should preserve original content
      const reference = simulateBuildReference([htmlChunk, plainChunk])
      expect(reference.chunks[0]!.content_with_weight).toContain('<table>')
      expect(reference.chunks[1]!.content_with_weight).toBe(plainChunk.text)
    })
  })

  describe('search module pipeline', () => {
    it('converts HTML chunks in buildKnowledgeContext for LLM', () => {
      const hit = createOpenSearchHit({
        content: '<table><tr><th>Product</th><th>Price</th></tr><tr><td>Widget A</td><td>$29.99</td></tr></table>',
        docnm_kwd: 'Catalog.xlsx',
      })

      const chunk = mapHitToChunkResult(hit)
      const knowledge = simulateBuildKnowledgeContext([chunk])

      // Should contain Markdown, not HTML
      expect(knowledge).not.toContain('<table>')
      expect(knowledge).toContain('| Product |')
      expect(knowledge).toContain('| Widget A |')
      expect(knowledge).toContain('### Chunk ID: 0')
      expect(knowledge).toContain('**Source**: Catalog.xlsx')
    })
  })

  describe('token savings measurement', () => {
    it('achieves significant token reduction for table-heavy chunks', () => {
      // Simulate a large Excel table (common in enterprise RAG)
      const rows = Array.from({ length: 20 }, (_, i) =>
        `<tr><td>Employee ${i + 1}</td><td>Dept ${i % 5}</td><td>$${(50 + i * 5)}K</td><td>Active</td></tr>`
      ).join('')
      const largeHtml = `<table><caption>Full Staff List</caption><tr><th>Name</th><th>Department</th><th>Salary</th><th>Status</th></tr>${rows}</table>`

      const hit = createOpenSearchHit({ content: largeHtml })
      const chunk = mapHitToChunkResult(hit)

      const originalLength = chunk.text.length
      const convertedLength = htmlToMarkdown(chunk.text).length

      // Should achieve at least 20% reduction
      const reduction = 1 - convertedLength / originalLength
      expect(reduction).toBeGreaterThan(0.2)
    })
  })

  describe('data integrity', () => {
    it('preserves all data values through conversion (no data loss)', () => {
      const testData = [
        { name: 'Alice', value: '$1,234.56', note: 'Top performer' },
        { name: 'Bob', value: '$987.65', note: 'New hire' },
        { name: 'Charlie', value: '$2,345.67', note: 'Team lead' },
      ]

      const rows = testData
        .map(d => `<tr><td>${d.name}</td><td>${d.value}</td><td>${d.note}</td></tr>`)
        .join('')
      const html = `<table><tr><th>Name</th><th>Value</th><th>Note</th></tr>${rows}</table>`

      const md = htmlToMarkdown(html)

      // Every data value should be present in the Markdown output
      for (const d of testData) {
        expect(md).toContain(d.name)
        expect(md).toContain(d.value)
        expect(md).toContain(d.note)
      }

      // Column headers should be preserved
      expect(md).toContain('Name')
      expect(md).toContain('Value')
      expect(md).toContain('Note')
    })

    it('preserves special characters in cell content', () => {
      const html = '<table><tr><th>Formula</th><th>Result</th></tr><tr><td>a + b = c</td><td>100%</td></tr><tr><td>x & y</td><td>$1,000</td></tr></table>'

      const md = htmlToMarkdown(html)

      expect(md).toContain('a + b = c')
      expect(md).toContain('100%')
      expect(md).toContain('$1,000')
    })
  })

  describe('empty and edge cases in pipeline', () => {
    it('handles empty chunks array (no knowledge retrieved)', () => {
      const prompt = simulateBuildContextPrompt('System prompt.', [], true)
      expect(prompt).toBe('System prompt.')
    })

    it('handles chunk with empty text', () => {
      const hit = createOpenSearchHit({ content: '' })
      const chunk = mapHitToChunkResult(hit)
      const md = htmlToMarkdown(chunk.text)
      expect(md).toBe('')
    })

    it('handles chunk with only whitespace HTML', () => {
      const hit = createOpenSearchHit({ content: '<p>  </p>' })
      const chunk = mapHitToChunkResult(hit)
      const md = htmlToMarkdown(chunk.text)

      // Should not contain HTML tags after conversion
      expect(md).not.toContain('<p>')
    })
  })
})
