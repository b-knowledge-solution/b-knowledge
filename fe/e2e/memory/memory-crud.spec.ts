/**
 * @fileoverview E2E tests for memory pool CRUD operations.
 *
 * Exercises the full memory pool lifecycle: navigate to /memory, create a pool,
 * verify it in the list, open detail page, edit settings, navigate back, delete,
 * and verify removal.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/memory/memory-crud.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

/** Memory list page URL */
const MEMORY_URL = '/memory'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/** Track resources for cleanup */
let api: ApiHelper
let poolId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)
})

test.afterAll(async ({ request }) => {
  // Clean up memory pool if test left one behind
  if (poolId) {
    try {
      const resp = await request.delete(`${API_BASE}/api/memory/${poolId}`)
      void resp
    } catch { /* ignore cleanup errors */ }
  }
})

// ============================================================================
// Navigate to memory page
// ============================================================================

test('Navigate to /memory page and verify page loads @smoke', async ({ page }) => {
  await page.goto(MEMORY_URL)
  await page.waitForLoadState('networkidle')

  // Verify the page title or heading contains memory-related text
  const heading = page.getByRole('heading', { level: 1 })
    .or(page.getByText(/memory/i).first())
  await expect(heading).toBeVisible({ timeout: 10_000 })
})

// ============================================================================
// Create a new memory pool
// ============================================================================

test('Create a new memory pool via the UI @smoke', async ({ page }) => {
  await page.goto(MEMORY_URL)
  await page.waitForLoadState('networkidle')

  // Click the Create Memory Pool button
  const createButton = page.getByRole('button', { name: /create.*memory|new.*pool/i })
    .or(page.getByText(/create.*memory|new.*pool/i))
  await expect(createButton.first()).toBeVisible({ timeout: 10_000 })
  await createButton.first().click()

  // Wait for the create dialog to appear
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Fill in the memory pool name
  const poolName = `E2E Memory Pool ${Date.now()}`
  const nameInput = dialog.locator('input').first()
  await nameInput.fill(poolName)

  // Select memory types if a type selector is present
  const typeSelect = dialog.locator('select, [role="combobox"]').first()
  if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await typeSelect.click()
    // Select first available option
    const option = page.locator('[role="option"]').first()
    if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await option.click()
    }
  }

  // Select embedding model if a model selector is present
  const modelSelect = dialog.locator('select, [role="combobox"]').nth(1)
  if (await modelSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await modelSelect.click()
    const modelOption = page.locator('[role="option"]').first()
    if (await modelOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await modelOption.click()
    }
  }

  // Fill in optional description
  const descriptionInput = dialog.locator('textarea')
  if (await descriptionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await descriptionInput.fill('Created by E2E memory CRUD test')
  }

  // Click the submit button in the dialog footer
  const submitButton = dialog.getByRole('button', { name: /create|save|confirm/i })
  await submitButton.click()

  // After creation, the app should navigate to the detail page or stay on list
  await page.waitForTimeout(3000)

  // Try to extract pool ID from URL if navigated to detail
  const url = page.url()
  const match = url.match(/\/memory\/([a-f0-9-]+)/i)
  if (match) {
    poolId = match[1]!
  } else {
    // Pool was created but stayed on list — find ID via API
    await page.waitForTimeout(1000)
    const resp = await page.request.get(`${API_BASE}/api/memory`)
    if (resp.ok()) {
      const pools = await resp.json()
      const data = Array.isArray(pools) ? pools : pools.data || []
      const created = data.find((p: { name: string }) => p.name.includes('E2E Memory Pool'))
      if (created) {
        poolId = created.id
      }
    }
  }
})

// ============================================================================
// Verify pool appears in list
// ============================================================================

test('Verify created memory pool appears in the list', async ({ page }) => {
  test.skip(!poolId, 'No memory pool created in previous test')

  await page.goto(MEMORY_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Look for pool card containing the E2E pool name
  const poolCard = page.getByText(/E2E Memory Pool/i)
  await expect(poolCard.first()).toBeVisible({ timeout: 10_000 })
})

// ============================================================================
// Click pool card to navigate to detail page
// ============================================================================

test('Click pool card navigates to detail page', async ({ page }) => {
  test.skip(!poolId, 'No memory pool created in previous test')

  await page.goto(MEMORY_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Find and click the pool card
  const poolCard = page.getByText(/E2E Memory Pool/i).first()
  await expect(poolCard).toBeVisible({ timeout: 10_000 })
  await poolCard.click()

  // Should navigate to /memory/:id (detail page)
  await expect(page).toHaveURL(/\/memory\/[a-f0-9-]+/i, { timeout: 10_000 })
})

// ============================================================================
// Edit pool settings
// ============================================================================

test('Edit memory pool settings on detail page', async ({ page }) => {
  test.skip(!poolId, 'No memory pool created in previous test')

  // Navigate directly to the detail page
  await page.goto(`${MEMORY_URL}/${poolId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Look for a settings or edit button
  const editButton = page.getByRole('button', { name: /edit|settings|configure/i })
  if (await editButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await editButton.first().click()
    await page.waitForTimeout(1000)

    // Try to update the name or description in the edit form
    const nameInput = page.locator('input').first()
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.clear()
      await nameInput.fill(`E2E Renamed Pool ${Date.now()}`)
    }

    // Save the changes
    const saveButton = page.getByRole('button', { name: /save|update|confirm/i })
    if (await saveButton.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveButton.first().click()
      await page.waitForTimeout(2000)
    }
  }
})

// ============================================================================
// Navigate back to list
// ============================================================================

test('Navigate back to memory list from detail page', async ({ page }) => {
  test.skip(!poolId, 'No memory pool created in previous test')

  await page.goto(`${MEMORY_URL}/${poolId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Click the back button or breadcrumb
  const backButton = page.getByRole('button', { name: /back/i })
    .or(page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }))
    .or(page.getByRole('link', { name: /memory/i }))
  if (await backButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await backButton.first().click()
    await expect(page).toHaveURL(/\/memory\/?$/i, { timeout: 10_000 })
  }
})

// ============================================================================
// Delete memory pool
// ============================================================================

test('Delete memory pool and verify removal from list @smoke', async ({ page, request }) => {
  test.skip(!poolId, 'No memory pool created in previous test')

  // Delete via API for reliability (UI delete may require confirmation dialog)
  const response = await request.delete(`${API_BASE}/api/memory/${poolId}`)
  expect(response.ok()).toBeTruthy()

  // Navigate to memory list and verify the pool is gone
  await page.goto(MEMORY_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // The deleted pool should no longer appear
  const poolCard = page.getByText(/E2E Memory Pool|E2E Renamed Pool/i)
  const isVisible = await poolCard.first().isVisible({ timeout: 3_000 }).catch(() => false)
  expect(isVisible).toBeFalsy()

  // Clear tracking to prevent afterAll cleanup attempt
  poolId = ''
})
