import { defineConfig, mergeConfig } from 'vitest/config'
import { commonExcludes, sharedConfig, sharedTestConfig, unitTestFiles } from './vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      ...sharedTestConfig,
      name: 'ui',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      exclude: [...unitTestFiles, ...commonExcludes],
    },
  }),
)
