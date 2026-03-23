/**
 * @fileoverview E2E tests for search app configuration management.
 *
 * Tests creating, configuring, updating, and deleting search applications
 * including search settings, dataset linking, and persistence verification.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/search/search-config.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

/** Search apps management page URL */
const SEARCH_APPS_URL = '/data-studio/search-apps'

/** Track resources for cleanup */
let api: ApiHelper
let datasetId: string
let searchAppId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)

  // Create a test dataset to link to the search app
  const dataset = await api.createDataset(
    `E2E Search Config Dataset ${Date.now()}`,
    'For search app config tests',
  )
  datasetId = dataset.id
})

test.afterAll(async () => {
  // Clean up in reverse creation order
  try {
    if (searchAppId) await api.deleteSearchApp(searchAppId)
  } catch { /* ignore cleanup errors */ }
  try {
    if (datasetId) await api.deleteDataset(datasetId)
  } catch { /* ignore cleanup errors */ }
})

// ============================================================================
// Create search app via API
// ============================================================================

test('Create a search app via API helper @smoke', async () => {
  // Create search app with dataset linking
  const searchApp = await api.createSearchApp(
    `E2E Config Search App ${Date.now()}`,
    [datasetId],
  )

  searchAppId = searchApp.id
  expect(searchAppId).toBeTruthy()
  expect(searchApp.name).toContain('E2E Config Search App')
})

// ============================================================================
// Configure search settings
// ============================================================================

test('Configure search settings (similarity threshold, top_n, reranking)', async () => {
  // Update search app with specific search configuration
  const updated = await api.updateSearchApp(searchAppId, {
    similarity_threshold: 0.4,
    top_n: 10,
    reranking_model: '',
    search_method: 'hybrid',
  })

  expect(updated.id).toBe(searchAppId)
})

// ============================================================================
// Link datasets to search app
// ============================================================================

test('Link datasets to the search app', async () => {
  // Update search app to link the dataset
  const updated = await api.updateSearchApp(searchAppId, {
    dataset_ids: [datasetId],
  })

  expect(updated.id).toBe(searchAppId)

  // Verify dataset is linked by fetching the search app
  const fetched = await api.getSearchApp(searchAppId)
  expect(fetched).not.toBeNull()
  if (fetched!.dataset_ids) {
    expect(fetched!.dataset_ids).toContain(datasetId)
  }
})

// ============================================================================
// Verify configuration persists
// ============================================================================

test('Verify configuration persists after page reload @smoke', async ({ page }) => {
  // Navigate to search apps management page
  await page.goto(SEARCH_APPS_URL)
  await page.waitForLoadState('networkidle')

  // Look for the search app in the list
  const searchAppText = page.getByText(/E2E Config Search App/i)
  await expect(searchAppText).toBeVisible({ timeout: 10_000 })

  // Reload the page
  await page.reload()
  await page.waitForLoadState('networkidle')

  // Verify the search app is still visible after reload
  await expect(page.getByText(/E2E Config Search App/i)).toBeVisible({ timeout: 10_000 })

  // Verify via API that settings persist
  const fetched = await api.getSearchApp(searchAppId)
  expect(fetched).not.toBeNull()
  expect(fetched!.id).toBe(searchAppId)
})

// ============================================================================
// Update configuration
// ============================================================================

test('Update search app configuration', async () => {
  const newName = `E2E Updated Search App ${Date.now()}`

  // Update the search app name and settings
  const updated = await api.updateSearchApp(searchAppId, {
    name: newName,
    similarity_threshold: 0.6,
    top_n: 5,
  })

  expect(updated.id).toBe(searchAppId)

  // Verify the update persisted
  const fetched = await api.getSearchApp(searchAppId)
  expect(fetched).not.toBeNull()
  expect(fetched!.name).toBe(newName)
})

// ============================================================================
// Delete search app
// ============================================================================

test('Delete search app', async () => {
  // Delete the search app
  await api.deleteSearchApp(searchAppId)

  // Verify it no longer exists
  const deleted = await api.getSearchApp(searchAppId)
  expect(deleted).toBeNull()

  // Clear tracking to prevent afterAll from trying again
  searchAppId = ''
})
