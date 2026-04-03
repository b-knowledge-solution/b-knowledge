/**
 * @fileoverview Playwright E2E test configuration.
 *
 * Configures sequential, single-worker execution to avoid race conditions
 * on the shared PostgreSQL database. Auth state is persisted via storageState
 * so login runs once per suite.
 *
 * Prerequisites: `npm run docker:base && npm run dev` must be running.
 *
 * @module playwright.config
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',

  // Sequential execution -- stateful E2E flows must not overlap
  fullyParallel: false,
  workers: 1,

  retries: 1,
  reporter: 'html',

  // 2 minutes per test -- document parsing is slow
  timeout: 120_000,

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup project -- runs first to persist login state
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
})
