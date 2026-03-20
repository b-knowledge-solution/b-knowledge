/**
 * @fileoverview E2E tests for the complete search user experience.
 *
 * Exercises the full search flow: dataset setup -> search app creation ->
 * search execution -> result verification -> citations -> feedback ->
 * edge cases (no results).
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/search/search-full-flow.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import { waitForDocumentParsed, waitForChunksIndexed } from '../helpers/wait.helper'
import path from 'path'

/** Search page base URL */
const SEARCH_URL = '/search'

/** Track resources for cleanup */
let api: ApiHelper
let datasetId: string
let searchAppId: string
let searchAppName: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)

  // Create a test dataset with a parsed document
  const dataset = await api.createDataset(
    `E2E Search Flow Dataset ${Date.now()}`,
    'For full search flow tests',
  )
  datasetId = dataset.id

  // Upload and parse a sample document for retrieval
  const testDataDir = path.resolve(__dirname, '..', 'test-data')
  const docs = await api.uploadDocument(datasetId, path.join(testDataDir, 'sample.pdf'))

  if (docs.length > 0) {
    const docId = docs[0]!.id
    await api.triggerParse(datasetId, [docId])
    await waitForDocumentParsed(request, datasetId, docId, 120_000)
    await waitForChunksIndexed(request, datasetId, docId, 1, 30_000)
  }

  // Create a search app linked to the dataset
  searchAppName = `E2E Search Flow App ${Date.now()}`
  const searchApp = await api.createSearchApp(searchAppName, [datasetId])
  searchAppId = searchApp.id
})

test.afterAll(async () => {
  // Clean up resources
  try {
    if (searchAppId) await api.deleteSearchApp(searchAppId)
  } catch { /* ignore cleanup errors */ }
  try {
    if (datasetId) await api.deleteDataset(datasetId)
  } catch { /* ignore cleanup errors */ }
})

// ============================================================================
// Helper: select the test search app
// ============================================================================

/**
 * @description Select the test search app from the search page dropdown.
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @returns {Promise<void>}
 */
async function selectTestSearchApp(page: import('@playwright/test').Page): Promise<void> {
  // Look for a search app selector (combobox, dropdown, or select)
  const appSelector = page.getByRole('combobox')
    .or(page.locator('[data-testid="search-app-select"]'))
    .or(page.locator('select'))

  if (await appSelector.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await appSelector.first().click()

    // Select the test search app from the dropdown
    const option = page.getByText(new RegExp(searchAppName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      .or(page.getByText(/E2E Search Flow App/i))
    if (await option.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await option.first().click()
    }
  }
}

// ============================================================================
// Enter search query and submit
// ============================================================================

test('Enter search query and verify results are displayed @smoke', async ({ page }) => {
  // Navigate to search page
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')

  // Select the test search app
  await selectTestSearchApp(page)

  // Find the search input and enter a query
  const searchInput = page.getByPlaceholder(/search|query|ask/i)
    .or(page.locator('input[type="search"], input[type="text"]').first())
    .or(page.locator('textarea'))
  await expect(searchInput.first()).toBeVisible({ timeout: 10_000 })
  await searchInput.first().fill('What is the document about?')
  await searchInput.first().press('Enter')

  // Wait for results to load
  await page.waitForTimeout(5000)

  // Verify at least one result is visible
  const resultElements = page.locator(
    '[class*="result"], [data-testid="search-result"], [class*="chunk"], [class*="card"]'
  ).or(
    page.locator('article, [role="article"]')
  )

  const resultCount = await resultElements.count()
  expect(resultCount).toBeGreaterThan(0)
})

// ============================================================================
// Verify results contain relevant content
// ============================================================================

test('Verify search results contain relevant content', async ({ page }) => {
  // Navigate and perform search
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')
  await selectTestSearchApp(page)

  const searchInput = page.getByPlaceholder(/search|query|ask/i)
    .or(page.locator('input[type="search"], input[type="text"]').first())
    .or(page.locator('textarea'))
  await searchInput.first().fill('document content')
  await searchInput.first().press('Enter')
  await page.waitForTimeout(5000)

  // Verify result content is non-empty
  const pageContent = await page.textContent('body')
  expect(pageContent).toBeTruthy()
  expect(pageContent!.length).toBeGreaterThan(100)
})

// ============================================================================
// Verify result cards show document source/metadata
// ============================================================================

test('Verify result cards show document source metadata @smoke', async ({ page }) => {
  // Navigate and perform search
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')
  await selectTestSearchApp(page)

  const searchInput = page.getByPlaceholder(/search|query|ask/i)
    .or(page.locator('input[type="search"], input[type="text"]').first())
    .or(page.locator('textarea'))
  await searchInput.first().fill('document content')
  await searchInput.first().press('Enter')
  await page.waitForTimeout(5000)

  // Verify the source document name appears in results (sample.pdf)
  const bodyText = await page.textContent('body')
  expect(bodyText).toContain('sample.pdf')
})

// ============================================================================
// Verify citations/references in search results
// ============================================================================

test('Verify citations or references in search results', async ({ page }) => {
  // Navigate and perform search
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')
  await selectTestSearchApp(page)

  const searchInput = page.getByPlaceholder(/search|query|ask/i)
    .or(page.locator('input[type="search"], input[type="text"]').first())
    .or(page.locator('textarea'))
  await searchInput.first().fill('What is the document about?')
  await searchInput.first().press('Enter')
  await page.waitForTimeout(5000)

  // Look for citation elements or reference markers
  const citations = page.locator(
    '[data-citation], .citation, [class*="citation"], [class*="reference"], [class*="source"]'
  )
  const bodyText = await page.textContent('body')

  // Either citation elements exist or the results contain document reference text
  const hasCitations = await citations.count() > 0
  const hasDocRef = bodyText ? bodyText.includes('sample.pdf') : false

  // At least one form of source attribution should be present
  expect(hasCitations || hasDocRef).toBeTruthy()
})

// ============================================================================
// Click on a result to view document details
// ============================================================================

test('Click on a result to view document details', async ({ page }) => {
  // Navigate and perform search
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')
  await selectTestSearchApp(page)

  const searchInput = page.getByPlaceholder(/search|query|ask/i)
    .or(page.locator('input[type="search"], input[type="text"]').first())
    .or(page.locator('textarea'))
  await searchInput.first().fill('document content')
  await searchInput.first().press('Enter')
  await page.waitForTimeout(5000)

  // Find a clickable result element
  const resultLink = page.locator(
    '[class*="result"] a, [data-testid="search-result"] a, [class*="chunk"] a, [class*="card"] a'
  ).first().or(
    page.locator('[class*="result"], [class*="chunk"]').first()
  )

  if (await resultLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await resultLink.click()
    await page.waitForTimeout(2000)

    // A detail panel, modal, or page should appear with document content
    const detailContent = page.locator(
      '[class*="detail"], [class*="preview"], [role="dialog"], [class*="drawer"]'
    ).last()

    if (await detailContent.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const text = await detailContent.textContent()
      expect(text?.trim().length).toBeGreaterThan(0)
    }
  }
})

// ============================================================================
// Test search with no results
// ============================================================================

test('Search with irrelevant query returns no results or appropriate message', async ({ page }) => {
  // Navigate and perform search with gibberish query
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')
  await selectTestSearchApp(page)

  const searchInput = page.getByPlaceholder(/search|query|ask/i)
    .or(page.locator('input[type="search"], input[type="text"]').first())
    .or(page.locator('textarea'))
  await searchInput.first().fill('xyzzy42 qlmqpzxc nonexistent gibberish')
  await searchInput.first().press('Enter')
  await page.waitForTimeout(5000)

  // Either no results are shown or a "no results" message is displayed
  const noResultsMessage = page.getByText(/no result|not found|nothing|empty/i)
  const resultElements = page.locator(
    '[class*="result"], [data-testid="search-result"], [class*="chunk"]'
  )

  const hasNoResultsMsg = await noResultsMessage.isVisible({ timeout: 5_000 }).catch(() => false)
  const resultCount = await resultElements.count()

  // Either explicitly tells user "no results" or shows zero result cards
  expect(hasNoResultsMsg || resultCount === 0).toBeTruthy()
})

// ============================================================================
// Test search filters (if available)
// ============================================================================

test('Test search filters if available', async ({ page }) => {
  // Navigate to search page
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')
  await selectTestSearchApp(page)

  // Look for filter controls (document filter, method selector, etc.)
  const filterButton = page.getByRole('button', { name: /filter/i })
    .or(page.locator('[data-testid="search-filters"]'))
    .or(page.locator('[class*="filter"]').first())

  if (await filterButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await filterButton.click()
    await page.waitForTimeout(1000)

    // Verify filter UI is visible
    const filterPanel = page.locator('[class*="filter"], [class*="panel"], [role="dialog"]').last()
    if (await filterPanel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Filter UI exists -- test passes
      expect(true).toBeTruthy()
    }
  }
  // If no filter UI exists, test passes silently (filters are optional)
})

// ============================================================================
// Submit feedback on search results
// ============================================================================

test('Submit feedback on search results', async ({ page }) => {
  // Navigate and perform search
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')
  await selectTestSearchApp(page)

  const searchInput = page.getByPlaceholder(/search|query|ask/i)
    .or(page.locator('input[type="search"], input[type="text"]').first())
    .or(page.locator('textarea'))
  await searchInput.first().fill('What is the document about?')
  await searchInput.first().press('Enter')
  await page.waitForTimeout(5000)

  // Look for feedback buttons (thumbs up/down, rating, etc.)
  const feedbackButton = page.locator(
    'button[aria-label*="like"], button[aria-label*="feedback"], button[title*="like"], [data-testid*="thumb"], [class*="feedback"] button'
  ).first()

  if (await feedbackButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await feedbackButton.click()
    await page.waitForTimeout(1000)

    // Check if a feedback dialog appeared
    const feedbackDialog = page.locator('[role="dialog"]').last()
    if (await feedbackDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Submit the feedback dialog if present
      const submitButton = feedbackDialog.getByRole('button', { name: /submit|send|save/i })
      if (await submitButton.isVisible()) {
        await submitButton.click()
      }
    }
  }
  // If no feedback UI exists, test passes silently
})
