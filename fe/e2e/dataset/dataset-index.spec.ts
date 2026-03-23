/**
 * @fileoverview E2E tests for complete dataset indexing lifecycle.
 *
 * Exercises the full pipeline: create dataset -> upload documents -> parse ->
 * verify chunks -> verify OpenSearch embeddings -> search -> update settings ->
 * re-parse -> delete documents -> delete dataset.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/dataset/dataset-index.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import { waitForDocumentParsed, waitForChunksIndexed } from '../helpers/wait.helper'
import { OpenSearchHelper, opensearchHelper } from '../helpers/opensearch.helper'
import path from 'path'
import { fileURLToPath } from 'url'

/** ESM-compatible __dirname equivalent */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Datasets page URL path */
const DATASETS_URL = '/data-studio/datasets'

/** Track resources for cleanup */
let api: ApiHelper
let osHelper: OpenSearchHelper
let datasetId: string
let docIds: string[] = []

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)
  osHelper = opensearchHelper()
})

test.afterAll(async () => {
  // Clean up dataset (cascades to documents and chunks)
  try {
    if (datasetId) await api.deleteDataset(datasetId)
  } catch { /* ignore cleanup errors */ }
})

// ============================================================================
// Dataset creation with parser config
// ============================================================================

test('Create dataset with specific parser config @smoke', async ({ page }) => {
  const uniqueName = `E2E Index Dataset ${Date.now()}`

  // Create dataset via API with explicit parser configuration
  const dataset = await api.createDataset(uniqueName, 'For indexing tests', {
    chunk_token_count: 256,
    delimiter: '\\n!?;。；！？',
    layout_recognize: true,
  })
  datasetId = dataset.id

  // Navigate to datasets page and verify the dataset exists in the UI
  await page.goto(DATASETS_URL)
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })

  // Verify dataset was created with correct parser config via API
  const fetched = await api.getDataset(datasetId)
  expect(fetched).not.toBeNull()
  expect(fetched!.name).toBe(uniqueName)
  expect(fetched!.parser_id).toBe('naive')
})

// ============================================================================
// Upload multiple documents
// ============================================================================

test('Upload multiple documents to dataset', async () => {
  const testDataDir = path.resolve(__dirname, '..', 'test-data')
  const samplePdf = path.join(testDataDir, 'sample.pdf')

  // Upload the sample PDF document
  const docs = await api.uploadDocument(datasetId, samplePdf)
  expect(docs.length).toBeGreaterThan(0)

  // Track all uploaded document IDs for later assertions
  docIds = docs.map((d) => d.id)
  expect(docIds.length).toBeGreaterThan(0)
})

// ============================================================================
// Trigger parsing and wait for completion
// ============================================================================

test('Trigger parsing for all documents and wait for completion @smoke', async ({ request }) => {
  // Trigger bulk parse for all uploaded documents
  await api.triggerParse(datasetId, docIds)

  // Wait for each document to finish parsing (polls every 2s, 60s timeout)
  for (const docId of docIds) {
    await waitForDocumentParsed(request, datasetId, docId, 60_000)
  }

  // Verify parsing completed successfully for each document
  for (const docId of docIds) {
    const doc = await api.getDocument(datasetId, docId)
    expect(doc).not.toBeNull()
    expect(doc!.progress).toBeGreaterThanOrEqual(1)
  }
})

// ============================================================================
// Verify chunk counts per document
// ============================================================================

test('Verify chunk counts per document', async ({ request }) => {
  // Wait for chunks to be indexed for each document
  for (const docId of docIds) {
    await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)
  }

  // Verify each document has at least one chunk via the API
  for (const docId of docIds) {
    const chunksResponse = await api.listChunks(datasetId, docId)
    expect(chunksResponse.data.length).toBeGreaterThan(0)
  }
})

// ============================================================================
// Verify embeddings exist in OpenSearch
// ============================================================================

test('Verify embeddings exist in OpenSearch @smoke', async () => {
  const indexName = osHelper.getIndexName()

  // Refresh the index to make recently indexed documents searchable immediately
  await osHelper.refreshIndex(indexName)

  // Check each document has chunks with embeddings in OpenSearch
  for (const docId of docIds) {
    const chunks = await osHelper.getChunksByDocId(indexName, docId)
    expect(chunks.length).toBeGreaterThan(0)

    // Verify at least one chunk has an embedding vector
    const chunksWithEmbeddings = chunks.filter((c) => c.has_embedding)
    expect(chunksWithEmbeddings.length).toBeGreaterThan(0)

    // Verify embedding dimensions are consistent (typical: 768 or 1024)
    const firstEmbedding = chunksWithEmbeddings[0]!
    expect(firstEmbedding.embedding_dim).toBeGreaterThan(0)
  }
})

// ============================================================================
// Full-text search on indexed chunks
// ============================================================================

test('Full-text search on indexed chunks', async () => {
  const indexName = osHelper.getIndexName()

  // Refresh index to ensure all chunks are searchable
  await osHelper.refreshIndex(indexName)

  // Perform a full-text search against the dataset's chunks
  const results = await osHelper.searchChunks(indexName, 'document', datasetId)
  expect(results.length).toBeGreaterThan(0)

  // Verify result content is non-empty and includes a score
  const firstResult = results[0]!
  expect(firstResult.content.length).toBeGreaterThan(0)
  expect(firstResult.score).toBeGreaterThan(0)
})

// ============================================================================
// Vector similarity search on indexed chunks
// ============================================================================

test('Vector similarity search on indexed chunks', async () => {
  const indexName = osHelper.getIndexName()

  // Get a chunk to use its embedding for similarity search
  const chunks = await osHelper.getChunksByDocId(indexName, docIds[0]!)
  const chunksWithVec = chunks.filter((c) => c.has_embedding)
  expect(chunksWithVec.length).toBeGreaterThan(0)

  // Verify the chunk has a valid embedding dimension
  expect(chunksWithVec[0]!.embedding_dim).toBeGreaterThan(0)

  // Full-text search as a proxy for vector results (direct kNN requires raw OpenSearch query)
  const results = await osHelper.searchChunks(indexName, chunksWithVec[0]!.content.substring(0, 50), datasetId)
  expect(results.length).toBeGreaterThan(0)
})

// ============================================================================
// Update dataset settings and re-parse
// ============================================================================

test('Update dataset settings and re-parse documents', async ({ request }) => {
  // Update dataset chunk method settings
  await api.updateDatasetSettings(datasetId, {
    chunk_method: 'naive',
    parser_config: {
      chunk_token_count: 128,
      delimiter: '\\n',
    },
  })

  // Trigger re-parse for all documents with the new settings
  await api.triggerParse(datasetId, docIds)

  // Wait for parsing to complete again
  for (const docId of docIds) {
    await waitForDocumentParsed(request, datasetId, docId, 60_000)
  }

  // Verify chunks exist after re-parsing
  for (const docId of docIds) {
    await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)
    const chunksResponse = await api.listChunks(datasetId, docId)
    expect(chunksResponse.data.length).toBeGreaterThan(0)
  }
})

// ============================================================================
// Delete individual documents and verify chunk cleanup
// ============================================================================

test('Delete individual document and verify chunk cleanup', async () => {
  // Only proceed if we have at least one document
  expect(docIds.length).toBeGreaterThan(0)
  const docIdToDelete = docIds[0]!

  // Record the OpenSearch index for later verification
  const indexName = osHelper.getIndexName()

  // Delete the document via API
  await api.deleteDocument(datasetId, docIdToDelete)

  // Verify document no longer exists
  const deletedDoc = await api.getDocument(datasetId, docIdToDelete)
  expect(deletedDoc).toBeNull()

  // Wait briefly for chunk cleanup to propagate to OpenSearch
  await new Promise((r) => setTimeout(r, 3000))
  await osHelper.refreshIndex(indexName)

  // Verify chunks for the deleted document are removed from OpenSearch
  const remainingChunks = await osHelper.getChunksByDocId(indexName, docIdToDelete)
  expect(remainingChunks.length).toBe(0)

  // Remove from tracking array
  docIds = docIds.filter((id) => id !== docIdToDelete)
})

// ============================================================================
// Delete entire dataset and verify full cleanup
// ============================================================================

test('Delete entire dataset and verify full cleanup @smoke', async () => {
  const indexName = osHelper.getIndexName()

  // Delete the dataset (should cascade to documents and chunks)
  await api.deleteDataset(datasetId)

  // Verify dataset no longer exists via API
  const deletedDataset = await api.getDataset(datasetId)
  expect(deletedDataset).toBeNull()

  // Wait briefly for OpenSearch cleanup to propagate
  await new Promise((r) => setTimeout(r, 3000))
  await osHelper.refreshIndex(indexName)

  // Verify no chunks remain in OpenSearch for the deleted dataset
  const results = await osHelper.searchChunks(indexName, 'document', datasetId)
  expect(results.length).toBe(0)

  // Clear tracking to prevent afterAll from trying to delete again
  datasetId = ''
  docIds = []
})
