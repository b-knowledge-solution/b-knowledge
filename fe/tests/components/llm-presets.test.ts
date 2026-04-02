import { describe, it, expect } from 'vitest'
import { detectPreset, LLM_PRESETS } from '@/components/llm-setting-fields/llm-presets'

/**
 * @description Tests for LLM preset detection logic.
 */
describe('detectPreset', () => {
  it('detects precise preset', () => {
    expect(detectPreset(LLM_PRESETS.precise)).toBe('precise')
  })

  it('detects balance preset', () => {
    expect(detectPreset(LLM_PRESETS.balance)).toBe('balance')
  })

  it('detects creative preset', () => {
    expect(detectPreset(LLM_PRESETS.creative)).toBe('creative')
  })

  it('returns custom for non-matching values', () => {
    expect(detectPreset({
      temperature: 0.99, top_p: 0.5,
      frequency_penalty: 0, presence_penalty: 0, max_tokens: 1000,
    })).toBe('custom')
  })

  it('returns custom for partial params', () => {
    expect(detectPreset({ temperature: 0.2 })).toBe('custom')
  })
})
