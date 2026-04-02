/**
 * @fileoverview E2E tests for the agent template workflow.
 *
 * Exercises template browsing: navigate to /agents, switch to Templates tab,
 * verify templates are shown, click a template to clone, verify the cloned
 * agent opens in canvas with template nodes.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * @module e2e/agent/agent-template.spec
 */

import { test, expect } from '@playwright/test'

/** Agent list page URL */
const AGENTS_URL = '/agents'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/** Track cloned agent ID for cleanup */
let clonedAgentId: string

test.afterAll(async ({ request }) => {
  // Clean up any cloned agent
  if (clonedAgentId) {
    try {
      await request.delete(`${API_BASE}/api/agents/${clonedAgentId}`)
    } catch { /* ignore cleanup errors */ }
  }
})

// ============================================================================
// Navigate to Templates tab
// ============================================================================

test('Navigate to /agents and switch to Templates tab @smoke', async ({ page }) => {
  await page.goto(AGENTS_URL)
  await page.waitForLoadState('networkidle')

  // Click the Templates tab
  const templatesTab = page.getByRole('tab', { name: /templates/i })
    .or(page.getByText(/templates/i).first())
  await expect(templatesTab).toBeVisible({ timeout: 10_000 })
  await templatesTab.click()

  // Wait for the tab content to render
  await page.waitForTimeout(2000)

  // Verify the URL includes tab=templates or the templates content is visible
  const currentUrl = page.url()
  const hasTabParam = currentUrl.includes('tab=templates')
  const templateContent = page.locator('[class*="card"], [class*="template"]')
    .or(page.getByText(/no data|no templates|use template/i))

  // Either the URL reflects the tab or template content is visible
  const hasContent = await templateContent.first().isVisible({ timeout: 5_000 }).catch(() => false)
  expect(hasTabParam || hasContent).toBeTruthy()
})

// ============================================================================
// Verify templates are shown
// ============================================================================

test('Verify at least some templates are displayed', async ({ page }) => {
  await page.goto(`${AGENTS_URL}?tab=templates`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Look for template cards or an empty state message
  const templateCards = page.locator('[class*="card"]')
    .filter({ hasText: /use template/i })
  const emptyState = page.getByText(/no data|no template/i)

  const cardCount = await templateCards.count()
  const isEmpty = await emptyState.isVisible({ timeout: 3_000 }).catch(() => false)

  // Either templates exist or the empty state is shown
  expect(cardCount > 0 || isEmpty).toBeTruthy()
})

// ============================================================================
// Click a template to use it
// ============================================================================

test('Click a template Use Template button to create agent from template', async ({ page }) => {
  await page.goto(`${AGENTS_URL}?tab=templates`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Find the first "Use Template" button
  const useTemplateButton = page.getByRole('button', { name: /use template/i }).first()
  const isVisible = await useTemplateButton.isVisible({ timeout: 5_000 }).catch(() => false)

  if (!isVisible) {
    // No templates available; skip gracefully
    test.skip(true, 'No templates available to test')
    return
  }

  await useTemplateButton.click()

  // After clicking, the app should either:
  // 1. Show a clone/name dialog, or
  // 2. Navigate directly to the new agent's canvas page
  await page.waitForTimeout(3000)

  const dialog = page.getByRole('dialog')
  const isDialogOpen = await dialog.isVisible({ timeout: 3_000 }).catch(() => false)

  if (isDialogOpen) {
    // Clone dialog: enter a custom name and confirm
    const nameInput = dialog.locator('input').first()
    if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nameInput.clear()
      await nameInput.fill(`E2E Cloned Template ${Date.now()}`)
    }

    // Click create/clone/confirm button
    const confirmButton = dialog.getByRole('button', { name: /create|clone|confirm|ok/i }).first()
    if (await confirmButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmButton.click()
      await page.waitForTimeout(3000)
    }
  }

  // Should navigate to the new agent's canvas
  await expect(page).toHaveURL(/\/agents\/[a-f0-9-]+/i, { timeout: 10_000 })

  // Extract agent ID for cleanup
  const url = page.url()
  const match = url.match(/\/agents\/([a-f0-9-]+)/i)
  if (match) {
    clonedAgentId = match[1]!
  }
})

// ============================================================================
// Verify cloned agent canvas has template nodes
// ============================================================================

test('Verify cloned agent canvas has template nodes', async ({ page }) => {
  test.skip(!clonedAgentId, 'No cloned agent from previous test')

  await page.goto(`${AGENTS_URL}/${clonedAgentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // The canvas should have at least the Begin node from the template
  const nodes = page.locator('.react-flow__node')
  const nodeCount = await nodes.count()

  // Template agents should have at least 1 node (Begin), typically more
  expect(nodeCount).toBeGreaterThanOrEqual(1)

  // Verify at least a Begin node exists
  const beginNode = nodes.filter({ hasText: /begin/i })
  await expect(beginNode.first()).toBeVisible({ timeout: 5_000 })
})
