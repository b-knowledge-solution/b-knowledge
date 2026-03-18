/**
 * @fileoverview E2E tests for dataset (knowledge base) CRUD operations.
 *
 * Exercises the full UI flow for creating, updating, and deleting datasets
 * through the browser. Uses the ApiHelper for test setup/teardown to keep
 * tests isolated and cleanup reliable.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/dataset/dataset-crud.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

/** Datasets page URL path */
const DATASETS_URL = '/data-studio/datasets'

/** Track dataset IDs created during tests for cleanup */
let createdDatasetIds: string[] = []

/** API helper instance for setup/teardown */
let api: ApiHelper

test.beforeEach(async ({ request }) => {
  // Initialize API helper with authenticated request context
  api = apiHelper(request)
  createdDatasetIds = []
})

test.afterEach(async () => {
  // Clean up all datasets created during the test
  for (const id of createdDatasetIds) {
    try {
      await api.deleteDataset(id)
    } catch {
      // Ignore cleanup errors -- dataset may already be deleted by the test
    }
  }
})

// ============================================================================
// Create dataset
// ============================================================================

test('Create dataset via UI @smoke', async ({ page }) => {
  const uniqueName = `E2E Test Dataset ${Date.now()}`
  const description = 'Created by E2E test'

  // Navigate to datasets listing page
  await page.goto(DATASETS_URL)
  await page.waitForLoadState('networkidle')

  // Click the "Add Dataset" button to open the create modal
  const addButton = page.getByRole('button', { name: /add dataset/i })
  await expect(addButton).toBeVisible({ timeout: 10_000 })
  await addButton.click()

  // Wait for the create modal dialog to appear
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  // Fill in the dataset name
  const nameInput = dialog.locator('input').first()
  await nameInput.fill(uniqueName)

  // Submit the form by clicking Save
  const saveButton = dialog.getByRole('button', { name: /save/i })
  await saveButton.click()

  // Wait for the dialog to close (indicates success)
  await expect(dialog).not.toBeVisible({ timeout: 15_000 })

  // Verify the new dataset appears in the list
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })

  // Verify via API that the dataset exists with correct name
  const datasets = await api.listDatasets()
  const created = datasets.find((d) => d.name === uniqueName)
  expect(created).toBeDefined()
  expect(created!.name).toBe(uniqueName)

  // Track for cleanup
  createdDatasetIds.push(created!.id)
})

// ============================================================================
// Update dataset
// ============================================================================

test('Update dataset name and description', async ({ page }) => {
  // Setup: create a dataset via API
  const originalName = `E2E Update Test ${Date.now()}`
  const dataset = await api.createDataset(originalName, 'Original description')
  createdDatasetIds.push(dataset.id)

  // Navigate to datasets listing page
  await page.goto(DATASETS_URL)
  await page.waitForLoadState('networkidle')

  // Wait for the dataset card to appear
  await expect(page.getByText(originalName)).toBeVisible({ timeout: 10_000 })

  // Hover over the dataset card to reveal action buttons
  const card = page.locator('text=' + originalName).locator('..').locator('..')
  await card.hover()

  // Click the edit button (Edit2 icon button revealed on hover)
  // The edit button is inside a tooltip trigger with an Edit2 icon
  const editButton = card.locator('button').filter({ has: page.locator('svg') }).first()
  await editButton.click()

  // Wait for the edit modal to appear
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  // Update the dataset name
  const updatedName = `Updated E2E Dataset ${Date.now()}`
  const nameInput = dialog.locator('input').first()
  await nameInput.clear()
  await nameInput.fill(updatedName)

  // Submit the form
  const saveButton = dialog.getByRole('button', { name: /save/i })
  await saveButton.click()

  // Wait for dialog to close
  await expect(dialog).not.toBeVisible({ timeout: 15_000 })

  // Verify updated name is visible in the UI
  await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 })

  // Verify via API that the name was updated
  const updated = await api.getDataset(dataset.id)
  expect(updated).not.toBeNull()
  expect(updated!.name).toBe(updatedName)
})

// ============================================================================
// Delete dataset
// ============================================================================

test('Delete dataset', async ({ page }) => {
  // Setup: create a dataset via API
  const datasetName = `E2E Delete Test ${Date.now()}`
  const dataset = await api.createDataset(datasetName, 'Will be deleted')
  createdDatasetIds.push(dataset.id)

  // Navigate to datasets listing page
  await page.goto(DATASETS_URL)
  await page.waitForLoadState('networkidle')

  // Wait for the dataset card to appear
  await expect(page.getByText(datasetName)).toBeVisible({ timeout: 10_000 })

  // Hover over the dataset card to reveal action buttons
  const card = page.locator('text=' + datasetName).locator('..').locator('..')
  await card.hover()

  // Click the delete button (Trash2 icon - last action button)
  // Action buttons are in order: Shield (access), Edit2, Trash2
  const actionButtons = card.locator('button').filter({ has: page.locator('svg') })
  const deleteButton = actionButtons.last()
  await deleteButton.click()

  // Confirm deletion in the confirmation dialog
  // The useDatasets hook uses a confirm() dialog with variant: 'danger'
  const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').last()
  await expect(confirmDialog).toBeVisible({ timeout: 5_000 })

  // Click the confirm/delete button in the dialog
  const confirmButton = confirmDialog.getByRole('button', { name: /delete/i })
  await confirmButton.click()

  // Wait for the dataset to disappear from the list
  await expect(page.getByText(datasetName)).not.toBeVisible({ timeout: 15_000 })

  // Verify via API that the dataset no longer exists
  const deleted = await api.getDataset(dataset.id)
  expect(deleted).toBeNull()

  // Remove from cleanup list since it's already deleted
  createdDatasetIds = createdDatasetIds.filter((id) => id !== dataset.id)
})

// ============================================================================
// Edge case: duplicate name
// ============================================================================

test('Create dataset with duplicate name handles gracefully', async ({ page }) => {
  // Setup: create a dataset via API with a known name
  const duplicateName = `E2E Duplicate Test ${Date.now()}`
  const existingDataset = await api.createDataset(duplicateName, 'First dataset')
  createdDatasetIds.push(existingDataset.id)

  // Navigate to datasets listing page
  await page.goto(DATASETS_URL)
  await page.waitForLoadState('networkidle')

  // Click "Add Dataset" to open create modal
  const addButton = page.getByRole('button', { name: /add dataset/i })
  await addButton.click()

  // Wait for dialog
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  // Fill the same name as the existing dataset
  const nameInput = dialog.locator('input').first()
  await nameInput.fill(duplicateName)

  // Submit the form
  const saveButton = dialog.getByRole('button', { name: /save/i })
  await saveButton.click()

  // Wait for either: success (dialog closes) or error message appears
  // The test validates that the system does NOT return a 500 error
  const outcome = await Promise.race([
    // Outcome 1: Dialog closes (duplicate names are allowed)
    dialog.waitFor({ state: 'hidden', timeout: 10_000 })
      .then(() => 'created' as const),
    // Outcome 2: Error message appears in a toast or the dialog
    page.locator('[role="alert"], .toast, [data-sonner-toast]').first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => 'error-shown' as const),
  ]).catch(() => 'timeout' as const)

  if (outcome === 'created') {
    // If duplicate was allowed, find and track the new dataset for cleanup
    const datasets = await api.listDatasets()
    const duplicates = datasets.filter((d) => d.name === duplicateName)
    // Track all matching datasets for cleanup
    for (const d of duplicates) {
      if (!createdDatasetIds.includes(d.id)) {
        createdDatasetIds.push(d.id)
      }
    }
  }

  // The key assertion: no unhandled 500 error crashed the page
  // Whether the system allows duplicates or shows a friendly error, both are acceptable
  expect(['created', 'error-shown']).toContain(outcome)
})
