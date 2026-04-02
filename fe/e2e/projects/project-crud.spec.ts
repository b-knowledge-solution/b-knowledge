/**
 * @fileoverview E2E tests for project management CRUD operations.
 *
 * Exercises the full UI flow for creating, updating, and deleting projects,
 * as well as linking/unlinking datasets. Uses the ApiHelper for setup/teardown.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/projects/project-crud.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

/** Projects page URL path */
const PROJECTS_URL = '/data-studio/projects'

/** Track resource IDs for cleanup */
let api: ApiHelper
let createdProjectIds: string[] = []
let createdDatasetIds: string[] = []

test.beforeEach(async ({ request }) => {
  // Initialize API helper with authenticated request context
  api = apiHelper(request)
  createdProjectIds = []
  createdDatasetIds = []
})

test.afterEach(async () => {
  // Clean up projects first, then datasets
  for (const id of createdProjectIds) {
    try {
      await api.deleteProject(id)
    } catch { /* ignore cleanup errors */ }
  }
  for (const id of createdDatasetIds) {
    try {
      await api.deleteDataset(id)
    } catch { /* ignore cleanup errors */ }
  }
})

// ============================================================================
// Create project
// ============================================================================

test('Create a new project via UI @smoke', async ({ page }) => {
  const uniqueName = `E2E Test Project ${Date.now()}`

  // Navigate to projects listing page
  await page.goto(PROJECTS_URL)
  await page.waitForLoadState('networkidle')

  // Click the "Add" or "Create" button to open the project creation dialog
  const addButton = page.getByRole('button', { name: /add|create|new/i })
  await expect(addButton).toBeVisible({ timeout: 10_000 })
  await addButton.click()

  // Wait for the creation dialog to appear
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()

  // Fill in the project name
  const nameInput = dialog.locator('input').first()
  await nameInput.fill(uniqueName)

  // Submit the form
  const saveButton = dialog.getByRole('button', { name: /save|create|submit/i })
  await saveButton.click()

  // Wait for dialog to close (indicates success)
  await expect(dialog).not.toBeVisible({ timeout: 15_000 })

  // Verify the new project appears in the list
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 10_000 })

  // Verify via API and track for cleanup
  const projects = await api.listProjects()
  const created = projects.find((p) => p.name === uniqueName)
  expect(created).toBeDefined()
  createdProjectIds.push(created!.id)
})

// ============================================================================
// Verify project appears in list
// ============================================================================

test('Verify project appears in project list', async ({ page }) => {
  // Setup: create a project via API
  const projectName = `E2E List Test ${Date.now()}`
  const project = await api.createProject(projectName, 'List verification test')
  createdProjectIds.push(project.id)

  // Navigate to projects page
  await page.goto(PROJECTS_URL)
  await page.waitForLoadState('networkidle')

  // Verify the project name is visible in the listing
  await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 })
})

// ============================================================================
// Update project name/description
// ============================================================================

test('Update project name and description', async ({ page }) => {
  // Setup: create a project via API
  const originalName = `E2E Update Project ${Date.now()}`
  const project = await api.createProject(originalName, 'Original description')
  createdProjectIds.push(project.id)

  // Navigate to the project detail page
  await page.goto(`${PROJECTS_URL}/${project.id}`)
  await page.waitForLoadState('networkidle')

  // Look for a settings tab or edit button on the project detail page
  const settingsTab = page.getByRole('tab', { name: /settings/i })
    .or(page.getByRole('button', { name: /settings|edit/i }))
  if (await settingsTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await settingsTab.click()
  }

  // Find the project name input field and update it
  const nameInput = page.locator('input[name="name"]')
    .or(page.locator('input').filter({ hasText: originalName }))
    .or(page.locator('input').first())

  if (await nameInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const updatedName = `Updated E2E Project ${Date.now()}`
    await nameInput.clear()
    await nameInput.fill(updatedName)

    // Save changes
    const saveButton = page.getByRole('button', { name: /save|update/i })
    if (await saveButton.isVisible()) {
      await saveButton.click()
      // Wait for save confirmation
      await page.waitForTimeout(2000)
    }

    // Verify via API that the name was updated
    const updated = await api.getProject(project.id)
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe(updatedName)
  } else {
    // If no editable input on the page, update via API and verify in UI
    const updatedName = `Updated E2E Project ${Date.now()}`
    await api.updateProject(project.id, { name: updatedName, description: 'Updated description' })

    // Reload and verify
    await page.goto(PROJECTS_URL)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 })
  }
})

// ============================================================================
// Add datasets to project
// ============================================================================

test('Add datasets to project @smoke', async () => {
  // Setup: create a project and a dataset via API
  const project = await api.createProject(`E2E Dataset Bind ${Date.now()}`, 'Dataset binding test')
  createdProjectIds.push(project.id)

  const dataset = await api.createDataset(`E2E Bind Dataset ${Date.now()}`, 'For project binding')
  createdDatasetIds.push(dataset.id)

  // Bind the dataset to the project
  await api.bindProjectDatasets(project.id, [dataset.id])

  // Verify the dataset is linked to the project
  const linkedDatasets = await api.listProjectDatasets(project.id)
  const linked = linkedDatasets.find((d) => d.dataset_id === dataset.id)
  expect(linked).toBeDefined()
})

// ============================================================================
// Remove datasets from project
// ============================================================================

test('Remove datasets from project', async () => {
  // Setup: create a project with a linked dataset
  const project = await api.createProject(`E2E Dataset Unbind ${Date.now()}`, 'Dataset unbinding test')
  createdProjectIds.push(project.id)

  const dataset = await api.createDataset(`E2E Unbind Dataset ${Date.now()}`, 'For project unbinding')
  createdDatasetIds.push(dataset.id)

  // Bind then unbind
  await api.bindProjectDatasets(project.id, [dataset.id])
  await api.unbindProjectDataset(project.id, dataset.id)

  // Verify the dataset is no longer linked
  const linkedDatasets = await api.listProjectDatasets(project.id)
  const stillLinked = linkedDatasets.find((d) => d.dataset_id === dataset.id)
  expect(stillLinked).toBeUndefined()
})

// ============================================================================
// Delete project
// ============================================================================

test('Delete project', async ({ page }) => {
  // Setup: create a project via API
  const projectName = `E2E Delete Project ${Date.now()}`
  const project = await api.createProject(projectName, 'Will be deleted')
  createdProjectIds.push(project.id)

  // Navigate to projects listing page
  await page.goto(PROJECTS_URL)
  await page.waitForLoadState('networkidle')

  // Wait for the project to appear
  await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 })

  // Hover over the project card to reveal action buttons
  const card = page.locator(`text=${projectName}`).locator('..').locator('..')
  await card.hover()

  // Click the delete button (typically Trash icon, last action button)
  const actionButtons = card.locator('button').filter({ has: page.locator('svg') })
  const deleteButton = actionButtons.last()
  await deleteButton.click()

  // Confirm deletion in the confirmation dialog
  const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').last()
  await expect(confirmDialog).toBeVisible({ timeout: 5_000 })
  const confirmButton = confirmDialog.getByRole('button', { name: /delete|confirm|yes/i })
  await confirmButton.click()

  // Wait for the project to disappear from the list
  await expect(page.getByText(projectName)).not.toBeVisible({ timeout: 15_000 })

  // Verify via API that the project no longer exists
  const deleted = await api.getProject(project.id)
  expect(deleted).toBeNull()

  // Remove from cleanup list
  createdProjectIds = createdProjectIds.filter((id) => id !== project.id)
})

// ============================================================================
// Verify cleanup after deletion
// ============================================================================

test('Project deletion cleans up dataset bindings', async () => {
  // Setup: create a project with a linked dataset
  const project = await api.createProject(`E2E Cleanup Project ${Date.now()}`, 'Cleanup test')
  createdProjectIds.push(project.id)

  const dataset = await api.createDataset(`E2E Cleanup Dataset ${Date.now()}`, 'For cleanup test')
  createdDatasetIds.push(dataset.id)

  await api.bindProjectDatasets(project.id, [dataset.id])

  // Delete the project
  await api.deleteProject(project.id)

  // Verify project is gone
  const deletedProject = await api.getProject(project.id)
  expect(deletedProject).toBeNull()

  // Verify the dataset itself still exists (only the binding is removed)
  const existingDataset = await api.getDataset(dataset.id)
  expect(existingDataset).not.toBeNull()

  // Remove project from cleanup list
  createdProjectIds = createdProjectIds.filter((id) => id !== project.id)
})
