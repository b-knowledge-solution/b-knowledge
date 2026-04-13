/**
 * @fileoverview Vitest configuration for the Knowledge Base backend.
 * 
 * Configures test runner with coverage reporting and TypeScript support.
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test files location
    include: ['tests/**/*.test.ts'],
    
    // Environment
    environment: 'node',
    
    // Global setup file for mocks and utilities
    setupFiles: ['./tests/setup.ts'],
    
    // Enable globals for describe, it, expect
    globals: true,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      
      // Include source files
      include: ['src/**/*.ts'],
      
      // Exclude test files and non-testable files
      exclude: [
        'src/index.ts',          // Entry point
        'src/scripts/**',        // CLI scripts
        'src/db/migrations/**',  // Database migrations
        'src/db/adapters/**',    // Database adapters (need integration tests)
        'src/db/migrate.ts',     // Migration runner (CLI script)
        'src/routes/**',         // Routes (tested via service layer, handlers need integration tests)
        'src/services/minio.service.ts', // MinIO (needs real MinIO instance)
        'src/services/logger.service.ts', // Logger (Winston setup, tested structurally)
        '**/*.d.ts',
      ],
      
      // Coverage thresholds (adjusted for unit tests with mocked dependencies)
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 60,
        lines: 60,
      },
    },
    
    // Test timeout — bumped from 30s to 90s in Phase 3 because the migration
    // chain has grown (~10 migrations as of Phase 3 Wave 0) and `withScratchDb`
    // runs the full chain on every test that uses it. `backfill.test.ts` and
    // `migrations.test.ts` were timing out at 30s after P3.0a added another
    // migration. As the chain keeps growing through later phases, this timeout
    // may need to increase further. The right long-term fix is a shared scratch-DB
    // pool that doesn't re-run the chain per test, but that's deferred to a
    // tooling cleanup phase.
    testTimeout: 90000,

    // Knex's migrate.latest() uses runtime `import()` to load migration files,
    // which bypasses Vite's transformer entirely. We register `tsx` as an ESM loader
    // in each forked test process so runtime imports of `.js`-suffixed paths inside
    // migration files (NodeNext convention) resolve to their `.ts` sources. This is
    // the same mechanism `npm run db:migrate` already uses.
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--import', 'tsx/esm'],
      },
    },
    
    // Type checking
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Source code uses NodeNext-style `.js` extensions in TypeScript imports
    // (`import { foo } from './bar.js'` resolves to `bar.ts` at compile time).
    // Vite/Vitest's resolver does not do this by default — `extensionAlias` tells
    // it to try `.ts` and `.tsx` when an import ends in `.js` / `.jsx`.
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    },
  },
});
