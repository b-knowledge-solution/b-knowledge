/**
 * @fileoverview LLM parameter presets matching RAGFlow freedom levels.
 * @module components/llm-setting-fields/llm-presets
 */

/**
 * @description A named preset of LLM sampling parameters.
 */
export interface LlmPreset {
  temperature: number
  top_p: number
  frequency_penalty: number
  presence_penalty: number
  max_tokens: number
}

/**
 * @description Available preset names for the freedom selector.
 */
export type PresetName = 'precise' | 'balance' | 'creative' | 'custom'

/**
 * @description Pre-configured LLM parameter sets matching RAGFlow defaults.
 */
export const LLM_PRESETS: Record<Exclude<PresetName, 'custom'>, LlmPreset> = {
  precise: {
    temperature: 0.2,
    top_p: 0.75,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    max_tokens: 4096,
  },
  balance: {
    temperature: 0.5,
    top_p: 0.85,
    frequency_penalty: 0.3,
    presence_penalty: 0.2,
    max_tokens: 4096,
  },
  creative: {
    temperature: 0.8,
    top_p: 0.9,
    frequency_penalty: 0.1,
    presence_penalty: 0.1,
    max_tokens: 4096,
  },
}

/**
 * @description Detects which preset matches the current parameter values.
 * Returns 'custom' if no preset matches exactly.
 * @param {Partial<LlmPreset>} params - Current LLM parameter values
 * @returns {PresetName} Detected preset name
 */
export function detectPreset(params: Partial<LlmPreset>): PresetName {
  for (const [name, preset] of Object.entries(LLM_PRESETS)) {
    // Compare all five parameters for exact match
    if (
      params.temperature === preset.temperature &&
      params.top_p === preset.top_p &&
      params.frequency_penalty === preset.frequency_penalty &&
      params.presence_penalty === preset.presence_penalty &&
      params.max_tokens === preset.max_tokens
    ) {
      return name as PresetName
    }
  }
  return 'custom'
}
