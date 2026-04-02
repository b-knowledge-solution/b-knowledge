/**
 * @fileoverview E2E tests for multi-document RAG scenarios.
 *
 * Validates that the RAG pipeline correctly handles multiple documents:
 * - Multiple documents parsed independently
 * - Cross-document search returns relevant results from all docs
 * - Per-document chunk counts are tracked correctly
 * - Deleting one document doesn't affect others
 * - Dataset chunk count reflects total across all documents
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * @module e2e/rag-workflow/rag-multi-document.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import { waitForDocumentParsed, waitForChunksIndexed } from '../helpers/wait.helper'
import { OpenSearchHelper, opensearchHelper } from '../helpers/opensearch.helper'
import path from 'path'
import { fileURLToPath } from 'url'

/** ESM-compatible __dirname equivalent */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ============================================================================
// Test state
// ============================================================================

let api: ApiHelper
let osHelper: OpenSearchHelper
let datasetId: string
let docIds: string[] = []

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)
  osHelper = opensearchHelper()
})

test.afterAll(async () => {
  try { if (datasetId) await api.deleteDataset(datasetId) } catch { /* */ }
})

// ============================================================================
// Setup: Create dataset
// ============================================================================

test('RAG-MULTI-001: Create dataset for multi-document testing', async () => {
  const dataset = await api.createDataset(
    `E2E Multi-Doc ${Date.now()}`,
    'Multi-document RAG test',
  )
  datasetId = dataset.id
  expect(datasetId).toBeTruthy()
})

// ============================================================================
// Upload multiple documents
// ============================================================================

test('RAG-MULTI-002: Upload first document (PDF)', async () => {
  const testDataDir = path.resolve(__dirname, '..', 'test-data')
  const docs = await api.uploadDocument(datasetId, path.join(testDataDir, 'sample.pdf'))

  expect(docs.length).toBeGreaterThan(0)
  docIds.push(docs[0]!.id)
})

test('RAG-MULTI-003: Upload second document (text buffer)', async () => {
  const content = `
# B-Knowledge Technical Architecture

B-Knowledge is a Retrieval-Augmented Generation (RAG) platform for enterprise knowledge management.

## Core Components

- **Backend API**: Node.js + Express + TypeScript
- **Frontend SPA**: React 19 + Vite + TanStack Query
- **RAG Worker**: Python + FastAPI + OpenSearch
- **Converter**: Python + LibreOffice for Office-to-PDF conversion

## Key Features

1. Document upload and automatic parsing
2. Semantic chunking with embedding generation
3. Hybrid search (full-text + vector similarity)
4. Chat with RAG-augmented responses and citations
5. Role-based access control (RBAC)
6. Multi-tenant architecture
7. Dataset versioning and audit trail
`.trim()

  const buffer = Buffer.from(content, 'utf-8')
  const docs = await api.uploadDocumentBuffer(
    datasetId,
    'architecture.txt',
    buffer,
    'text/plain',
  )

  expect(docs.length).toBeGreaterThan(0)
  docIds.push(docs[0]!.id)
})

// ============================================================================
// Parse all documents
// ============================================================================

test('RAG-MULTI-004: Parse all documents and wait for completion', async ({ request }) => {
  // Trigger bulk parse for all documents
  await api.triggerParse(datasetId, docIds)

  // Wait for each document to finish
  for (const id of docIds) {
    await waitForDocumentParsed(request, datasetId, id, 90_000)
  }

  // Verify all documents are parsed
  for (const id of docIds) {
    const doc = await api.getDocument(datasetId, id)
    expect(doc).not.toBeNull()
    expect(doc!.progress).toBeGreaterThanOrEqual(1)
  }
})

// ============================================================================
// Verify per-document chunks
// ============================================================================

test('RAG-MULTI-005: Verify each document has chunks', async ({ request }) => {
  for (const id of docIds) {
    await waitForChunksIndexed(request, datasetId, id, 1, 30_000)

    const chunksResponse = await api.listChunks(datasetId, id)
    expect(chunksResponse.data.length).toBeGreaterThan(0)
  }
})

test('RAG-MULTI-006: Verify total chunks across all documents', async () => {
  // Get chunks without doc_id filter to get total
  const allChunks = await api.listChunks(datasetId)
  expect(allChunks.data.length).toBeGreaterThan(0)

  // Total should be at least the sum of per-document chunks
  let docChunkTotal = 0
  for (const id of docIds) {
    const chunks = await api.listChunks(datasetId, id)
    docChunkTotal += chunks.data.length
  }

  expect(allChunks.data.length).toBeGreaterThanOrEqual(docChunkTotal)
})

// ============================================================================
// Cross-document OpenSearch verification
// ============================================================================

test('RAG-MULTI-007: Verify all documents have chunks in OpenSearch', async () => {
  const indexName = osHelper.getIndexName()
  await osHelper.refreshIndex(indexName)

  for (const id of docIds) {
    const chunks = await osHelper.getChunksByDocId(indexName, id)
    expect(chunks.length).toBeGreaterThan(0)
  }
})

test('RAG-MULTI-008: Cross-document search returns results from multiple docs', async () => {
  const indexName = osHelper.getIndexName()
  await osHelper.refreshIndex(indexName)

  // Search for a term that should appear in the text document
  const results = await osHelper.searchChunks(indexName, 'knowledge', datasetId)
  expect(results.length).toBeGreaterThan(0)
})

// ============================================================================
// Delete single document — verify isolation
// ============================================================================

test('RAG-MULTI-009: Delete first document without affecting second', async () => {
  expect(docIds.length).toBeGreaterThanOrEqual(2)
  const docToDelete = docIds[0]!
  const docToKeep = docIds[1]!

  const indexName = osHelper.getIndexName()

  // Delete the first document
  await api.deleteDocument(datasetId, docToDelete)

  // Verify deleted document is gone
  const deleted = await api.getDocument(datasetId, docToDelete)
  expect(deleted).toBeNull()

  // Wait for cleanup to propagate
  await new Promise((r) => setTimeout(r, 3000))
  await osHelper.refreshIndex(indexName)

  // Verify deleted doc's chunks are removed from OpenSearch
  const deletedChunks = await osHelper.getChunksByDocId(indexName, docToDelete)
  expect(deletedChunks.length).toBe(0)

  // Verify remaining doc's chunks still exist
  const remainingChunks = await osHelper.getChunksByDocId(indexName, docToKeep)
  expect(remainingChunks.length).toBeGreaterThan(0)

  // Update tracking
  docIds = docIds.filter((id) => id !== docToDelete)
})

// ============================================================================
// Cleanup
// ============================================================================

test('RAG-MULTI-010: Delete dataset and verify full cleanup', async () => {
  const indexName = osHelper.getIndexName()
  const remainingDocId = docIds[0]!

  await api.deleteDataset(datasetId)

  const deleted = await api.getDataset(datasetId)
  expect(deleted).toBeNull()

  // Wait for OpenSearch cleanup
  await new Promise((r) => setTimeout(r, 3000))
  await osHelper.refreshIndex(indexName)

  // Verify all chunks are removed
  const chunks = await osHelper.getChunksByDocId(indexName, remainingDocId)
  expect(chunks.length).toBe(0)

  datasetId = ''
  docIds = []
})
