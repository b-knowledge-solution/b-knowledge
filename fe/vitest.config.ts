import { defineConfig } from 'vitest/config'
import { commonExcludes, sharedConfig, sharedTestConfig } from './vitest.shared'

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedTestConfig,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: commonExcludes,
  },
})
