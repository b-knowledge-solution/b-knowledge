/**
 * @fileoverview Tests for application configuration module.
 *
 * Tests:
 * - config object with default values when no env vars are set
 * - getBoolEnv parsing of 'true', 'false', undefined, and other values
 *
 * Uses vi.stubEnv() to mock import.meta.env values before importing the config module.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Tests
// ============================================================================

describe('config', () => {
  beforeEach(() => {
    // Reset module registry so config re-evaluates env vars on each import
    vi.resetModules()
  })

  /**
   * @description Dynamically imports the config module to pick up stubbed env vars
   * @returns {Promise<{ config: typeof import('@/config')['config'] }>} The config export
   */
  async function importConfig() {
    return await import('@/config')
  }

  describe('default values', () => {
    it('should enable AI Chat by default when VITE_ENABLE_AI_CHAT is not set', async () => {
      // No env stub — simulates missing environment variable
      const { config } = await importConfig()
      expect(config.features.enableAiChat).toBe(true)
    })

    it('should enable AI Search by default when VITE_ENABLE_AI_SEARCH is not set', async () => {
      const { config } = await importConfig()
      expect(config.features.enableAiSearch).toBe(true)
    })

    it('should enable History by default when VITE_ENABLE_HISTORY is not set', async () => {
      const { config } = await importConfig()
      expect(config.features.enableHistory).toBe(true)
    })

    it('should set apiBaseUrl to empty string when VITE_API_BASE_URL is not set', async () => {
      const { config } = await importConfig()
      expect(config.apiBaseUrl).toBe('')
    })
  })

  describe('getBoolEnv parsing', () => {
    it('should parse "true" string as boolean true', async () => {
      vi.stubEnv('VITE_ENABLE_AI_CHAT', 'true')

      const { config } = await importConfig()
      expect(config.features.enableAiChat).toBe(true)

      vi.unstubAllEnvs()
    })

    it('should parse "false" string as boolean false', async () => {
      vi.stubEnv('VITE_ENABLE_AI_CHAT', 'false')

      const { config } = await importConfig()
      expect(config.features.enableAiChat).toBe(false)

      vi.unstubAllEnvs()
    })

    it('should return default value for undefined env var', async () => {
      // VITE_ENABLE_HISTORY defaults to true per the config module
      const { config } = await importConfig()
      expect(config.features.enableHistory).toBe(true)
    })

    it('should return default value for non-boolean string values', async () => {
      // Values like "yes", "1", "on" should fall back to the default
      vi.stubEnv('VITE_ENABLE_AI_SEARCH', 'yes')

      const { config } = await importConfig()
      // Default for enableAiSearch is true
      expect(config.features.enableAiSearch).toBe(true)

      vi.unstubAllEnvs()
    })

    it('should return default value for empty string', async () => {
      vi.stubEnv('VITE_ENABLE_AI_CHAT', '')

      const { config } = await importConfig()
      // Default for enableAiChat is true
      expect(config.features.enableAiChat).toBe(true)

      vi.unstubAllEnvs()
    })
  })

  describe('apiBaseUrl', () => {
    it('should use VITE_API_BASE_URL when set', async () => {
      vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3001')

      const { config } = await importConfig()
      expect(config.apiBaseUrl).toBe('http://localhost:3001')

      vi.unstubAllEnvs()
    })
  })
})
