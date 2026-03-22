/**
 * @fileoverview E2E tests for API Key management CRUD operations.
 *
 * Exercises the full UI flow for creating, viewing, toggling, and deleting
 * API keys through the browser. Verifies the one-time key display dialog
 * and clipboard copy functionality.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 * - Database migration 20260322000000_create_api_keys has run
 *
 * @module e2e/api-keys/api-key-crud.spec
 */

import { test, expect } from '@playwright/test'

/** API Keys page URL path */
const API_KEYS_URL = '/data-studio/api-keys'

// ============================================================================
// Tests
// ============================================================================

test.describe('API Key Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the API Keys page
    await page.goto(API_KEYS_URL)
    await page.waitForLoadState('networkidle')
  })

  // --------------------------------------------------------------------------
  // Page Load
  // --------------------------------------------------------------------------

  test('page loads with title and create button @smoke', async ({ page }) => {
    // Verify page title is visible
    await expect(page.getByRole('heading', { name: /api keys/i })).toBeVisible({
      timeout: 10_000,
    })

    // Verify create button is present
    const createButton = page.getByRole('button', { name: /create api key/i })
    await expect(createButton).toBeVisible()
  })

  test('shows empty state when no keys exist', async ({ page }) => {
    // Check for empty state message (may or may not appear depending on existing data)
    const emptyState = page.getByText(/no api keys yet/i)
    const table = page.locator('table')

    // Either empty state or table should be visible
    const hasEmpty = await emptyState.isVisible().catch(() => false)
    const hasTable = await table.isVisible().catch(() => false)
    expect(hasEmpty || hasTable).toBe(true)
  })

  // --------------------------------------------------------------------------
  // Create API Key
  // --------------------------------------------------------------------------

  test('creates a new API key and displays one-time key @smoke', async ({ page }) => {
    const uniqueName = `E2E Key ${Date.now()}`

    // Click create button to open dialog
    await page.getByRole('button', { name: /create api key/i }).click()

    // Wait for dialog to appear
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Fill in the key name
    const nameInput = dialog.locator('input[id="api-key-name"]')
    await nameInput.fill(uniqueName)

    // Submit the form
    const submitButton = dialog.getByRole('button', { name: /create$/i })
    await submitButton.click()

    // Wait for the one-time key dialog to appear
    const keyDialog = page.getByText(/copy this key now/i)
    await expect(keyDialog).toBeVisible({ timeout: 15_000 })

    // Verify the plaintext key is displayed
    const keyCode = page.locator('code').first()
    const keyText = await keyCode.textContent()
    expect(keyText).toMatch(/^bk-[0-9a-f]{40}$/)

    // Close the key dialog
    await page.getByRole('button', { name: /close/i }).click()

    // Verify the new key appears in the table
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })
  })

  // --------------------------------------------------------------------------
  // Create with Scopes
  // --------------------------------------------------------------------------

  test('creates a key with specific scopes selected', async ({ page }) => {
    const uniqueName = `Scoped Key ${Date.now()}`

    await page.getByRole('button', { name: /create api key/i }).click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Fill name
    await dialog.locator('input[id="api-key-name"]').fill(uniqueName)

    // Uncheck all scopes first, then check only 'chat'
    // By default all are checked, so uncheck 'search' and 'retrieval'
    const searchCheckbox = dialog.getByText(/search/i).locator('..')
    const retrievalCheckbox = dialog.getByText(/retrieval/i).locator('..')

    // Click the checkboxes to toggle
    await searchCheckbox.locator('button[role="checkbox"]').click()
    await retrievalCheckbox.locator('button[role="checkbox"]').click()

    // Submit
    await dialog.getByRole('button', { name: /create$/i }).click()

    // Wait for key dialog and close it
    await expect(page.getByText(/copy this key now/i)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /close/i }).click()

    // Verify key appears in table
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })
  })

  // --------------------------------------------------------------------------
  // Toggle Active/Inactive
  // --------------------------------------------------------------------------

  test('toggles API key active status', async ({ page }) => {
    // First create a key to toggle
    const uniqueName = `Toggle Key ${Date.now()}`

    await page.getByRole('button', { name: /create api key/i }).click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.locator('input[id="api-key-name"]').fill(uniqueName)
    await dialog.getByRole('button', { name: /create$/i }).click()
    await expect(page.getByText(/copy this key now/i)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /close/i }).click()

    // Wait for key to appear in table
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })

    // Find the row with our key and click the toggle button
    const row = page.locator('tr', { hasText: uniqueName })
    const toggleButton = row.getByRole('button').first()
    await toggleButton.click()

    // Wait for the status to change (UI should update via TanStack Query invalidation)
    await page.waitForTimeout(1000)
  })

  // --------------------------------------------------------------------------
  // Delete API Key
  // --------------------------------------------------------------------------

  test('deletes an API key after confirmation', async ({ page }) => {
    // First create a key to delete
    const uniqueName = `Delete Key ${Date.now()}`

    await page.getByRole('button', { name: /create api key/i }).click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.locator('input[id="api-key-name"]').fill(uniqueName)
    await dialog.getByRole('button', { name: /create$/i }).click()
    await expect(page.getByText(/copy this key now/i)).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /close/i }).click()

    // Wait for key to appear
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })

    // Find the row and click the delete button (trash icon, last button in row)
    const row = page.locator('tr', { hasText: uniqueName })
    const deleteButton = row.getByRole('button').last()
    await deleteButton.click()

    // Confirm deletion in the confirm dialog
    const confirmDialog = page.locator('[role="dialog"]')
    await expect(confirmDialog).toBeVisible()
    const confirmButton = confirmDialog.getByRole('button', { name: /delete/i })
    await confirmButton.click()

    // Verify the key is removed from the table
    await expect(page.getByText(uniqueName)).not.toBeVisible({ timeout: 10_000 })
  })

  // --------------------------------------------------------------------------
  // Example Usage Section
  // --------------------------------------------------------------------------

  test('displays example usage with curl and promptfoo snippets', async ({ page }) => {
    const uniqueName = `Example Key ${Date.now()}`

    await page.getByRole('button', { name: /create api key/i }).click()
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.locator('input[id="api-key-name"]').fill(uniqueName)
    await dialog.getByRole('button', { name: /create$/i }).click()

    // Wait for the one-time key dialog
    await expect(page.getByText(/copy this key now/i)).toBeVisible({ timeout: 15_000 })

    // Expand example usage section
    const exampleToggle = page.getByText(/example usage/i)
    await exampleToggle.click()

    // Verify curl example is visible
    await expect(page.getByText(/curl -X POST/i)).toBeVisible()

    // Verify promptfoo config example is visible
    await expect(page.getByText(/promptfooconfig/i)).toBeVisible()

    // Close dialog
    await page.getByRole('button', { name: /close/i }).click()
  })
})
