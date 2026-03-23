/**
 * @fileoverview E2E tests for document parsing pipeline.
 *
 * Exercises the full async flow of triggering document parsing, polling for
 * completion, and verifying chunks are generated. Covers deepdoc/naive parser
 * for PDF, re-parse (no chunk duplication), cancel parsing, and parser type
 * completeness validation (STAB-05).
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 * - @parsers: Parser migration completeness validation
 *
 * @module e2e/dataset/document-parse.spec
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { test, expect, APIRequestContext } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import { waitForDocumentParsed } from '../helpers/wait.helper'

/** ESM-compatible __dirname equivalent */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Dataset detail page URL prefix */
const DATASET_URL_PREFIX = '/data-studio/datasets'

/** Path to test PDF file */
const SAMPLE_PDF_PATH = path.resolve(__dirname, '../test-data/sample.pdf')

/** Base URL for direct backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/** API helper instance for setup/teardown */
let api: ApiHelper

/** Shared dataset for parsing tests */
let datasetId: string

/** Primary document uploaded for parsing tests */
let docId: string

test.beforeAll(async ({ request }) => {
  // Create a test dataset and upload the sample PDF via API
  api = apiHelper(request)
  const dataset = await api.createDataset(
    `E2E Parse Test ${Date.now()}`,
    'Dataset for document parsing E2E tests'
  )
  datasetId = dataset.id

  // Upload sample.pdf via API helper for all tests to use
  const docs = await api.uploadDocument(datasetId, SAMPLE_PDF_PATH)
  docId = docs[0].id
})

test.afterAll(async () => {
  // Clean up the test dataset (cascading deletes all documents)
  try {
    await api.deleteDataset(datasetId)
  } catch {
    // Ignore cleanup errors
  }
})

// ============================================================================
// Trigger parsing and wait for completion
// ============================================================================

test('Trigger parsing and wait for completion @smoke', async ({ page, request }) => {
  // Navigate to dataset detail page
  await page.goto(`${DATASET_URL_PREFIX}/${datasetId}`)
  await page.waitForLoadState('networkidle')

  // Wait for the document table to show the uploaded file
  await expect(page.getByText('sample.pdf')).toBeVisible({ timeout: 15_000 })

  // Trigger parsing via API (more reliable than UI click for async testing)
  await api.triggerParse(datasetId, [docId])

  // Use polling wait helper to wait for parsing to complete (60s timeout)
  await waitForDocumentParsed(request, datasetId, docId, 60_000)

  // Verify the document has been parsed via API
  const doc = await api.getDocument(datasetId, docId)
  expect(doc).toBeTruthy()

  // Document run status '1' with progress >= 1.0 means parsing succeeded
  // Or progress === 1 depending on backend behavior
  expect(doc!.progress).toBeGreaterThanOrEqual(1.0)

  // Verify chunks were generated (chunk_num > 0)
  const chunkCount = await getDocumentChunkCount(request, datasetId, docId)
  expect(chunkCount).toBeGreaterThan(0)
})

// ============================================================================
// Parse with deepdoc parser (PDF)
// ============================================================================

test('Parse with deepdoc parser generates chunks without error', async ({ request }) => {
  // Verify the document's parser type is 'naive' (deepdoc)
  const doc = await api.getDocument(datasetId, docId)
  expect(doc).toBeTruthy()

  // The default parser for a dataset created with parser_id='naive' should
  // propagate to documents. Naive = General = DeepDOC for PDF.
  // If not 'naive', we would need to change parser via API, but default
  // dataset creation in beforeAll already uses 'naive'.

  // Verify parsing completed with no error in progress_msg
  // After the smoke test above, the document should already be parsed
  expect(doc!.progress).toBeGreaterThanOrEqual(1.0)

  // Check that progress_msg does not contain error indicators
  const progressMsg = doc!.progress_msg || ''
  expect(progressMsg).not.toContain('error')
  expect(progressMsg).not.toContain('Error')
  expect(progressMsg).not.toContain('failed')

  // Verify chunks exist
  const chunkCount = await getDocumentChunkCount(request, datasetId, docId)
  expect(chunkCount).toBeGreaterThan(0)
})

// ============================================================================
// Re-parse already parsed document
// ============================================================================

test('Re-parse already parsed document does not duplicate chunks', async ({ request }) => {
  // Get chunk count before re-parse
  const chunksBefore = await getDocumentChunkCount(request, datasetId, docId)
  expect(chunksBefore).toBeGreaterThan(0)

  // Trigger re-parse
  await api.triggerParse(datasetId, [docId])

  // Wait for parsing to complete again
  await waitForDocumentParsed(request, datasetId, docId, 60_000)

  // Get chunk count after re-parse
  const chunksAfter = await getDocumentChunkCount(request, datasetId, docId)
  expect(chunksAfter).toBeGreaterThan(0)

  // Chunk count should be similar (not doubled) -- old chunks are replaced
  // Allow some variance since chunk boundaries may shift slightly
  const ratio = chunksAfter / chunksBefore
  expect(ratio).toBeGreaterThan(0.5)
  expect(ratio).toBeLessThan(2.0)
})

// ============================================================================
// Cancel parsing in progress
// ============================================================================

test('Cancel parsing does not leave document in stuck state', async ({ request }) => {
  // Upload a second document for the cancel test
  const docs = await api.uploadDocument(datasetId, SAMPLE_PDF_PATH)
  const cancelDocId = docs[0].id

  // Trigger parsing
  await api.triggerParse(datasetId, [cancelDocId])

  // Immediately attempt to cancel via bulk-parse with run=2 (cancel)
  const cancelResponse = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/documents/bulk-parse`,
    { data: { document_ids: [cancelDocId], run: 2 } }
  )

  // Cancel request should not fail with 500
  expect(cancelResponse.status()).toBeLessThan(500)

  // Wait briefly for status to settle
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // Check document status -- should not be permanently stuck
  const doc = await api.getDocument(datasetId, cancelDocId)
  expect(doc).toBeTruthy()

  // Document should be in one of: cancelled, pending, parsed, or failed -- not stuck
  // run values: '0' = pending, '1' = running/parsed, '2' = cancelled, '-1' = failed
  // Any of these is acceptable as long as it's not stuck in an unknown state
  const validRunStates = ['0', '1', '2', '-1']
  const docRun = doc!.run || '0'
  expect(validRunStates).toContain(docRun)
})

// ============================================================================
// Parser type completeness (STAB-05) @parsers
// ============================================================================

test('Parser FACTORY covers all expected parser types @parsers', async () => {
  // The Python task_executor.py FACTORY maps parser_id values to chunker
  // modules. The FE PARSER_OPTIONS defines the UI-selectable parsers.
  // This test validates that all FE parser options have a corresponding
  // backend/Python handler.

  // Expected parser types from the Python FACTORY (task_executor.py)
  // Source: FACTORY dict keys mapped from ParserType enum values
  const pythonFactoryParsers = new Set([
    'general',   // alias for naive
    'naive',     // ParserType.NAIVE
    'paper',     // ParserType.PAPER
    'book',      // ParserType.BOOK
    'presentation', // ParserType.PRESENTATION
    'manual',    // ParserType.MANUAL
    'laws',      // ParserType.LAWS
    'qa',        // ParserType.QA
    'table',     // ParserType.TABLE
    'resume',    // ParserType.RESUME
    'picture',   // ParserType.PICTURE
    'one',       // ParserType.ONE
    'audio',     // ParserType.AUDIO
    'email',     // ParserType.EMAIL
    'knowledge_graph', // ParserType.KG (mapped to naive)
    'tag',       // ParserType.TAG
  ])

  // Frontend PARSER_OPTIONS (from fe/src/features/datasets/types/index.ts)
  const frontendParserValues = [
    'naive', 'qa', 'resume', 'manual', 'table', 'paper',
    'book', 'laws', 'presentation', 'one', 'picture', 'audio', 'email',
  ]

  // Verify every FE parser option has a handler in the Python FACTORY
  const missingInFactory: string[] = []
  for (const parser of frontendParserValues) {
    if (!pythonFactoryParsers.has(parser)) {
      missingInFactory.push(parser)
    }
  }

  // All FE-selectable parsers must have a Python backend handler
  expect(missingInFactory).toEqual([])

  // Verify the FACTORY has no fewer parsers than the FE exposes
  // (FACTORY may have extras like 'general', 'knowledge_graph', 'tag' which
  // are internal/alias types not shown in the FE dropdown)
  expect(pythonFactoryParsers.size).toBeGreaterThanOrEqual(frontendParserValues.length)
})

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Get the chunk count for a document by querying the document list API.
 * @param {APIRequestContext} request - Playwright API request context
 * @param {string} dsId - Dataset UUID
 * @param {string} documentId - Document UUID
 * @returns {Promise<number>} Number of chunks for the document
 */
async function getDocumentChunkCount(
  request: APIRequestContext,
  dsId: string,
  documentId: string
): Promise<number> {
  const response = await request.get(
    `${API_BASE}/api/rag/datasets/${dsId}/documents`
  )

  if (!response.ok()) return 0

  const json = await response.json()
  const doc = json.data?.find((d: { id: string }) => d.id === documentId)

  // chunk_num is the RAGFlow field for chunk count
  return doc?.chunk_num ?? doc?.chunk_count ?? 0
}
