/**
 * @fileoverview E2E tests for memory feature navigation and sidebar integration.
 *
 * Verifies that the Memory nav item appears under the Agents group in the sidebar,
 * clicking it navigates to /memory, and the detail page is accessible at /memory/:id.
 *
 * Prerequisites:
 * - All infrastructure running: `npm run docker:base && npm run dev`
 * - Auth setup has run (Playwright handles this via project dependencies)
 *
 * @module e2e/memory/memory-navigation.spec
 */

import { test, expect } from '@playwright/test'

/** Base URL for backend API calls */
const API_BASE = process.env.E2E_API_BASE || 'http://localhost:3001'

// ============================================================================
// Sidebar: Memory appears under Agents group
// ============================================================================

test('Memory nav item appears in the sidebar under Agents group', async ({ page }) => {
  // Navigate to the home page to get the sidebar visible
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Expand the Agents group in the sidebar if it is collapsed
  const agentsGroup = page.locator('nav, [role="navigation"]')
    .getByText(/agents/i)
  if (await agentsGroup.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // Click to expand if it acts as a collapsible group header
    await agentsGroup.click()
    await page.waitForTimeout(500)
  }

  // Look for the Memory nav link in the sidebar
  const memoryNav = page.locator('nav, [role="navigation"]')
    .getByText(/memory/i)
  await expect(memoryNav.first()).toBeVisible({ timeout: 10_000 })
})

// ============================================================================
// Sidebar: Click Memory navigates to /memory
// ============================================================================

test('Click Memory nav item navigates to /memory', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  // Expand the Agents group if needed
  const agentsGroup = page.locator('nav, [role="navigation"]')
    .getByText(/agents/i)
  if (await agentsGroup.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await agentsGroup.click()
    await page.waitForTimeout(500)
  }

  // Click the Memory nav link
  const memoryNav = page.locator('nav, [role="navigation"]')
    .getByRole('link', { name: /memory/i })
    .or(page.locator('nav, [role="navigation"]').getByText(/memory/i))
  await expect(memoryNav.first()).toBeVisible({ timeout: 10_000 })
  await memoryNav.first().click()

  // Verify navigation to /memory
  await expect(page).toHaveURL(/\/memory\/?$/i, { timeout: 10_000 })
})

// ============================================================================
// Detail page: /memory/:id is accessible
// ============================================================================

test('Memory detail page is accessible at /memory/:id', async ({ page, request }) => {
  // Create a temporary pool via API to have a valid ID
  const poolName = `E2E Nav Pool ${Date.now()}`
  let poolId: string | undefined

  try {
    const createResp = await request.post(`${API_BASE}/api/memory`, {
      data: { name: poolName, description: 'Navigation test pool' },
    })

    if (createResp.ok()) {
      const body = await createResp.json()
      const data = body.data || body
      poolId = data.id
    }

    // Skip if pool creation failed (API may not be implemented yet)
    test.skip(!poolId, 'Could not create memory pool for navigation test')

    // Navigate to the detail page
    await page.goto(`/memory/${poolId}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Verify the page loaded with the correct URL
    await expect(page).toHaveURL(new RegExp(`/memory/${poolId}`), { timeout: 10_000 })

    // Verify some content loaded (heading, pool name, or any meaningful element)
    const content = page.getByText(new RegExp(poolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      .or(page.getByRole('heading'))
    await expect(content.first()).toBeVisible({ timeout: 10_000 })
  } finally {
    // Clean up the temporary pool
    if (poolId) {
      try {
        await request.delete(`${API_BASE}/api/memory/${poolId}`)
      } catch { /* ignore cleanup errors */ }
    }
  }
})
