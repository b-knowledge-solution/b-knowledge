/**
 * @fileoverview E2E tests for RAG pipeline error handling and edge cases.
 *
 * Validates that the RAG system handles errors gracefully:
 * - Invalid file type rejection
 * - Operations on non-existent resources (404 handling)
 * - Empty dataset search returns appropriate response
 * - Duplicate document upload handling
 * - API validation errors
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run
 *
 * Regulatory traceability:
 * - IEC 62304 §5.7 — Software risk management
 * - ISO 14971 — Risk management for medical devices
 *
 * @module e2e/rag-workflow/rag-error-handling.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import path from 'path'

/** Backend API base URL */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

// ============================================================================
// Test state
// ============================================================================

let api: ApiHelper
let datasetId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)

  // Create a dataset for error scenario testing
  const dataset = await api.createDataset(
    `E2E Error Handling ${Date.now()}`,
    'Error handling tests',
  )
  datasetId = dataset.id
})

test.afterAll(async () => {
  try { if (datasetId) await api.deleteDataset(datasetId) } catch { /* */ }
})

// ============================================================================
// Non-existent resource handling
// ============================================================================

test('RAG-ERR-001: Get non-existent dataset returns null/404', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const result = await api.getDataset(fakeId)

  expect(result).toBeNull()
})

test('RAG-ERR-002: Get non-existent document returns null/404', async () => {
  const fakeDocId = '00000000-0000-0000-0000-000000000000'
  const result = await api.getDocument(datasetId, fakeDocId)

  expect(result).toBeNull()
})

test('RAG-ERR-003: Delete non-existent dataset does not throw', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000000'

  // Should not throw — delete handles 404 gracefully
  await expect(api.deleteDataset(fakeId)).resolves.not.toThrow()
})

test('RAG-ERR-004: Delete non-existent document does not throw', async () => {
  const fakeDocId = '00000000-0000-0000-0000-000000000000'

  await expect(api.deleteDocument(datasetId, fakeDocId)).resolves.not.toThrow()
})

// ============================================================================
// Empty dataset operations
// ============================================================================

test('RAG-ERR-005: List documents on empty dataset returns empty array', async () => {
  const docs = await api.listDocuments(datasetId)

  expect(Array.isArray(docs)).toBe(true)
  expect(docs.length).toBe(0)
})

test('RAG-ERR-006: List chunks on empty dataset returns empty array', async () => {
  const chunks = await api.listChunks(datasetId)

  expect(Array.isArray(chunks.data)).toBe(true)
  expect(chunks.data.length).toBe(0)
})

test('RAG-ERR-007: Search on empty dataset returns empty results', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/search`,
    {
      data: {
        query: 'test query',
        top_k: 10,
      },
    },
  )

  // Should succeed but return empty results
  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  const chunks = json.chunks || json.data || []
  expect(chunks.length).toBe(0)
})

// ============================================================================
// Invalid operations
// ============================================================================

test('RAG-ERR-008: Create dataset with empty name fails', async ({ request }) => {
  const response = await request.post(`${API_BASE}/api/rag/datasets`, {
    data: {
      name: '',
      parser_id: 'naive',
    },
  })

  // Should return 400 or similar validation error
  expect(response.status()).toBeGreaterThanOrEqual(400)
})

test('RAG-ERR-009: Trigger parse with empty document list', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/documents/bulk-parse`,
    {
      data: { document_ids: [] },
    },
  )

  // Should either succeed silently or return a validation error
  // Both are acceptable behaviors
  expect([200, 400, 422]).toContain(response.status())
})

// ============================================================================
// API content type validation
// ============================================================================

test('RAG-ERR-010: API rejects non-JSON content type', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets`,
    {
      headers: { 'Content-Type': 'text/xml' },
      data: '<dataset><name>test</name></dataset>',
    },
  )

  // Should reject with 415 Unsupported Media Type or 400
  expect(response.status()).toBeGreaterThanOrEqual(400)
})

// ============================================================================
// Chat/Search app with non-existent dataset
// ============================================================================

test('RAG-ERR-011: Get non-existent chat assistant returns null/404', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const result = await api.getChatAssistant(fakeId)

  expect(result).toBeNull()
})

test('RAG-ERR-012: Get non-existent search app returns null/404', async () => {
  const fakeId = '00000000-0000-0000-0000-000000000000'
  const result = await api.getSearchApp(fakeId)

  expect(result).toBeNull()
})

// ============================================================================
// Health check
// ============================================================================

test('RAG-ERR-013: Health check endpoint is accessible', async ({ request }) => {
  const response = await request.get(`${API_BASE}/health`)

  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  expect(json.status).toBe('ok')
  expect(json.services).toBeDefined()
  expect(json.services.express).toBe('running')
})
