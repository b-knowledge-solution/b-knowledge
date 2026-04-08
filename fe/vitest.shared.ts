import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export const unitTestFiles = [
  'tests/components/llm-presets.test.ts',
  'tests/config.test.ts',
  'tests/features/agent/agent.stub.test.ts',
  'tests/features/code-graph/codeGraphApi.contracts.test.ts',
  'tests/features/datasets/ChangeParserDialog.test.tsx',
  'tests/features/datasets/TagEditor.test.tsx',
  'tests/features/datasets/WebCrawlDialog.test.tsx',
  'tests/features/permissions/permissionsApi.test.ts',
  'tests/features/permissions/OverrideEditor.test.tsx',
  'tests/features/permissions/PermissionMatrix.test.tsx',
  'tests/features/permissions/PrincipalPicker.test.tsx',
  'tests/features/permissions/ResourceGrantEditor.test.tsx',
  'tests/lib/queryKeys.test.ts',
  'tests/utils/document-util.test.ts',
  'tests/utils/format.test.ts',
  'tests/version.test.ts',
  'scripts/__tests__/codemod-permissions.test.ts',
]

export const sharedConfig = {
  plugins: [react()],
  cacheDir: './node_modules/.vite',
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
} as const

export const sharedTestConfig = {
  pool: 'forks' as const,
  fileParallelism: false,
  maxWorkers: 1,
  minWorkers: 1,
  poolOptions: {
    forks: {
      singleFork: true,
    },
  },
  watch: false,
  testTimeout: 10000,
  hookTimeout: 10000,
  isolate: true,
  coverage: {
    provider: 'istanbul' as const,
    reporter: ['text', 'html', 'clover'],
    reportsDirectory: './coverage',
    all: false,
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/**/*.d.ts',
      'src/main.tsx',
      'src/vite-env.d.ts',
      'src/assets/**',
      'src/i18n/locales/**',
      '**/*.test.tsx',
      '**/*.stories.tsx',
    ],
    thresholds: {
      // Global floors for the whole FE. These are intentionally low because
      // per-file/per-path thresholds (see vitest.unit.config.ts and
      // vitest.ui.config.ts) enforce the real targets on the files that
      // matter. The global numbers just keep a safety net so a total
      // regression (tests deleted) still fails CI.
      lines: 28,
      functions: 25,
      branches: 18,
      statements: 28,
    },
  },
} as const

export const commonExcludes = [
  'node_modules',
  'dist',
  '.idea',
  '.git',
  '.cache',
]
