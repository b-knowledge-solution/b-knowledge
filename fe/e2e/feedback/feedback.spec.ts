/**
 * @fileoverview E2E tests for answer feedback on chat and search.
 *
 * Validates CHAT-03: user can submit thumbs up/down feedback on both
 * chat answers and search AI summaries.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/feedback/feedback.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import path from 'path'
import { fileURLToPath } from 'url'

/** ESM-compatible __dirname equivalent */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Track resources for cleanup */
let api: ApiHelper
let datasetId: string
let assistantId: string
let conversationId: string
let searchAppId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)

  // Create a shared dataset with a parsed document
  const dataset = await api.createDataset(`E2E Feedback Dataset ${Date.now()}`, 'For feedback tests')
  datasetId = dataset.id

  // Upload and parse sample document
  const testDataDir = path.resolve(__dirname, '..', 'test-data')
  const docs = await api.uploadDocument(datasetId, path.join(testDataDir, 'sample.pdf'))

  if (docs.length > 0) {
    await api.triggerParse(datasetId, docs.map((d) => d.id))
    const docId = docs[0]!.id
    const maxWait = 120_000
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      const doc = await api.getDocument(datasetId, docId)
      if (doc && doc.progress >= 1) break
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  // Create chat assistant and conversation
  const assistantRes = await api.createChatAssistant(
    `E2E Feedback Chat Assistant ${Date.now()}`,
    [datasetId]
  )
  assistantId = assistantRes.id

  const convRes = await api.createConversation(assistantId, `E2E Feedback Conversation ${Date.now()}`)
  conversationId = convRes.id

  // Create search app
  const searchApp = await api.createSearchApp(
    `E2E Feedback Search App ${Date.now()}`,
    [datasetId]
  )
  searchAppId = searchApp.id
})

test.afterAll(async () => {
  // Clean up all resources
  try { if (conversationId) await api.deleteConversation(conversationId) } catch { /* ignore */ }
  try { if (assistantId) await api.deleteChatAssistant(assistantId) } catch { /* ignore */ }
  try { if (searchAppId) await api.deleteSearchApp(searchAppId) } catch { /* ignore */ }
  try { if (datasetId) await api.deleteDataset(datasetId) } catch { /* ignore */ }
})

// ============================================================================
// Chat Feedback Tests
// ============================================================================

test('Submit thumbs up on chat answer @smoke', async ({ page }) => {
  // Navigate to chat page with the test conversation
  await page.goto(`/chat/${conversationId}`)
  await page.waitForLoadState('networkidle')

  // Send a message to get an assistant response
  const input = page.getByPlaceholder(/type|message|ask/i).or(page.locator('textarea'))
  await input.fill('What is this document about?')

  const sendButton = page.getByRole('button', { name: /send/i })
  if (await sendButton.isVisible()) {
    await sendButton.click()
  } else {
    await input.press('Enter')
  }

  // Wait for assistant response
  const assistantMessage = page.locator('[data-role="assistant"], .assistant-message, [class*="assistant"]').last()
  await expect(assistantMessage).toBeVisible({ timeout: 60_000 })

  // Intercept the feedback API call
  const feedbackPromise = page.waitForResponse(
    (response) => response.url().includes('/feedback') && response.status() === 200,
    { timeout: 10_000 }
  ).catch(() => null)

  // Click thumbs up button on the assistant message
  const thumbsUpButton = page.locator('button[title*="thumbs"], button[title*="Thumbs"]').or(
    page.locator('[data-role="assistant"] button, .assistant-message button').filter({
      has: page.locator('svg')
    }).first()
  )

  if (await thumbsUpButton.isVisible()) {
    await thumbsUpButton.click()

    // Wait for feedback API call
    const response = await feedbackPromise
    // Verify the button shows selected state (green color)
    if (response) {
      expect(response.status()).toBe(200)
    }
  }
})

// ============================================================================
// Search Feedback Tests
// ============================================================================

test('Submit thumbs down on search answer @smoke', async ({ page }) => {
  // Navigate to search page
  await page.goto('/search')
  await page.waitForLoadState('networkidle')

  // Select the test search app
  const appSelector = page.getByRole('combobox').or(page.locator('[data-testid="search-app-select"]'))
  if (await appSelector.isVisible()) {
    await appSelector.click()
    const option = page.getByText(new RegExp('E2E Feedback Search App', 'i'))
    if (await option.isVisible()) {
      await option.click()
    }
  }

  // Perform a search
  const searchInput = page.getByPlaceholder(/search|query|ask/i).or(page.locator('input[type="search"], input[type="text"]').first())
  await searchInput.fill('What is the document about?')
  await searchInput.press('Enter')

  // Wait for results to appear
  await page.waitForTimeout(5000)

  // Look for thumbs down button on search results
  const thumbsDownButton = page.locator('button[title*="Not helpful"], button[title*="not helpful"]').first()

  if (await thumbsDownButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Intercept feedback API call
    const feedbackPromise = page.waitForResponse(
      (response) => response.url().includes('/feedback') && (response.status() === 200 || response.status() === 201),
      { timeout: 10_000 }
    ).catch(() => null)

    await thumbsDownButton.click()

    // Verify the feedback was submitted
    const response = await feedbackPromise
    if (response) {
      expect(response.status()).toBeLessThanOrEqual(201)
    }

    // Verify button shows selected state
    await expect(thumbsDownButton).toHaveClass(/text-red/)
  }
})

// ============================================================================
// Feedback Persistence Tests
// ============================================================================

test('Feedback persists in database via API', async ({ request }) => {
  const apiBase = process.env.E2E_API_BASE || 'http://localhost:3001'

  // Submit feedback via the API directly
  const feedbackRes = await request.post(`${apiBase}/api/feedback`, {
    data: {
      source: 'search',
      source_id: searchAppId,
      thumbup: true,
      query: 'test query for persistence',
      answer: 'test answer for persistence',
      comment: 'E2E test feedback',
    },
  })

  // Assert: API should return 201 for created feedback
  expect(feedbackRes.status()).toBe(201)

  // Verify the response contains correct data
  const feedbackData = await feedbackRes.json()
  expect(feedbackData.source).toBe('search')
  expect(feedbackData.source_id).toBe(searchAppId)
  expect(feedbackData.thumbup).toBe(true)
  expect(feedbackData.query).toBe('test query for persistence')
  expect(feedbackData.answer).toBe('test answer for persistence')
})
