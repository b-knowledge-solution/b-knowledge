/**
 * @fileoverview Tests for chat custom prompt variable replacement logic.
 * Validates that system prompt placeholders are correctly replaced with
 * user-provided or default values, and required variable validation works.
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

/** @description Type matching PromptVariable from shared/models/types.ts */
interface PromptVariable {
  key: string
  description?: string
  optional: boolean
  default_value?: string
}

/**
 * @description Standalone implementation of variable replacement logic
 * matching the buildContextPrompt behavior from chat-conversation.service.ts.
 * This allows unit testing without importing the full service.
 */
function replaceVariables(
  systemPrompt: string,
  variables?: Record<string, string>,
  variableDefinitions?: PromptVariable[],
): string {
  let prompt = systemPrompt

  if (variableDefinitions) {
    for (const v of variableDefinitions) {
      const value = variables?.[v.key] ?? v.default_value ?? ''
      prompt = prompt.replaceAll(`{${v.key}}`, value)
    }
  }

  return prompt
}

/**
 * @description Validates that all required variables have values.
 * Returns array of missing required variable keys.
 */
function validateRequiredVariables(
  variableDefinitions: PromptVariable[],
  variables?: Record<string, string>,
): string[] {
  return variableDefinitions
    .filter(v => !v.optional && !variables?.[v.key] && !v.default_value)
    .map(v => v.key)
}

describe('Chat Variables', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('replaceVariables (placeholder replacement)', () => {
    it('should replace {language} placeholder with provided value', () => {
      const systemPrompt = 'You are an assistant. Respond in {language}.'
      const definitions: PromptVariable[] = [
        { key: 'language', optional: false },
      ]
      const variables = { language: 'English' }

      const result = replaceVariables(systemPrompt, variables, definitions)

      expect(result).toBe('You are an assistant. Respond in English.')
    })

    it('should replace multiple variables in a single prompt', () => {
      const systemPrompt = 'You are a {role} assistant for {audience}. Use {tone} tone.'
      const definitions: PromptVariable[] = [
        { key: 'role', optional: false },
        { key: 'audience', optional: false },
        { key: 'tone', optional: true, default_value: 'professional' },
      ]
      const variables = { role: 'technical', audience: 'developers' }

      const result = replaceVariables(systemPrompt, variables, definitions)

      expect(result).toBe('You are a technical assistant for developers. Use professional tone.')
    })

    it('should use default_value when variable is not provided', () => {
      const systemPrompt = 'Respond in {language}.'
      const definitions: PromptVariable[] = [
        { key: 'language', optional: true, default_value: 'Vietnamese' },
      ]

      const result = replaceVariables(systemPrompt, {}, definitions)

      expect(result).toBe('Respond in Vietnamese.')
    })

    it('should replace with empty string when no value and no default', () => {
      const systemPrompt = 'Respond in {language}.'
      const definitions: PromptVariable[] = [
        { key: 'language', optional: true },
      ]

      const result = replaceVariables(systemPrompt, {}, definitions)

      expect(result).toBe('Respond in .')
    })

    it('should leave prompt unchanged when no variable definitions', () => {
      const systemPrompt = 'You are an assistant. {language} is used.'

      const result = replaceVariables(systemPrompt, { language: 'English' }, undefined)

      expect(result).toBe('You are an assistant. {language} is used.')
    })

    it('should leave prompt unchanged when variable definitions array is empty', () => {
      const systemPrompt = 'Hello {name}!'

      const result = replaceVariables(systemPrompt, { name: 'World' }, [])

      expect(result).toBe('Hello {name}!')
    })

    it('should replace all occurrences of the same variable', () => {
      const systemPrompt = 'Language: {language}. Please use {language} for all responses.'
      const definitions: PromptVariable[] = [
        { key: 'language', optional: false },
      ]
      const variables = { language: 'Japanese' }

      const result = replaceVariables(systemPrompt, variables, definitions)

      expect(result).toBe('Language: Japanese. Please use Japanese for all responses.')
    })

    it('should prefer user-provided value over default_value', () => {
      const systemPrompt = 'Respond in {language}.'
      const definitions: PromptVariable[] = [
        { key: 'language', optional: false, default_value: 'English' },
      ]
      const variables = { language: 'French' }

      const result = replaceVariables(systemPrompt, variables, definitions)

      expect(result).toBe('Respond in French.')
    })
  })

  describe('validateRequiredVariables', () => {
    it('should return missing required variable keys', () => {
      const definitions: PromptVariable[] = [
        { key: 'language', optional: false },
        { key: 'audience', optional: false },
        { key: 'tone', optional: true },
      ]

      const missing = validateRequiredVariables(definitions, {})

      expect(missing).toEqual(['language', 'audience'])
    })

    it('should return empty array when all required variables are provided', () => {
      const definitions: PromptVariable[] = [
        { key: 'language', optional: false },
        { key: 'audience', optional: false },
      ]
      const variables = { language: 'English', audience: 'developers' }

      const missing = validateRequiredVariables(definitions, variables)

      expect(missing).toEqual([])
    })

    it('should not flag required variables that have default_value', () => {
      const definitions: PromptVariable[] = [
        { key: 'language', optional: false, default_value: 'English' },
        { key: 'audience', optional: false },
      ]

      const missing = validateRequiredVariables(definitions, {})

      expect(missing).toEqual(['audience'])
    })

    it('should not flag optional variables without values', () => {
      const definitions: PromptVariable[] = [
        { key: 'tone', optional: true },
        { key: 'style', optional: true },
      ]

      const missing = validateRequiredVariables(definitions, {})

      expect(missing).toEqual([])
    })

    it('should return empty array when no definitions', () => {
      const missing = validateRequiredVariables([], {})

      expect(missing).toEqual([])
    })

    it('should handle undefined variables parameter', () => {
      const definitions: PromptVariable[] = [
        { key: 'language', optional: false },
      ]

      const missing = validateRequiredVariables(definitions, undefined)

      expect(missing).toEqual(['language'])
    })
  })
})
