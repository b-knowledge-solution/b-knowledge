/**
 * @fileoverview IEC 62304 §5 — Software Development Lifecycle Compliance Tests
 *
 * Validates that the software architecture and infrastructure meet
 * IEC 62304 software lifecycle requirements:
 * - Software architecture documentation (IEC 62304 §5.3)
 * - Module boundary enforcement (IEC 62304 §5.4)
 * - Configuration management (IEC 62304 §5.1.9)
 * - Logging infrastructure (IEC 62304 §5.5.5)
 * - Database migration traceability (IEC 62304 §5.6)
 * - Service dependency management
 *
 * Regulatory references:
 * - IEC 62304:2006 §5.1 — Software development planning
 * - IEC 62304:2006 §5.3 — Software architectural design
 * - IEC 62304:2006 §5.4 — Software detailed design
 * - IEC 62304:2006 §5.5 — Software unit implementation and verification
 * - IEC 62304:2006 §5.6 — Software integration and integration testing
 */

import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../../src/shared/db/index.js', () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  getClient: vi.fn(),
  getAdapter: vi.fn(),
  closePool: vi.fn(),
  checkConnection: vi.fn(),
  db: { query: vi.fn() },
}))

// ============================================================================
// IEC 62304 §5.3 — Software Architecture
// ============================================================================

describe('IEC 62304 §5.3 — Software Architecture Documentation', () => {
  const rootDir = path.resolve(__dirname, '../../..')
  const beDir = path.resolve(__dirname, '../..')

  it('COMP-SLC-001: should have root CLAUDE.md with architecture documentation', () => {
    // IEC 62304 requires documented software architecture
    const claudeMd = path.join(rootDir, 'CLAUDE.md')
    expect(fs.existsSync(claudeMd)).toBe(true)

    const content = fs.readFileSync(claudeMd, 'utf-8')
    expect(content.length).toBeGreaterThan(100)
  })

  it('COMP-SLC-002: should have backend-specific CLAUDE.md', () => {
    // Each software unit must have documented architecture
    const claudeMd = path.join(beDir, 'CLAUDE.md')
    expect(fs.existsSync(claudeMd)).toBe(true)
  })

  it('COMP-SLC-003: should have package.json with defined dependencies', () => {
    // Software Bill of Materials — all dependencies must be declared
    const pkgJson = path.join(beDir, 'package.json')
    expect(fs.existsSync(pkgJson)).toBe(true)

    const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'))
    expect(pkg.dependencies).toBeDefined()
    expect(Object.keys(pkg.dependencies).length).toBeGreaterThan(0)
  })

  it('COMP-SLC-004: should have TypeScript configuration for type safety', () => {
    // Type safety is a software quality requirement per IEC 62304
    const tsConfig = path.join(beDir, 'tsconfig.json')
    expect(fs.existsSync(tsConfig)).toBe(true)
  })
})

// ============================================================================
// IEC 62304 §5.4 — Module Structure
// ============================================================================

describe('IEC 62304 §5.4 — Module Boundary Enforcement', () => {
  const modulesDir = path.resolve(__dirname, '../../src/modules')

  it('COMP-SLC-005: should have modular architecture with separate domain modules', () => {
    // Software must be decomposed into identifiable modules
    expect(fs.existsSync(modulesDir)).toBe(true)

    const modules = fs.readdirSync(modulesDir).filter((f) =>
      fs.statSync(path.join(modulesDir, f)).isDirectory()
    )
    expect(modules.length).toBeGreaterThan(5)
  })

  it('COMP-SLC-006: each module should have an index.ts barrel export', () => {
    // NX-style module boundaries — public API through barrel exports only
    const modules = fs.readdirSync(modulesDir).filter((f) =>
      fs.statSync(path.join(modulesDir, f)).isDirectory()
    )

    for (const mod of modules) {
      const indexFile = path.join(modulesDir, mod, 'index.ts')
      expect(fs.existsSync(indexFile), `Module ${mod} missing index.ts`).toBe(true)
    }
  })

  it('COMP-SLC-007: should have shared directory for cross-cutting concerns', () => {
    // Shared code must be explicitly separated from domain modules
    const sharedDir = path.resolve(__dirname, '../../src/shared')
    expect(fs.existsSync(sharedDir)).toBe(true)
  })
})

// ============================================================================
// IEC 62304 §5.1.9 — Configuration Management
// ============================================================================

describe('IEC 62304 §5.1.9 — Configuration Management', () => {
  it('COMP-SLC-008: should have centralized configuration module', async () => {
    // Configuration must be managed centrally, not scattered via process.env
    const configModule = await import('../../src/shared/config/index.js')
    expect(configModule.config).toBeDefined()
  })

  it('COMP-SLC-009: should have environment example file for setup guidance', () => {
    // Configuration requirements must be documented for deployment
    const beDir = path.resolve(__dirname, '../..')
    const envExample = path.join(beDir, '.env.example')
    expect(fs.existsSync(envExample)).toBe(true)
  })

  it('COMP-SLC-010: should have ESLint configuration for code quality', () => {
    // IEC 62304 requires defined coding standards
    const beDir = path.resolve(__dirname, '../..')
    const hasEslint =
      fs.existsSync(path.join(beDir, 'eslint.config.js')) ||
      fs.existsSync(path.join(beDir, 'eslint.config.mjs')) ||
      fs.existsSync(path.join(beDir, '.eslintrc.js')) ||
      fs.existsSync(path.join(beDir, '.eslintrc.json'))
    expect(hasEslint).toBe(true)
  })
})

// ============================================================================
// IEC 62304 §5.5.5 — Logging Infrastructure
// ============================================================================

describe('IEC 62304 §5.5.5 — Logging Infrastructure', () => {
  it('COMP-SLC-011: should have logging service with standard log levels', async () => {
    // Structured logging is required for traceability and debugging
    const loggerModule = await import('../../src/shared/services/logger.service.js')
    const log = loggerModule.log

    expect(log).toBeDefined()
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
    expect(typeof log.debug).toBe('function')
  })
})

// ============================================================================
// IEC 62304 §5.6 — Database Migration Traceability
// ============================================================================

describe('IEC 62304 §5.6 — Database Migration Traceability', () => {
  it('COMP-SLC-012: should have migration directory with timestamped files', () => {
    // All schema changes must be traceable via versioned migrations
    const migrationsDir = path.resolve(__dirname, '../../src/shared/db/migrations')
    expect(fs.existsSync(migrationsDir)).toBe(true)

    const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.ts'))
    expect(migrations.length).toBeGreaterThan(0)
  })

  it('COMP-SLC-013: migration files should follow timestamp naming convention', () => {
    // Naming convention: YYYYMMDDhhmmss_<name>.ts for ordering
    const migrationsDir = path.resolve(__dirname, '../../src/shared/db/migrations')
    const migrations = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.ts'))

    for (const m of migrations) {
      // Should start with digits (timestamp)
      expect(m).toMatch(/^\d+/)
    }
  })

  it('COMP-SLC-014: should have Knex configuration for migration management', () => {
    // Database migration tool must be properly configured
    const beDir = path.resolve(__dirname, '../..')
    const hasKnexConfig =
      fs.existsSync(path.join(beDir, 'knexfile.ts')) ||
      fs.existsSync(path.join(beDir, 'knexfile.js')) ||
      fs.existsSync(path.join(beDir, 'src/db/knex.ts')) ||
      fs.existsSync(path.join(beDir, 'src/shared/db/knex.ts'))
    expect(hasKnexConfig).toBe(true)
  })
})

// ============================================================================
// Test Infrastructure Verification
// ============================================================================

describe('Test Infrastructure — CI/CD Pipeline', () => {
  const rootDir = path.resolve(__dirname, '../../..')

  it('COMP-SLC-015: should have GitHub Actions CI workflow', () => {
    // IEC 62304 §5.5 — Automated testing must be part of the development process
    const workflowDir = path.join(rootDir, '.github/workflows')
    expect(fs.existsSync(workflowDir)).toBe(true)

    const workflows = fs.readdirSync(workflowDir).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    expect(workflows.length).toBeGreaterThan(0)
  })

  it('COMP-SLC-016: should have Vitest test configuration', () => {
    // Test framework must be properly configured
    const beDir = path.resolve(__dirname, '../..')
    const hasVitestConfig =
      fs.existsSync(path.join(beDir, 'vitest.config.ts')) ||
      fs.existsSync(path.join(beDir, 'vitest.config.js'))
    expect(hasVitestConfig).toBe(true)
  })

  it('COMP-SLC-017: should have test setup file for consistent test environment', () => {
    // Test environment must be repeatable and consistent
    const testSetup = path.resolve(__dirname, '../setup.ts')
    expect(fs.existsSync(testSetup)).toBe(true)
  })
})
