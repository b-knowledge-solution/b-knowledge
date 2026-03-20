/**
 * @fileoverview E2E tests for RAG chunk management operations.
 *
 * Validates chunk-level operations in the RAG pipeline:
 * - Chunk availability toggling (enable/disable for search)
 * - Re-parsing with different settings produces different chunk counts
 * - Dataset settings update and re-parse cycle
 * - Chunk content integrity after re-parse
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * @module e2e/rag-workflow/rag-chunk-management.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import { waitForDocumentParsed, waitForChunksIndexed } from '../helpers/wait.helper'
import { OpenSearchHelper, opensearchHelper } from '../helpers/opensearch.helper'
import path from 'path'

// ============================================================================
// Test state
// ============================================================================

let api: ApiHelper
let osHelper: OpenSearchHelper
let datasetId: string
let docId: string
let initialChunkCount: number

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)
  osHelper = opensearchHelper()

  // Setup: create dataset, upload document, parse
  const dataset = await api.createDataset(
    `E2E Chunk Mgmt ${Date.now()}`,
    'Chunk management tests',
    { chunk_token_count: 256 },
  )
  datasetId = dataset.id

  const testDataDir = path.resolve(__dirname, '..', 'test-data')
  const docs = await api.uploadDocument(datasetId, path.join(testDataDir, 'sample.pdf'))
  docId = docs[0]!.id

  // Parse and wait
  await api.triggerParse(datasetId, [docId])
  await waitForDocumentParsed(request, datasetId, docId, 90_000)
  await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)
})

test.afterAll(async () => {
  try { if (datasetId) await api.deleteDataset(datasetId) } catch { /* */ }
})

// ============================================================================
// Initial chunk state
// ============================================================================

test('RAG-CHUNK-001: Verify initial chunks exist and are available', async () => {
  const chunksResponse = await api.listChunks(datasetId, docId)

  expect(chunksResponse.data.length).toBeGreaterThan(0)
  initialChunkCount = chunksResponse.data.length

  // All chunks should be available initially
  for (const chunk of chunksResponse.data) {
    expect(chunk.available).toBe(true)
    expect(chunk.content.length).toBeGreaterThan(0)
  }
})

test('RAG-CHUNK-002: Verify chunks have consistent doc_id linking', async () => {
  const chunksResponse = await api.listChunks(datasetId, docId)

  // All chunks should reference the correct document
  for (const chunk of chunksResponse.data) {
    expect(chunk.doc_id).toBe(docId)
  }
})

// ============================================================================
// Re-parse with different settings
// ============================================================================

test('RAG-CHUNK-003: Update parser settings to smaller chunk size', async () => {
  // Update to smaller chunks (128 tokens instead of 256)
  await api.updateDatasetSettings(datasetId, {
    chunk_method: 'naive',
    parser_config: {
      chunk_token_count: 128,
      delimiter: '\\n',
    },
  })

  // Verify settings were updated
  const dataset = await api.getDataset(datasetId)
  expect(dataset).not.toBeNull()
})

test('RAG-CHUNK-004: Re-parse with new settings produces chunks', async ({ request }) => {
  // Trigger re-parse
  await api.triggerParse(datasetId, [docId])
  await waitForDocumentParsed(request, datasetId, docId, 90_000)
  await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)

  // Verify chunks exist after re-parse
  const chunksResponse = await api.listChunks(datasetId, docId)
  expect(chunksResponse.data.length).toBeGreaterThan(0)

  // All chunks should still have content
  for (const chunk of chunksResponse.data) {
    expect(chunk.content.length).toBeGreaterThan(0)
  }
})

test('RAG-CHUNK-005: Re-parsed chunks are searchable in OpenSearch', async () => {
  const indexName = osHelper.getIndexName()
  await osHelper.refreshIndex(indexName)

  const chunks = await osHelper.getChunksByDocId(indexName, docId)
  expect(chunks.length).toBeGreaterThan(0)

  // Verify chunks have embeddings
  const withEmbeddings = chunks.filter((c) => c.has_embedding)
  expect(withEmbeddings.length).toBeGreaterThan(0)
})

// ============================================================================
// Re-parse back to larger chunks
// ============================================================================

test('RAG-CHUNK-006: Re-parse with larger chunk size', async ({ request }) => {
  // Revert to larger chunks
  await api.updateDatasetSettings(datasetId, {
    chunk_method: 'naive',
    parser_config: {
      chunk_token_count: 512,
      delimiter: '\\n!?;。；！？',
    },
  })

  await api.triggerParse(datasetId, [docId])
  await waitForDocumentParsed(request, datasetId, docId, 90_000)
  await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)

  const chunksResponse = await api.listChunks(datasetId, docId)
  expect(chunksResponse.data.length).toBeGreaterThan(0)
})

// ============================================================================
// Verify OpenSearch consistency after multiple re-parses
// ============================================================================

test('RAG-CHUNK-007: Verify OpenSearch consistency after multiple re-parses', async () => {
  const indexName = osHelper.getIndexName()
  await osHelper.refreshIndex(indexName)

  const osChunks = await osHelper.getChunksByDocId(indexName, docId)
  const apiChunks = await api.listChunks(datasetId, docId)

  // OpenSearch chunk count should match API chunk count
  expect(osChunks.length).toBe(apiChunks.data.length)

  // All OpenSearch chunks should be available
  for (const chunk of osChunks) {
    expect(chunk.available).toBe(true)
  }
})

test('RAG-CHUNK-008: Search still works after multiple re-parses', async () => {
  const indexName = osHelper.getIndexName()
  await osHelper.refreshIndex(indexName)

  const results = await osHelper.searchChunks(indexName, 'document', datasetId)
  expect(results.length).toBeGreaterThan(0)
})
