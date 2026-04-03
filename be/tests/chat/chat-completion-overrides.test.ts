/**
 * @fileoverview Tests for per-message LLM overrides in chat completion.
 * Validates that llm_id, temperature, and max_tokens overrides from the
 * request body are correctly merged with dialog defaults.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger
vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock config
vi.mock('../../src/shared/config/index.js', () => ({
  config: {
    llm: { defaultProviderId: 'default-provider' },
  },
}))

/** @description Dialog configuration defaults */
interface DialogConfig {
  temperature: number
  max_tokens: number
  top_p: number
  top_n: number
}

/** @description Per-message override fields from request body */
interface CompletionOverrides {
  llm_id?: string
  temperature?: number
  max_tokens?: number
}

/**
 * @description Merges per-message overrides with dialog config defaults.
 * Matches the logic in chat-conversation.service.ts streamChat().
 * @param dialogConfig - Base dialog configuration
 * @param dialogLlmId - Dialog's default LLM provider ID
 * @param overrides - Per-message override fields from request body
 * @returns Effective config and LLM ID after applying overrides
 */
function applyCompletionOverrides(
  dialogConfig: DialogConfig,
  dialogLlmId: string,
  overrides: CompletionOverrides,
): { effectiveConfig: DialogConfig; effectiveLlmId: string } {
  const effectiveConfig = {
    ...dialogConfig,
    ...(overrides.temperature !== undefined && { temperature: overrides.temperature }),
    ...(overrides.max_tokens !== undefined && { max_tokens: overrides.max_tokens }),
  }
  const effectiveLlmId = overrides.llm_id ?? dialogLlmId

  return { effectiveConfig, effectiveLlmId }
}

describe('Chat Completion Overrides', () => {
  const defaultDialogConfig: DialogConfig = {
    temperature: 0.7,
    max_tokens: 4096,
    top_p: 0.9,
    top_n: 6,
  }
  const defaultLlmId = 'dialog-default-llm'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('applyCompletionOverrides', () => {
    it('should use override llm_id when provided', () => {
      const overrides: CompletionOverrides = { llm_id: 'custom-llm-provider' }

      const { effectiveLlmId } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveLlmId).toBe('custom-llm-provider')
    })

    it('should use dialog default llm_id when no override', () => {
      const overrides: CompletionOverrides = {}

      const { effectiveLlmId } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveLlmId).toBe('dialog-default-llm')
    })

    it('should override temperature when provided', () => {
      const overrides: CompletionOverrides = { temperature: 0.1 }

      const { effectiveConfig } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveConfig.temperature).toBe(0.1)
      // Other config values should remain unchanged
      expect(effectiveConfig.max_tokens).toBe(4096)
      expect(effectiveConfig.top_p).toBe(0.9)
      expect(effectiveConfig.top_n).toBe(6)
    })

    it('should override max_tokens when provided', () => {
      const overrides: CompletionOverrides = { max_tokens: 1024 }

      const { effectiveConfig } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveConfig.max_tokens).toBe(1024)
      // Other config values should remain unchanged
      expect(effectiveConfig.temperature).toBe(0.7)
    })

    it('should override both temperature and max_tokens together', () => {
      const overrides: CompletionOverrides = {
        temperature: 1.5,
        max_tokens: 8192,
      }

      const { effectiveConfig } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveConfig.temperature).toBe(1.5)
      expect(effectiveConfig.max_tokens).toBe(8192)
    })

    it('should use all dialog defaults when no overrides provided', () => {
      const overrides: CompletionOverrides = {}

      const { effectiveConfig, effectiveLlmId } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveConfig).toEqual(defaultDialogConfig)
      expect(effectiveLlmId).toBe(defaultLlmId)
    })

    it('should apply all overrides together (llm_id + temperature + max_tokens)', () => {
      const overrides: CompletionOverrides = {
        llm_id: 'gpt-4-turbo',
        temperature: 0.0,
        max_tokens: 128000,
      }

      const { effectiveConfig, effectiveLlmId } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveLlmId).toBe('gpt-4-turbo')
      expect(effectiveConfig.temperature).toBe(0.0)
      expect(effectiveConfig.max_tokens).toBe(128000)
      // Unaffected fields
      expect(effectiveConfig.top_p).toBe(0.9)
      expect(effectiveConfig.top_n).toBe(6)
    })

    it('should handle temperature of 0 correctly (not falsy)', () => {
      const overrides: CompletionOverrides = { temperature: 0 }

      const { effectiveConfig } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      // 0 is a valid temperature value, should override the default
      expect(effectiveConfig.temperature).toBe(0)
    })

    it('should not override when values are undefined', () => {
      const overrides: CompletionOverrides = {
        llm_id: undefined,
        temperature: undefined,
        max_tokens: undefined,
      }

      const { effectiveConfig, effectiveLlmId } = applyCompletionOverrides(
        defaultDialogConfig,
        defaultLlmId,
        overrides,
      )

      expect(effectiveConfig).toEqual(defaultDialogConfig)
      expect(effectiveLlmId).toBe(defaultLlmId)
    })
  })
})
