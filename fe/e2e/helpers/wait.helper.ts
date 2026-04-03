/**
 * @fileoverview Async polling helpers for E2E tests.
 *
 * Provides non-sleep-based waiting functions that poll backend APIs
 * until an expected state is reached or a timeout expires. Used for
 * document parsing, chunk indexing, and other async RAG pipeline operations.
 *
 * @module e2e/helpers/wait.helper
 */

import { APIRequestContext } from '@playwright/test'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/**
 * @description Poll the document status API until parsing completes or fails.
 *
 * Checks the document `run` status every 2 seconds:
 * - `run === '1'` or `progress >= 1.0` => parsing complete (resolves)
 * - `run === '-1'` => parsing failed (throws with progress_msg)
 * - Timeout exceeded => throws timeout error
 *
 * @param {APIRequestContext} request - Playwright API request context
 * @param {string} datasetId - Dataset UUID containing the document
 * @param {string} docId - Document UUID to monitor
 * @param {number} [timeoutMs=60000] - Maximum wait time in milliseconds
 * @returns {Promise<void>} Resolves when parsing is complete
 * @throws {Error} If parsing fails or times out
 */
export async function waitForDocumentParsed(
  request: APIRequestContext,
  datasetId: string,
  docId: string,
  timeoutMs = 60_000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const response = await request.get(
      `${API_BASE}/api/rag/datasets/${datasetId}/documents`
    )

    if (response.ok()) {
      const json = await response.json()
      const doc = json.data?.find((d: { id: string }) => d.id === docId)

      if (doc) {
        // Document run status '1' means parsing succeeded
        if (doc.run === '1' || doc.progress >= 1.0) return

        // Document run status '-1' means parsing failed
        if (doc.run === '-1') {
          throw new Error(
            `Document parsing failed: ${doc.progress_msg || 'unknown error'}`
          )
        }
      }
    }

    // Poll every 2 seconds to avoid hammering the API
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error(
    `Document parsing timed out after ${timeoutMs}ms (dataset: ${datasetId}, doc: ${docId})`
  )
}

/**
 * @description Poll the chunk list endpoint until at least `minChunks` chunks exist.
 *
 * Used after document parsing to wait for chunks to be indexed in OpenSearch.
 * Polls every 2 seconds until the minimum chunk count is reached or timeout.
 *
 * @param {APIRequestContext} request - Playwright API request context
 * @param {string} datasetId - Dataset UUID
 * @param {string} docId - Document UUID whose chunks to count
 * @param {number} [minChunks=1] - Minimum number of chunks to wait for
 * @param {number} [timeoutMs=30000] - Maximum wait time in milliseconds
 * @returns {Promise<void>} Resolves when enough chunks are indexed
 * @throws {Error} If timeout is reached before chunks appear
 */
export async function waitForChunksIndexed(
  request: APIRequestContext,
  datasetId: string,
  docId: string,
  minChunks = 1,
  timeoutMs = 30_000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const response = await request.get(
      `${API_BASE}/api/rag/datasets/${datasetId}/chunks`,
      { params: { doc_id: docId } }
    )

    if (response.ok()) {
      const json = await response.json()
      const chunks = json.data || []

      // Resolve once minimum chunk count is met
      if (chunks.length >= minChunks) return
    }

    // Poll every 2 seconds
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error(
    `Chunk indexing timed out after ${timeoutMs}ms — expected at least ${minChunks} chunks ` +
    `(dataset: ${datasetId}, doc: ${docId})`
  )
}
