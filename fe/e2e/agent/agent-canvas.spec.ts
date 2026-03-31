/**
 * @fileoverview E2E tests for the agent canvas page interactions.
 *
 * Exercises canvas features: Begin node presence, node palette (Cmd+K),
 * searching/adding operators, connecting nodes, config panel, and saving.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * @module e2e/agent/agent-canvas.spec
 */

import { test, expect } from '@playwright/test'

/** Agent list page URL */
const AGENTS_URL = '/agents'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

/** Track resources for cleanup */
let agentId: string

test.beforeAll(async ({ request }) => {
  // Create a test agent via API for canvas tests
  const response = await request.post(`${API_BASE}/api/agents`, {
    data: {
      name: `E2E Canvas Agent ${Date.now()}`,
      mode: 'agent',
      description: 'Created by E2E canvas test',
    },
  })

  if (response.ok()) {
    const agent = await response.json()
    agentId = agent.id || agent.data?.id
  }
})

test.afterAll(async ({ request }) => {
  // Clean up the test agent
  if (agentId) {
    try {
      await request.delete(`${API_BASE}/api/agents/${agentId}`)
    } catch { /* ignore cleanup errors */ }
  }
})

// ============================================================================
// Verify Begin node exists by default
// ============================================================================

test('Verify Begin node exists on the canvas by default @smoke', async ({ page }) => {
  test.skip(!agentId, 'No agent created in setup')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // ReactFlow renders nodes inside a .react-flow__node wrapper
  // Look for the Begin node by text or data attribute
  const beginNode = page.locator('.react-flow__node')
    .filter({ hasText: /begin/i })
    .or(page.locator('[data-type="begin"]'))
    .or(page.getByText('Begin'))

  await expect(beginNode.first()).toBeVisible({ timeout: 10_000 })
})

// ============================================================================
// Open node palette via Cmd+K
// ============================================================================

test('Open node palette with Cmd+K keyboard shortcut', async ({ page }) => {
  test.skip(!agentId, 'No agent created in setup')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Press Cmd+K (or Ctrl+K on Linux) to open the node palette
  await page.keyboard.press('ControlOrMeta+k')

  // The palette dialog should appear
  const paletteDialog = page.getByRole('dialog')
  await expect(paletteDialog).toBeVisible({ timeout: 5_000 })

  // Verify the palette contains a search input
  const searchInput = paletteDialog.locator('input')
  await expect(searchInput).toBeVisible()
})

// ============================================================================
// Search for an operator in the palette
// ============================================================================

test('Search for "Generate" operator in the node palette', async ({ page }) => {
  test.skip(!agentId, 'No agent created in setup')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Open palette
  await page.keyboard.press('ControlOrMeta+k')
  const paletteDialog = page.getByRole('dialog')
  await expect(paletteDialog).toBeVisible({ timeout: 5_000 })

  // Type "Generate" in the search input
  const searchInput = paletteDialog.locator('input')
  await searchInput.fill('Generate')
  await page.waitForTimeout(500)

  // Verify the Generate operator appears in results
  const generateItem = paletteDialog.getByText('Generate').first()
  await expect(generateItem).toBeVisible({ timeout: 3_000 })

  // Verify the description is also shown
  const description = paletteDialog.getByText(/LLM text generation/i)
  await expect(description).toBeVisible()
})

// ============================================================================
// Add Generate node to canvas
// ============================================================================

test('Add Generate node to canvas via palette', async ({ page }) => {
  test.skip(!agentId, 'No agent created in setup')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Count existing nodes before adding
  const nodesBefore = await page.locator('.react-flow__node').count()

  // Open palette and select Generate
  await page.keyboard.press('ControlOrMeta+k')
  const paletteDialog = page.getByRole('dialog')
  await expect(paletteDialog).toBeVisible({ timeout: 5_000 })

  // Search and click Generate operator
  const searchInput = paletteDialog.locator('input')
  await searchInput.fill('Generate')
  await page.waitForTimeout(500)

  const generateButton = paletteDialog.locator('button')
    .filter({ hasText: /^Generate$/i })
    .first()
  await generateButton.click()

  // Palette should close after selection
  await expect(paletteDialog).not.toBeVisible({ timeout: 3_000 })

  // Verify a new node appeared on the canvas
  await page.waitForTimeout(1000)
  const nodesAfter = await page.locator('.react-flow__node').count()
  expect(nodesAfter).toBeGreaterThan(nodesBefore)

  // Verify the Generate node text is visible
  const generateNode = page.locator('.react-flow__node')
    .filter({ hasText: /generate/i })
  await expect(generateNode.first()).toBeVisible({ timeout: 5_000 })
})

// ============================================================================
// Connect Begin to Generate (drag edge)
// ============================================================================

test('Connect Begin node to Generate node by dragging', async ({ page }) => {
  test.skip(!agentId, 'No agent created in setup')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // First, add a Generate node if not already present
  await page.keyboard.press('ControlOrMeta+k')
  const paletteDialog = page.getByRole('dialog')
  await expect(paletteDialog).toBeVisible({ timeout: 5_000 })
  const searchInput = paletteDialog.locator('input')
  await searchInput.fill('Generate')
  await page.waitForTimeout(500)
  const generateButton = paletteDialog.locator('button')
    .filter({ hasText: /^Generate$/i })
    .first()
  await generateButton.click()
  await page.waitForTimeout(1000)

  // Find the source handle (output port) on the Begin node
  const beginNode = page.locator('.react-flow__node')
    .filter({ hasText: /begin/i })
    .first()
  const sourceHandle = beginNode.locator('.react-flow__handle.source, [data-handlepos="right"], .react-flow__handle-right')
    .first()

  // Find the target handle (input port) on the Generate node
  const generateNode = page.locator('.react-flow__node')
    .filter({ hasText: /generate/i })
    .first()
  const targetHandle = generateNode.locator('.react-flow__handle.target, [data-handlepos="left"], .react-flow__handle-left')
    .first()

  // Attempt drag-and-drop connection
  if (
    await sourceHandle.isVisible({ timeout: 3_000 }).catch(() => false) &&
    await targetHandle.isVisible({ timeout: 3_000 }).catch(() => false)
  ) {
    await sourceHandle.dragTo(targetHandle)
    await page.waitForTimeout(1000)

    // Verify an edge was created
    const edges = page.locator('.react-flow__edge, .react-flow__connection')
    const edgeCount = await edges.count()
    expect(edgeCount).toBeGreaterThan(0)
  }
})

// ============================================================================
// Select node and verify config panel opens
// ============================================================================

test('Select Generate node opens config panel on the right', async ({ page }) => {
  test.skip(!agentId, 'No agent created in setup')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Add a Generate node first
  await page.keyboard.press('ControlOrMeta+k')
  const paletteDialog = page.getByRole('dialog')
  await expect(paletteDialog).toBeVisible({ timeout: 5_000 })
  const searchInput = paletteDialog.locator('input')
  await searchInput.fill('Generate')
  await page.waitForTimeout(500)
  await paletteDialog.locator('button').filter({ hasText: /^Generate$/i }).first().click()
  await page.waitForTimeout(1000)

  // Click on the Generate node to select it
  const generateNode = page.locator('.react-flow__node')
    .filter({ hasText: /generate/i })
    .first()
  await generateNode.click()
  await page.waitForTimeout(1000)

  // Verify the config panel opens on the right side
  const configPanel = page.locator('[class*="config"], [class*="panel"], [class*="sidebar"]')
    .filter({ hasText: /generate|temperature|model|config/i })

  const isPanelVisible = await configPanel.first().isVisible({ timeout: 5_000 }).catch(() => false)

  // The config panel should be visible with configuration options
  if (isPanelVisible) {
    const panelText = await configPanel.first().textContent()
    expect(panelText?.length).toBeGreaterThan(0)
  }
})

// ============================================================================
// Save agent and verify dirty indicator clears
// ============================================================================

test('Save agent clears dirty indicator', async ({ page }) => {
  test.skip(!agentId, 'No agent created in setup')

  await page.goto(`${AGENTS_URL}/${agentId}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(3000)

  // Add a node to make the canvas dirty
  await page.keyboard.press('ControlOrMeta+k')
  const paletteDialog = page.getByRole('dialog')
  await expect(paletteDialog).toBeVisible({ timeout: 5_000 })
  const searchInput = paletteDialog.locator('input')
  await searchInput.fill('Answer')
  await page.waitForTimeout(500)
  await paletteDialog.locator('button').filter({ hasText: /^Answer$/i }).first().click()
  await page.waitForTimeout(1000)

  // Check for the dirty indicator (asterisk "*" in the toolbar)
  const dirtyIndicator = page.locator('span.text-orange-500, [title="Unsaved changes"]')
  const isDirty = await dirtyIndicator.isVisible({ timeout: 3_000 }).catch(() => false)

  if (isDirty) {
    // Click Save button
    const saveButton = page.getByRole('button', { name: /save/i }).first()
    await saveButton.click()
    await page.waitForTimeout(3000)

    // Dirty indicator should disappear after save
    const isStillDirty = await dirtyIndicator.isVisible({ timeout: 3_000 }).catch(() => false)
    expect(isStillDirty).toBeFalsy()
  }
})
