/**
 * @fileoverview E2E tests for search execution and result display.
 *
 * Validates CHAT-02: user can perform a search and receive filtered,
 * paginated results with source document references.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/search/search-query.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'
import path from 'path'
import { fileURLToPath } from 'url'

/** ESM-compatible __dirname equivalent */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Search page base URL */
const SEARCH_URL = '/search'

/** Track resources for cleanup */
let api: ApiHelper
let datasetId: string
let searchAppId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)

  // Create a test dataset with a parsed document
  const dataset = await api.createDataset(`E2E Search Dataset ${Date.now()}`, 'For search query tests')
  datasetId = dataset.id

  // Upload and parse a sample document for retrieval
  const testDataDir = path.resolve(__dirname, '..', 'test-data')
  const docs = await api.uploadDocument(datasetId, path.join(testDataDir, 'sample.pdf'))

  if (docs.length > 0) {
    await api.triggerParse(datasetId, docs.map((d) => d.id))
    // Wait for parsing to complete
    const docId = docs[0]!.id
    const maxWait = 120_000
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      const doc = await api.getDocument(datasetId, docId)
      if (doc && doc.progress >= 1) break
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  // Create a search app linked to the dataset
  const searchApp = await api.createSearchApp(
    `E2E Search App ${Date.now()}`,
    [datasetId]
  )
  searchAppId = searchApp.id
})

test.afterAll(async () => {
  // Clean up test resources
  try {
    if (searchAppId) await api.deleteSearchApp(searchAppId)
  } catch { /* ignore cleanup errors */ }
  try {
    if (datasetId) await api.deleteDataset(datasetId)
  } catch { /* ignore cleanup errors */ }
})

// ============================================================================
// Search Query Tests
// ============================================================================

test('Perform search and get results @smoke', async ({ page }) => {
  // Navigate to search page
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')

  // Select the test search app if a selector is visible
  const appSelector = page.getByRole('combobox').or(page.locator('[data-testid="search-app-select"]'))
  if (await appSelector.isVisible()) {
    await appSelector.click()
    // Select the test search app from the dropdown
    const option = page.getByText(new RegExp('E2E Search App', 'i'))
    if (await option.isVisible()) {
      await option.click()
    }
  }

  // Enter a search query related to the sample document
  const searchInput = page.getByPlaceholder(/search|query|ask/i).or(page.locator('input[type="search"], input[type="text"]').first())
  await searchInput.fill('What is the document about?')
  await searchInput.press('Enter')

  // Wait for results to appear
  await page.waitForTimeout(5000)

  // Assert: at least one result should be visible
  const resultCards = page.locator('[class*="result"], [data-testid="search-result"]').or(
    page.locator('button').filter({ has: page.locator('h4') })
  )
  const count = await resultCards.count()
  expect(count).toBeGreaterThan(0)
})

test('Search results show source document @smoke', async ({ page }) => {
  // Navigate to search page
  await page.goto(SEARCH_URL)
  await page.waitForLoadState('networkidle')

  // Select test search app
  const appSelector = page.getByRole('combobox').or(page.locator('[data-testid="search-app-select"]'))
  if (await appSelector.isVisible()) {
    await appSelector.click()
    const option = page.getByText(new RegExp('E2E Search App', 'i'))
    if (await option.isVisible()) {
      await option.click()
    }
  }

  // Perform search
  const searchInput = page.getByPlaceholder(/search|query|ask/i).or(page.locator('input[type="search"], input[type="text"]').first())
  await searchInput.fill('document content')
  await searchInput.press('Enter')

  // Wait for results
  await page.waitForTimeout(5000)

  // Assert: results should show the source document name (sample.pdf)
  const pageContent = await page.textContent('body')
  expect(pageContent).toContain('sample.pdf')
})
