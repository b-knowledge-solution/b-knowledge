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
      coverage: {
        // Inherit provider/reporter/exclude from sharedTestConfig.coverage,
        // then layer on per-path thresholds for the Phase 5 permission UI.
        ...sharedTestConfig.coverage,
        include: [
          ...sharedTestConfig.coverage.include,
          'src/features/permissions/**',
        ],
        thresholds: {
          // Keep the global floor from sharedTestConfig.
          ...sharedTestConfig.coverage.thresholds,
          // Per-path threshold for the Phase 5 permission UI.
          //
          // TS15 target is ≥85% on src/features/permissions/**. The current
          // enforceable floor is ~35% because the component bodies
          // (PermissionMatrix, OverrideEditor, PrincipalPicker,
          // ResourceGrantEditor, PermissionKeyPicker) cannot be mounted in
          // jsdom — shadcn/Radix + cmdk + React Compiler hang indefinitely.
          // All three Wave 1 plans (5.1, 5.2, 5.3) converged on pure-helper
          // tests in the node env, leaving the JSX bodies uncovered.
          //
          // Thresholds here are set to the actual enforceable numbers so
          // regressions (helpers un-exported, tests deleted) fail CI. Raising
          // to 85% is tracked as an IOU in 5.5-SUMMARY.md — resolving it
          // requires fixing the jsdom hang in a dedicated follow-up.
          'src/features/permissions/**': {
            lines: 35,
            statements: 35,
            functions: 25,
            branches: 25,
          },
        },
      },
    },
  }),
)
