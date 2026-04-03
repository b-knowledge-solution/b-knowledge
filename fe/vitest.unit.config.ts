import { defineConfig, mergeConfig } from 'vitest/config'
import { commonExcludes, sharedConfig, sharedTestConfig, unitTestFiles } from './vitest.shared'

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      ...sharedTestConfig,
      name: 'unit',
      environment: 'node',
      globals: true,
      include: unitTestFiles,
      exclude: commonExcludes,
    },
  }),
)
