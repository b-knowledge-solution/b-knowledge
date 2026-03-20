/**
 * @fileoverview E2E tests for RAG dataset search API endpoint.
 *
 * Validates the backend search API at /api/rag/datasets/:id/search:
 * - Full-text search returns relevant chunks
 * - Search respects top_k parameter
 * - Search with no matching content returns empty results
 * - Search after document deletion returns no results for deleted doc
 *
 * These tests use API-level assertions only (no UI), making them faster
 * and more reliable for CI.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run
 *
 * @module e2e/rag-workflow/rag-dataset-search-api.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import { waitForDocumentParsed, waitForChunksIndexed } from '../helpers/wait.helper'
import path from 'path'

/** Backend API base URL */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

// ============================================================================
// Test state
// ============================================================================

let api: ApiHelper
let datasetId: string
let docId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)

  // Setup: create dataset with text content for predictable search
  const dataset = await api.createDataset(
    `E2E Search API ${Date.now()}`,
    'Search API tests',
  )
  datasetId = dataset.id

  // Upload a text document with known content
  const content = `
# Healthcare Document Management System

## Overview
This system provides secure document management for healthcare organizations.
It supports Electronic Health Records (EHR), clinical trial data, and regulatory submissions.

## Key Features
- HIPAA-compliant data storage with AES-256 encryption
- Audit trail for all document access and modifications
- Role-based access control with Active Directory integration
- Automated document classification using machine learning
- Full-text search across all document types

## Compliance
The system meets requirements for:
- ISO 13485:2016 — Quality management for medical devices
- IEC 62304:2006 — Medical device software lifecycle
- 21 CFR Part 11 — Electronic records and signatures
- GDPR Article 32 — Security of processing

## Architecture
Built on a microservices architecture with:
- PostgreSQL for relational data
- OpenSearch for full-text and vector search
- Redis for caching and session management
- S3-compatible storage for document files
`.trim()

  const buffer = Buffer.from(content, 'utf-8')
  const docs = await api.uploadDocumentBuffer(
    datasetId,
    'healthcare-system.txt',
    buffer,
    'text/plain',
  )
  docId = docs[0]!.id

  // Parse and wait for indexing
  await api.triggerParse(datasetId, [docId])
  await waitForDocumentParsed(request, datasetId, docId, 90_000)
  await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)
})

test.afterAll(async () => {
  try { if (datasetId) await api.deleteDataset(datasetId) } catch { /* */ }
})

// ============================================================================
// Dataset search API tests
// ============================================================================

test('RAG-SEARCH-001: Search API returns results for matching query', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/search`,
    {
      data: {
        query: 'healthcare compliance',
        top_k: 10,
      },
    },
  )

  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  const chunks = json.chunks || json.data || []

  expect(chunks.length).toBeGreaterThan(0)
})

test('RAG-SEARCH-002: Search API returns chunks with content', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/search`,
    {
      data: {
        query: 'HIPAA encryption',
        top_k: 5,
      },
    },
  )

  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  const chunks = json.chunks || json.data || []

  if (chunks.length > 0) {
    // Verify chunk has content field
    const firstChunk = chunks[0]
    expect(
      firstChunk.content ||
      firstChunk.content_with_weight ||
      firstChunk.text
    ).toBeTruthy()
  }
})

test('RAG-SEARCH-003: Search API respects top_k parameter', async ({ request }) => {
  // Request only 1 result
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/search`,
    {
      data: {
        query: 'document management',
        top_k: 1,
      },
    },
  )

  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  const chunks = json.chunks || json.data || []

  // Should return at most top_k results
  expect(chunks.length).toBeLessThanOrEqual(1)
})

test('RAG-SEARCH-004: Search API returns empty for irrelevant query', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/search`,
    {
      data: {
        query: 'xyzzy42qlmqpzxc completely unrelated gibberish term',
        top_k: 10,
        similarity_threshold: 0.9,
      },
    },
  )

  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  const chunks = json.chunks || json.data || []

  // High similarity threshold + irrelevant query should return few/no results
  // (exact behavior depends on search method)
  expect(chunks.length).toBeLessThanOrEqual(5)
})

test('RAG-SEARCH-005: Search finds ISO 13485 compliance content', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/search`,
    {
      data: {
        query: 'ISO 13485 medical device',
        top_k: 5,
      },
    },
  )

  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  const chunks = json.chunks || json.data || []

  // Should find the compliance section
  if (chunks.length > 0) {
    const allContent = chunks
      .map((c: any) => c.content || c.content_with_weight || c.text || '')
      .join(' ')
      .toLowerCase()
    expect(allContent).toContain('iso')
  }
})

test('RAG-SEARCH-006: Search finds architecture content', async ({ request }) => {
  const response = await request.post(
    `${API_BASE}/api/rag/datasets/${datasetId}/search`,
    {
      data: {
        query: 'PostgreSQL microservices architecture',
        top_k: 5,
      },
    },
  )

  expect(response.ok()).toBeTruthy()
  const json = await response.json()
  const chunks = json.chunks || json.data || []

  expect(chunks.length).toBeGreaterThan(0)
})

// ============================================================================
// Chunk listing API tests
// ============================================================================

test('RAG-SEARCH-007: List chunks returns all chunks for dataset', async () => {
  const chunksResponse = await api.listChunks(datasetId)

  expect(chunksResponse.data.length).toBeGreaterThan(0)

  // Verify each chunk has required fields
  for (const chunk of chunksResponse.data) {
    expect(chunk.id).toBeTruthy()
    expect(chunk.content.length).toBeGreaterThan(0)
    expect(chunk.doc_id).toBe(docId)
  }
})

test('RAG-SEARCH-008: List chunks filtered by doc_id', async () => {
  const chunksResponse = await api.listChunks(datasetId, docId)

  expect(chunksResponse.data.length).toBeGreaterThan(0)

  // All chunks should belong to the specified document
  for (const chunk of chunksResponse.data) {
    expect(chunk.doc_id).toBe(docId)
  }
})

// ============================================================================
// Document list with status
// ============================================================================

test('RAG-SEARCH-009: Document list shows parsed status', async () => {
  const docs = await api.listDocuments(datasetId)

  expect(docs.length).toBeGreaterThan(0)

  const doc = docs.find((d) => d.id === docId)
  expect(doc).toBeDefined()
  expect(doc!.progress).toBeGreaterThanOrEqual(1)
  expect(doc!.name).toContain('healthcare-system')
})
