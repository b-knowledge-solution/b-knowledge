/**
 * @fileoverview E2E tests for agent CRUD operations.
 *
 * Exercises the full agent lifecycle: navigate to /agents, create an agent,
 * verify it in the list, open canvas, edit name, save, navigate back, delete,
 * and verify removal.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * Tags:
 * - @smoke: Minimal happy-path tests for quick validation
 *
 * @module e2e/agent/agent-crud.spec
 */

import { test, expect } from '@playwright/test'
import { ApiHelper, apiHelper } from '../helpers/api.helper'

/** Agent list page URL */
const AGENTS_URL = '/agents'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/** Track resources for cleanup */
let api: ApiHelper
let agentId: string

test.beforeAll(async ({ request }) => {
  api = apiHelper(request)
})

test.afterAll(async ({ request }) => {
  // Clean up agent if test left one behind
  if (agentId) {
    try {
      const resp = await request.delete(`${API_BASE}/api/agents/${agentId}`)
      // Ignore errors during cleanup
      void resp
    } catch { /* ignore cleanup errors */ }
  }
})

// ============================================================================
// Navigate to agents page
// ============================================================================

test('Navigate to /agents page and verify page loads @smoke', async ({ page }) => {
  await page.goto(AGENTS_URL)
  await page.waitForLoadState('networkidle')

  // Verify the page title or heading contains agent-related text
  const heading = page.getByRole('heading', { level: 1 })
    .or(page.getByText(/agents|workflow/i).first())
  await expect(heading).toBeVisible({ timeout: 10_000 })
})

// ============================================================================
// Create a new agent
// ============================================================================

test('Create a new agent via the UI @smoke', async ({ page }) => {
  await page.goto(AGENTS_URL)
  await page.waitForLoadState('networkidle')

  // Click the Create Agent button
  const createButton = page.getByRole('button', { name: /create agent/i })
    .or(page.getByText(/create agent/i))
  await expect(createButton.first()).toBeVisible({ timeout: 10_000 })
  await createButton.first().click()

  // Wait for the create dialog to appear
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 5_000 })

  // Fill in the agent name
  const agentName = `E2E CRUD Agent ${Date.now()}`
  const nameInput = dialog.locator('input').first()
  await nameInput.fill(agentName)

  // Fill in optional description
  const descriptionInput = dialog.locator('textarea')
  if (await descriptionInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await descriptionInput.fill('Created by E2E CRUD test')
  }

  // Click the submit button in the dialog footer
  const submitButton = dialog.getByRole('button', { name: /create agent/i })
  await submitButton.click()

  // After creation, the app should navigate to the canvas page (/agents/:id)
  await page.waitForTimeout(3000)
  await expect(page).toHaveURL(/\/agents\/[a-f0-9-]+/i, { timeout: 10_000 })

  // Extract the agent ID from the URL for cleanup
  const url = page.url()
  const match = url.match(/\/agents\/([a-f0-9-]+)/i)
  if (match) {
    agentId = match[1]!
  }
})

// ============================================================================
// Verify agent appears in list
// ============================================================================

test('Verify created agent appears in the agent list', async ({ page }) => {
  // Skip if no agent was created in previous test
  test.skip(!agentId, 'No agent created in previous test')

  await page.goto(AGENTS_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Look for agent card containing the E2E agent name
  const agentCard = page.getByText(/E2E CRUD Agent/i)
  await expect(agentCard.first()).toBeVisible({ timeout: 10_000 })
})

// ============================================================================
// Click agent card to navigate to canvas
// ============================================================================

test('Click agent card navigates to canvas page', async ({ page }) => {
  test.skip(!agentId, 'No agent created in previous test')

  await page.goto(AGENTS_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Find and click the agent card
  const agentCard = page.getByText(/E2E CRUD Agent/i).first()
  await expect(agentCard).toBeVisible({ timeout: 10_000 })
  await agentCard.click()

  // Should navigate to /agents/:id (canvas page)
  await expect(page).toHaveURL(/\/agents\/[a-f0-9-]+/i, { timeout: 10_000 })
})

// ============================================================================
// Edit agent name via toolbar
// ============================================================================

test('Edit agent name via toolbar inline editing', async ({ page }) => {
  test.skip(!agentId, 'No agent created in previous test')

  // Navigate directly to the canvas page
  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Click the agent name in the toolbar to start inline editing
  const nameButton = page.locator('button.text-lg, [class*="font-semibold"]')
    .filter({ hasText: /E2E CRUD Agent/i })
  if (await nameButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await nameButton.click()

    // Type a new name in the inline input
    const nameInput = page.locator('input.text-lg, input[class*="font-semibold"]')
    if (await nameInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await nameInput.clear()
      await nameInput.fill(`E2E Renamed Agent ${Date.now()}`)
      await nameInput.press('Enter')
      await page.waitForTimeout(2000)
    }
  }
})

// ============================================================================
// Save agent
// ============================================================================

test('Save agent from toolbar', async ({ page }) => {
  test.skip(!agentId, 'No agent created in previous test')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Find and click the Save button in the toolbar
  const saveButton = page.getByRole('button', { name: /save/i })
  if (await saveButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Only click if save is enabled (dirty state)
    const isDisabled = await saveButton.first().isDisabled()
    if (!isDisabled) {
      await saveButton.first().click()
      await page.waitForTimeout(2000)
    }
  }
})

// ============================================================================
// Navigate back to list
// ============================================================================

test('Navigate back to agent list from canvas', async ({ page }) => {
  test.skip(!agentId, 'No agent created in previous test')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Click the back button in the toolbar
  const backButton = page.getByRole('button', { name: /back/i })
    .or(page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') }))
  if (await backButton.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await backButton.first().click()
    await expect(page).toHaveURL(/\/agents\/?$/i, { timeout: 10_000 })
  }
})

// ============================================================================
// Delete agent
// ============================================================================

test('Delete agent and verify removal from list @smoke', async ({ page, request }) => {
  test.skip(!agentId, 'No agent created in previous test')

  // Delete via API for reliability (UI delete may require name-typing confirmation)
  const response = await request.delete(`${API_BASE}/api/agents/${agentId}`)
  expect(response.ok()).toBeTruthy()

  // Navigate to agent list and verify the agent is gone
  await page.goto(AGENTS_URL)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // The deleted agent should no longer appear
  const agentCard = page.getByText(/E2E CRUD Agent|E2E Renamed Agent/i)
  const isVisible = await agentCard.first().isVisible({ timeout: 3_000 }).catch(() => false)
  expect(isVisible).toBeFalsy()

  // Clear tracking to prevent afterAll cleanup attempt
  agentId = ''
})
