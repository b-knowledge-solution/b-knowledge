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
      coverage: {
        // Inherit provider/reporter/exclude from sharedTestConfig.coverage,
        // then layer on per-path thresholds for the Phase 5 permission hooks.
        ...sharedTestConfig.coverage,
        include: [
          ...sharedTestConfig.coverage.include,
          'src/lib/permissions.tsx',
          'src/lib/ability.tsx',
        ],
        thresholds: {
          // Keep the global floor from sharedTestConfig.
          ...sharedTestConfig.coverage.thresholds,
          // Phase 5 TS15: useHasPermission hook + <Can> component integration.
          // Measured at 100% via tests/lib/permissions.test.tsx and
          // tests/lib/ability.test.tsx (11 tests total). Enforce ≥85% so any
          // regression in either file surfaces as a CI failure.
          'src/lib/permissions.tsx': {
            lines: 85,
            statements: 85,
            functions: 85,
            branches: 80,
          },
          'src/lib/ability.tsx': {
            lines: 85,
            statements: 85,
            functions: 85,
            branches: 80,
          },
        },
      },
    },
  }),
)
