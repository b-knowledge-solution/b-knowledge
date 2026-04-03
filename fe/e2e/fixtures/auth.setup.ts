/**
 * @fileoverview Playwright auth setup -- runs once before all tests.
 *
 * Authenticates via the local account login dialog (root login) and
 * persists the session cookie to `e2e/.auth/user.json` so subsequent
 * test projects reuse the authenticated state without re-logging in.
 *
 * Environment variables:
 * - E2E_ADMIN_EMAIL: Login username (default: admin@localhost)
 * - E2E_ADMIN_PASSWORD: Login password (default: admin)
 *
 * @module e2e/fixtures/auth.setup
 */

import { test as setup, expect } from '@playwright/test'

/** Path where authenticated browser state is saved */
const authFile = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/login')

  // Wait for the "Local Account Login" button to appear (backend config must enable it)
  const localLoginButton = page.getByRole('button', { name: /local account login/i })
  await expect(localLoginButton).toBeVisible({ timeout: 10_000 })

  // Open the local account login dialog
  await localLoginButton.click()

  // Fill credentials from env or defaults matching be/.env.example
  const email = process.env.E2E_ADMIN_EMAIL || 'admin@localhost'
  const password = process.env.E2E_ADMIN_PASSWORD || 'admin'

  // Fill username field inside the dialog
  await page.getByPlaceholder('admin@localhost').fill(email)
  // Fill password field inside the dialog
  await page.getByPlaceholder('••••••••').fill(password)

  // Click the Login button inside the dialog footer
  const dialogLoginButton = page.locator('[role="dialog"]').getByRole('button', { name: /login/i })
  await dialogLoginButton.click()

  // Wait for redirect to authenticated page after login
  await expect(page).toHaveURL(/\/(chat|dashboard|datasets|data-studio)/, { timeout: 15_000 })

  // Save authenticated state for reuse across test projects
  await page.context().storageState({ path: authFile })
})
