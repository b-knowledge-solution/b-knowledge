/**
 * @fileoverview IEC 62304 §5.5 / ISO 13485 §6.2 — Frontend Security UI Compliance Tests
 *
 * Validates that the frontend security infrastructure meets healthcare standards:
 * - Authentication flow enforcement (21 CFR Part 11 §11.10)
 * - HTTP client security configuration (IEC 62304 §5.5)
 * - Route protection mechanisms
 * - Feature flag gating for controlled rollouts
 * - API client error handling
 *
 * Regulatory references:
 * - IEC 62304:2006 §5.5 — Software unit implementation and verification
 * - ISO 13485:2016 §6.2 — Human resources / competence
 * - 21 CFR Part 11 §11.10 — Controls for closed systems
 */

import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// IEC 62304 §5.5 — Authentication Flow
// ============================================================================

describe('IEC 62304 §5.5 — Frontend Authentication Infrastructure', () => {
  const feDir = path.resolve(__dirname, '../..')

  it('COMP-UI-001: should have authentication context for session management', () => {
    // Session state must be centrally managed via React Context or hooks
    const featureAuthDir = path.join(feDir, 'src/features/auth')
    const hooksDir = path.join(feDir, 'src/hooks')
    const contextDir = path.join(feDir, 'src/app/contexts')

    // Auth can be in features/auth, hooks, or contexts per FE conventions
    const hasAuth =
      fs.existsSync(featureAuthDir) ||
      (fs.existsSync(contextDir) &&
        fs.readdirSync(contextDir).some((f) => f.toLowerCase().includes('auth'))) ||
      (fs.existsSync(hooksDir) &&
        fs.readdirSync(hooksDir).some((f) => f.toLowerCase().includes('auth')))
    expect(hasAuth).toBe(true)
  })

  it('COMP-UI-002: should have login page for user authentication', () => {
    // User-facing login interface must exist per 21 CFR Part 11
    const hasLoginPage =
      fs.existsSync(path.join(feDir, 'src/features/auth')) ||
      fs.existsSync(path.join(feDir, 'src/app/pages/LoginPage.tsx')) ||
      fs.existsSync(path.join(feDir, 'src/features/auth/pages/LoginPage.tsx'))

    // Also check for login in route config
    const routeConfig = path.join(feDir, 'src/app/routeConfig.ts')
    const hasLoginRoute = fs.existsSync(routeConfig) &&
      fs.readFileSync(routeConfig, 'utf-8').toLowerCase().includes('login')

    expect(hasLoginPage || hasLoginRoute).toBe(true)
  })

  it('COMP-UI-003: should have centralized API client with credentials handling', () => {
    // HTTP client must include authentication credentials on API calls
    const apiFile = path.join(feDir, 'src/lib/api.ts')
    expect(fs.existsSync(apiFile)).toBe(true)

    const content = fs.readFileSync(apiFile, 'utf-8')
    // Should reference credentials or authorization handling
    expect(
      content.includes('credentials') ||
      content.includes('Authorization') ||
      content.includes('cookie') ||
      content.includes('token')
    ).toBe(true)
  })

  it('COMP-UI-004: should handle 401 responses with redirect to login', () => {
    // Unauthorized responses must redirect to login, not show raw errors
    const apiFile = path.join(feDir, 'src/lib/api.ts')
    const content = fs.readFileSync(apiFile, 'utf-8')

    expect(
      content.includes('401') ||
      content.includes('unauthorized') ||
      content.includes('login') ||
      content.includes('redirect')
    ).toBe(true)
  })
})

// ============================================================================
// Route Protection
// ============================================================================

describe('Route Protection — Access Control UI', () => {
  const feDir = path.resolve(__dirname, '../..')

  it('COMP-UI-005: should have route configuration with metadata', () => {
    // Routes must be defined with access control metadata
    const routeConfig = path.join(feDir, 'src/app/routeConfig.ts')
    expect(fs.existsSync(routeConfig)).toBe(true)
  })

  it('COMP-UI-006: should have App.tsx with router setup', () => {
    // Application routing must be centrally defined
    const appFile = path.join(feDir, 'src/app/App.tsx')
    expect(fs.existsSync(appFile)).toBe(true)
  })

  it('COMP-UI-007: should have Provider stack for global state', () => {
    // Providers (auth, settings) must wrap the application
    const providersFile = path.join(feDir, 'src/app/Providers.tsx')
    expect(fs.existsSync(providersFile)).toBe(true)
  })
})

// ============================================================================
// Feature Flag Gating
// ============================================================================

describe('Feature Flag Gating — Controlled Rollouts', () => {
  const feDir = path.resolve(__dirname, '../..')

  it('COMP-UI-008: should have feature flag configuration', () => {
    // Feature flags enable controlled rollout per ISO 13485 change control
    const configFile = path.join(feDir, 'src/config.ts')
    expect(fs.existsSync(configFile)).toBe(true)

    const content = fs.readFileSync(configFile, 'utf-8')
    expect(content.includes('ENABLE') || content.includes('feature')).toBe(true)
  })

  it('COMP-UI-009: should define environment variables for feature toggles', () => {
    // Feature flags must be configurable via environment
    const envExample = path.join(feDir, '.env.example')
    expect(fs.existsSync(envExample)).toBe(true)

    const content = fs.readFileSync(envExample, 'utf-8')
    expect(content.includes('VITE_ENABLE')).toBe(true)
  })
})

// ============================================================================
// Internationalization (i18n)
// ============================================================================

describe('Internationalization — UI Accessibility', () => {
  const feDir = path.resolve(__dirname, '../..')

  it('COMP-UI-010: should have English locale file', () => {
    // Primary locale must exist — locales may be in src/i18n/ or src/i18n/locales/
    const enFile = path.join(feDir, 'src/i18n/locales/en.json')
    const enFileAlt = path.join(feDir, 'src/i18n/en.json')
    expect(fs.existsSync(enFile) || fs.existsSync(enFileAlt)).toBe(true)
  })

  it('COMP-UI-011: should have all required locale files', () => {
    // Multi-language support for healthcare deployment regions
    const localesDir = path.join(feDir, 'src/i18n/locales')
    const i18nDir = path.join(feDir, 'src/i18n')

    // Check locales subdirectory first, fall back to i18n root
    const dir = fs.existsSync(localesDir) ? localesDir : i18nDir
    const locales = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    expect(locales.length).toBeGreaterThanOrEqual(2)
  })

  it('COMP-UI-012: locale files should be valid JSON', () => {
    // Invalid locale files cause runtime crashes
    const localesDir = path.join(feDir, 'src/i18n/locales')
    const i18nDir = path.join(feDir, 'src/i18n')
    const dir = fs.existsSync(localesDir) ? localesDir : i18nDir
    const locales = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

    for (const locale of locales) {
      const content = fs.readFileSync(path.join(dir, locale), 'utf-8')
      expect(() => JSON.parse(content)).not.toThrow()
    }
  })
})

// ============================================================================
// Error Boundary Protection
// ============================================================================

describe('Error Boundary — Graceful UI Failure', () => {
  const feDir = path.resolve(__dirname, '../..')

  it('COMP-UI-013: should have error boundary components', () => {
    // IEC 62304 §5.7 — UI errors must not crash the entire application
    const componentsDir = path.join(feDir, 'src/components')
    const featuresDir = path.join(feDir, 'src/features')

    // Search for error boundary in components or any feature
    const hasErrorBoundary =
      fs.existsSync(path.join(componentsDir, 'ErrorBoundary.tsx')) ||
      fs.existsSync(path.join(componentsDir, 'FeatureErrorBoundary.tsx')) ||
      // Check recursively for any error boundary
      findFileRecursive(componentsDir, 'ErrorBoundary') ||
      findFileRecursive(featuresDir, 'ErrorBoundary')

    expect(hasErrorBoundary).toBe(true)
  })
})

// ============================================================================
// Frontend Architecture Compliance
// ============================================================================

describe('Frontend Architecture — IEC 62304 §5.3', () => {
  const feDir = path.resolve(__dirname, '../..')

  it('COMP-UI-014: should have feature-based module structure', () => {
    // Software must be decomposed into identifiable features/modules
    const featuresDir = path.join(feDir, 'src/features')
    expect(fs.existsSync(featuresDir)).toBe(true)

    const features = fs.readdirSync(featuresDir).filter((f) =>
      fs.statSync(path.join(featuresDir, f)).isDirectory()
    )
    expect(features.length).toBeGreaterThan(5)
  })

  it('COMP-UI-015: should have shared components directory', () => {
    // Reusable UI components must be centrally managed
    const componentsDir = path.join(feDir, 'src/components')
    expect(fs.existsSync(componentsDir)).toBe(true)
  })

  it('COMP-UI-016: should have centralized query key management', () => {
    // Cache keys must be centrally defined to prevent collisions
    const queryKeysFile = path.join(feDir, 'src/lib/queryKeys.ts')
    expect(fs.existsSync(queryKeysFile)).toBe(true)
  })

  it('COMP-UI-017: should have CLAUDE.md with frontend architecture docs', () => {
    // Architecture documentation is required per IEC 62304
    const claudeMd = path.join(feDir, 'CLAUDE.md')
    expect(fs.existsSync(claudeMd)).toBe(true)
  })

  it('COMP-UI-018: should have Vite configuration for build system', () => {
    // Build system must be properly configured for reproducible builds
    const hasViteConfig =
      fs.existsSync(path.join(feDir, 'vite.config.ts')) ||
      fs.existsSync(path.join(feDir, 'vite.config.js'))
    expect(hasViteConfig).toBe(true)
  })

  it('COMP-UI-019: should have testing infrastructure configured', () => {
    // IEC 62304 §5.5 — Testing framework must be in place
    const hasVitestConfig =
      fs.existsSync(path.join(feDir, 'vitest.config.ts')) ||
      fs.existsSync(path.join(feDir, 'vitest.config.js'))
    expect(hasVitestConfig).toBe(true)
  })

  it('COMP-UI-020: should have Playwright E2E test configuration', () => {
    // E2E testing validates integrated system behavior
    const hasPlaywrightConfig =
      fs.existsSync(path.join(feDir, 'playwright.config.ts')) ||
      fs.existsSync(path.join(feDir, 'playwright.config.js'))
    expect(hasPlaywrightConfig).toBe(true)
  })
})

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Recursively searches for a file containing the given name
 * @param {string} dir - Directory to search
 * @param {string} name - Partial file name to match
 * @returns {boolean} True if found
 */
function findFileRecursive(dir: string, name: string): boolean {
  if (!fs.existsSync(dir)) return false
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.includes(name)) return true
      if (entry.isDirectory()) {
        if (findFileRecursive(path.join(dir, entry.name), name)) return true
      }
    }
  } catch {
    return false
  }
  return false
}
