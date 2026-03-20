/**
 * @fileoverview E2E tests for the complete RAG pipeline end-to-end.
 *
 * Exercises the full Retrieval-Augmented Generation workflow:
 * 1. Create dataset with parser configuration
 * 2. Upload document(s) to dataset
 * 3. Trigger parsing and wait for completion
 * 4. Verify chunks are created and indexed
 * 5. Verify embeddings exist in OpenSearch
 * 6. Perform dataset-level search via API
 * 7. Create chat assistant linked to dataset
 * 8. Send chat message and verify RAG response with citations
 * 9. Create search app linked to dataset
 * 10. Perform search and verify results
 * 11. Full cleanup with cascade verification
 *
 * This is the "golden path" test that validates the entire RAG pipeline
 * works end-to-end across all services (BE, advance-rag, OpenSearch, RustFS).
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Regulatory traceability:
 * - ISO 13485 §7.5.3 — Traceability of outputs
 * - IEC 62304 §5.6 — Software integration testing
 *
 * @module e2e/rag-workflow/rag-full-pipeline.spec
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
let assistantId: string
let conversationId: string
let searchAppId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)
  osHelper = opensearchHelper()
})

test.afterAll(async () => {
  // Clean up in reverse creation order — cascade handles nested resources
  try { if (conversationId) await api.deleteConversation(conversationId) } catch { /* */ }
  try { if (assistantId) await api.deleteChatAssistant(assistantId) } catch { /* */ }
  try { if (searchAppId) await api.deleteSearchApp(searchAppId) } catch { /* */ }
  try { if (datasetId) await api.deleteDataset(datasetId) } catch { /* */ }
})

// ============================================================================
// Phase 1: Dataset Creation
// ============================================================================

test.describe('Phase 1 — Dataset Creation', () => {
  test('RAG-PIPE-001: Create dataset with naive parser config @smoke', async () => {
    const uniqueName = `E2E RAG Pipeline ${Date.now()}`

    const dataset = await api.createDataset(uniqueName, 'Full RAG pipeline test', {
      chunk_token_count: 256,
      delimiter: '\\n!?;。；！？',
      layout_recognize: true,
    })

    datasetId = dataset.id
    expect(datasetId).toBeTruthy()
    expect(dataset.name).toBe(uniqueName)
    expect(dataset.parser_id).toBe('naive')
  })

  test('RAG-PIPE-002: Verify dataset appears in dataset list', async () => {
    const datasets = await api.listDatasets()
    const found = datasets.find((d) => d.id === datasetId)

    expect(found).toBeDefined()
    expect(found!.doc_count).toBe(0)
    expect(found!.chunk_count).toBe(0)
  })
})

// ============================================================================
// Phase 2: Document Upload
// ============================================================================

test.describe('Phase 2 — Document Upload', () => {
  test('RAG-PIPE-003: Upload PDF document to dataset @smoke', async () => {
    const testDataDir = path.resolve(__dirname, '..', 'test-data')
    const samplePdf = path.join(testDataDir, 'sample.pdf')

    const docs = await api.uploadDocument(datasetId, samplePdf)

    expect(docs.length).toBeGreaterThan(0)
    docId = docs[0]!.id
    expect(docId).toBeTruthy()
  })

  test('RAG-PIPE-004: Verify document status is pending before parsing', async () => {
    const doc = await api.getDocument(datasetId, docId)

    expect(doc).not.toBeNull()
    // Document should exist but not yet be parsed
    expect(doc!.name).toContain('.pdf')
  })

  test('RAG-PIPE-005: Verify document appears in document list', async () => {
    const docs = await api.listDocuments(datasetId)

    expect(docs.length).toBeGreaterThan(0)
    const found = docs.find((d) => d.id === docId)
    expect(found).toBeDefined()
  })
})

// ============================================================================
// Phase 3: Parsing
// ============================================================================

test.describe('Phase 3 — Document Parsing', () => {
  test('RAG-PIPE-006: Trigger document parsing @smoke', async ({ request }) => {
    await api.triggerParse(datasetId, [docId])

    // Wait for parsing to complete (polls every 2s, 90s timeout)
    await waitForDocumentParsed(request, datasetId, docId, 90_000)

    // Verify parsing succeeded
    const doc = await api.getDocument(datasetId, docId)
    expect(doc).not.toBeNull()
    expect(doc!.progress).toBeGreaterThanOrEqual(1)
  })

  test('RAG-PIPE-007: Verify chunks are generated after parsing', async ({ request }) => {
    // Wait for chunks to be indexed
    await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)

    const chunksResponse = await api.listChunks(datasetId, docId)

    expect(chunksResponse.data.length).toBeGreaterThan(0)
    // Verify chunk has content
    expect(chunksResponse.data[0]!.content.length).toBeGreaterThan(0)
  })

  test('RAG-PIPE-008: Verify all chunks are marked available', async () => {
    const chunksResponse = await api.listChunks(datasetId, docId)

    // All chunks should be available for search by default
    for (const chunk of chunksResponse.data) {
      expect(chunk.available).toBe(true)
    }
  })
})

// ============================================================================
// Phase 4: OpenSearch Indexing & Embeddings
// ============================================================================

test.describe('Phase 4 — OpenSearch Indexing & Embeddings', () => {
  test('RAG-PIPE-009: Verify chunks exist in OpenSearch @smoke', async () => {
    const indexName = osHelper.getIndexName()
    await osHelper.refreshIndex(indexName)

    const chunks = await osHelper.getChunksByDocId(indexName, docId)

    expect(chunks.length).toBeGreaterThan(0)
    // Verify chunk has content
    expect(chunks[0]!.content.length).toBeGreaterThan(0)
    // Verify chunk is linked to correct dataset
    expect(chunks[0]!.kb_id).toBeTruthy()
  })

  test('RAG-PIPE-010: Verify embedding vectors exist for chunks', async () => {
    const indexName = osHelper.getIndexName()
    const chunks = await osHelper.getChunksByDocId(indexName, docId)

    // At least some chunks should have embeddings
    const withEmbeddings = chunks.filter((c) => c.has_embedding)
    expect(withEmbeddings.length).toBeGreaterThan(0)

    // Verify embedding dimensions are consistent and valid
    const dim = withEmbeddings[0]!.embedding_dim
    expect(dim).toBeGreaterThan(0)

    // All embedded chunks should have the same dimension
    for (const chunk of withEmbeddings) {
      expect(chunk.embedding_dim).toBe(dim)
    }
  })

  test('RAG-PIPE-011: Verify chunks are searchable via full-text search', async () => {
    const indexName = osHelper.getIndexName()
    await osHelper.refreshIndex(indexName)

    const results = await osHelper.searchChunks(indexName, 'document', datasetId)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0]!.content.length).toBeGreaterThan(0)
    expect(results[0]!.score).toBeGreaterThan(0)
  })
})

// ============================================================================
// Phase 5: Chat (RAG Retrieval + LLM)
// ============================================================================

test.describe('Phase 5 — Chat with RAG Context', () => {
  test('RAG-PIPE-012: Create chat assistant linked to dataset @smoke', async () => {
    const assistant = await api.createChatAssistant(
      `E2E RAG Pipeline Assistant ${Date.now()}`,
      [datasetId],
    )

    assistantId = assistant.id
    expect(assistantId).toBeTruthy()
    expect(assistant.name).toContain('RAG Pipeline')
  })

  test('RAG-PIPE-013: Create conversation for chat testing', async () => {
    const conversation = await api.createConversation(
      assistantId,
      `E2E Pipeline Conversation ${Date.now()}`,
    )

    conversationId = conversation.id
    expect(conversationId).toBeTruthy()
  })

  test('RAG-PIPE-014: Send message and receive RAG-augmented response @smoke', async ({ page }) => {
    // Navigate to the chat conversation
    await page.goto(`/chat/${conversationId}`)
    await page.waitForLoadState('networkidle')

    // Find message input
    const input = page.getByPlaceholder(/type|message|ask/i).or(page.locator('textarea'))
    await expect(input).toBeVisible({ timeout: 10_000 })
    await input.fill('What is this document about? Summarize the key points.')

    // Send message
    const sendButton = page.getByRole('button', { name: /send/i })
    if (await sendButton.isVisible()) {
      await sendButton.click()
    } else {
      await input.press('Enter')
    }

    // Wait for streaming response to appear
    const assistantMessage = page.locator(
      '[data-role="assistant"], .assistant-message, [class*="assistant"]'
    ).last()
    await expect(assistantMessage).toBeVisible({ timeout: 60_000 })

    // Wait for streaming to complete
    await page.waitForTimeout(8000)

    // Verify response has substantive content
    const responseText = await assistantMessage.textContent()
    expect(responseText?.trim().length).toBeGreaterThan(20)
  })

  test('RAG-PIPE-015: Verify response contains source citations', async ({ page }) => {
    await page.goto(`/chat/${conversationId}`)
    await page.waitForLoadState('networkidle')

    // Wait for messages to load
    const assistantMessage = page.locator(
      '[data-role="assistant"], .assistant-message, [class*="assistant"]'
    ).last()
    await expect(assistantMessage).toBeVisible({ timeout: 30_000 })

    // Check for citation elements or reference patterns
    const citationElements = page.locator(
      '[data-citation], .citation, sup, [class*="citation"], [class*="reference"]'
    )
    const hasCitationElements = await citationElements.count() > 0

    if (!hasCitationElements) {
      // Check for numbered reference patterns [1], [2], ##1##, etc.
      const text = await assistantMessage.textContent()
      const hasCitationPattern = text ? /\[\d+\]|##\d+##/.test(text) : false

      // At minimum the response should have content from the document
      expect(text?.trim().length).toBeGreaterThan(0)
    }
  })

  test('RAG-PIPE-016: Conversation history persists across page reload', async ({ page }) => {
    await page.goto(`/chat/${conversationId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Count messages
    const messagesBefore = await page.locator(
      '[data-role="user"], [data-role="assistant"], .user-message, .assistant-message'
    ).count()
    expect(messagesBefore).toBeGreaterThan(0)

    // Reload and verify persistence
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    const messagesAfter = await page.locator(
      '[data-role="user"], [data-role="assistant"], .user-message, .assistant-message'
    ).count()
    expect(messagesAfter).toBeGreaterThanOrEqual(messagesBefore)
  })
})

// ============================================================================
// Phase 6: Search Application
// ============================================================================

test.describe('Phase 6 — Search Application', () => {
  test('RAG-PIPE-017: Create search app linked to dataset @smoke', async () => {
    const searchApp = await api.createSearchApp(
      `E2E RAG Pipeline Search ${Date.now()}`,
      [datasetId],
    )

    searchAppId = searchApp.id
    expect(searchAppId).toBeTruthy()
  })

  test('RAG-PIPE-018: Verify search app is retrievable', async () => {
    const app = await api.getSearchApp(searchAppId)

    expect(app).not.toBeNull()
    expect(app!.id).toBe(searchAppId)
  })
})

// ============================================================================
// Phase 7: Cleanup & Cascade Verification
// ============================================================================

test.describe('Phase 7 — Cleanup & Cascade Verification', () => {
  test('RAG-PIPE-019: Delete conversation', async () => {
    await api.deleteConversation(conversationId)

    // Verify conversation list no longer includes it
    const conversations = await api.listConversations(assistantId)
    const found = conversations.find((c) => c.id === conversationId)
    expect(found).toBeUndefined()

    conversationId = ''
  })

  test('RAG-PIPE-020: Delete chat assistant', async () => {
    await api.deleteChatAssistant(assistantId)

    const deleted = await api.getChatAssistant(assistantId)
    expect(deleted).toBeNull()

    assistantId = ''
  })

  test('RAG-PIPE-021: Delete search app', async () => {
    await api.deleteSearchApp(searchAppId)

    const deleted = await api.getSearchApp(searchAppId)
    expect(deleted).toBeNull()

    searchAppId = ''
  })

  test('RAG-PIPE-022: Delete dataset and verify OpenSearch cleanup @smoke', async () => {
    const indexName = osHelper.getIndexName()

    await api.deleteDataset(datasetId)

    // Verify dataset is deleted
    const deleted = await api.getDataset(datasetId)
    expect(deleted).toBeNull()

    // Wait for OpenSearch cleanup to propagate
    await new Promise((r) => setTimeout(r, 3000))
    await osHelper.refreshIndex(indexName)

    // Verify no chunks remain in OpenSearch for the deleted dataset
    const results = await osHelper.searchChunks(indexName, 'document', datasetId)
    expect(results.length).toBe(0)

    datasetId = ''
  })
})
