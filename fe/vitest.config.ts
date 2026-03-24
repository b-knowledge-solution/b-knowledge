import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // 1. IMPROVED CONCURRENCY
    pool: 'forks', 
    poolOptions: {
      forks: {
        // Limits the number of concurrent processes to prevent CPU/RAM throttling
        // Adjust based on your CI or local machine (e.g., total CPUs / 2)
        singleFork: false,
      },
    },
    
    // 2. STABILITY FOR LARGE SUITES
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    
    // 3. CACHING & PERFORMANCE
    // Helps with "queued" tests by ensuring Vitest doesn't hang on old builds
    cache: {
      dir: './node_modules/.vitest',
    },
    // Only re-run tests that are affected by changes (useful for dev)
    watch: false, 

    // 4. RESOURCE MANAGEMENT (The "Queue" Fix)
    // Automatically kill tests that take too long (prevents hanging workers)
    testTimeout: 10000, 
    hookTimeout: 10000,
    // Clear out memory after each test file
    isolate: true, 

    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],

    // 5. OPTIMIZED COVERAGE
    coverage: {
      provider: 'istanbul', // switched to istanbul for reliable merged report generation
      reporter: ['text', 'html', 'clover'], // 'clover' is faster than 'lcov' for local dev
      reportsDirectory: './coverage',
      // Ensure coverage doesn't slow down the actual test run too much
      all: false, 
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/assets/**',
        'src/i18n/locales/**',
        '**/*.test.tsx', // Don't cover test files themselves
        '**/*.stories.tsx', // Don't cover Storybook files
      ],
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 20,
        statements: 30,
      },
    },
    
    // 6. REACT 19 / DEPS OPTIMIZATION
    deps: {
      optimizer: {
        web: {
          // Speeds up testing by pre-bundling these common heavy hitters
          include: ['react', 'react-dom', 'react/jsx-runtime'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});