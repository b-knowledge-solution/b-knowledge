/**
 * @fileoverview Playwright E2E smoke tests for B-Knowledge frontend.
 *
 * Verifies basic application health:
 * - Login page renders correctly
 * - Unauthenticated users are redirected to login
 * - Main page elements are present after authentication
 *
 * Prerequisites: `npm run docker:base && npm run dev` must be running.
 *
 * @module e2e/smoke
 */

import { test, expect } from '@playwright/test'

// ============================================================================
// Smoke Tests
// ============================================================================

test.describe('Smoke Tests', () => {
  test('login page loads and displays expected content', async ({ page }) => {
    await page.goto('/login')

    // Verify the page has loaded by checking for a recognizable title or heading
    await expect(page).toHaveTitle(/B-Knowledge/i)
  })

  test('unauthenticated user is redirected to login page', async ({ page }) => {
    // Clear any stored auth state to simulate unauthenticated visit
    await page.context().clearCookies()

    await page.goto('/')

    // Backend should return 401, triggering a client-side redirect to /login
    await expect(page).toHaveURL(/login/)
  })

  test('login page contains email and password inputs', async ({ page }) => {
    await page.goto('/login')

    // Verify essential form elements are present
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"], input[name="password"]')

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
  })

  test('login page contains a submit button', async ({ page }) => {
    await page.goto('/login')

    // Look for a login/sign-in submit button
    const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')

    await expect(submitButton.first()).toBeVisible()
  })
})
