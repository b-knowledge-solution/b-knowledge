/**
 * @fileoverview Tests for the shared OpenAI format service.
 *
 * Validates that buildOaiCompletion, buildOaiStreamChunk, and
 * extractLastUserMessage produce correct OpenAI-compatible structures.
 */

import { describe, expect, it } from 'vitest'
import {
  buildOaiCompletion,
  buildOaiStreamChunk,
  extractLastUserMessage,
} from '../../../src/shared/services/openai-format.service'

// ---------------------------------------------------------------------------
// buildOaiCompletion
// ---------------------------------------------------------------------------

describe('buildOaiCompletion', () => {
  it('should return a valid OpenAI chat completion structure', () => {
    const result = buildOaiCompletion('Hello world', 'test-model')

    expect(result.object).toBe('chat.completion')
    expect(result.model).toBe('test-model')
    expect(result.id).toMatch(/^chatcmpl-/)
    expect(result.created).toBeTypeOf('number')
    expect(result.choices).toHaveLength(1)
    expect(result.choices[0].index).toBe(0)
    expect(result.choices[0].message.role).toBe('assistant')
    expect(result.choices[0].message.content).toBe('Hello world')
    expect(result.choices[0].finish_reason).toBe('stop')
  })

  it('should include default zero usage when no usage provided', () => {
    const result = buildOaiCompletion('answer', 'model')

    expect(result.usage).toEqual({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    })
  })

  it('should include provided usage with computed total_tokens', () => {
    const result = buildOaiCompletion('answer', 'model', {
      prompt_tokens: 100,
      completion_tokens: 50,
    })

    expect(result.usage.prompt_tokens).toBe(100)
    expect(result.usage.completion_tokens).toBe(50)
    expect(result.usage.total_tokens).toBe(150)
  })

  it('should use explicit total_tokens when provided', () => {
    const result = buildOaiCompletion('answer', 'model', {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 200,
    })

    expect(result.usage.total_tokens).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// buildOaiStreamChunk
// ---------------------------------------------------------------------------

describe('buildOaiStreamChunk', () => {
  it('should format a content delta as SSE data line', () => {
    const sseStr = buildOaiStreamChunk('chatcmpl-123', 'Hello', 'test-model', false)

    // Should be SSE format: "data: {...}\n\n"
    expect(sseStr).toMatch(/^data: \{.*\}\n\n$/)

    const jsonStr = sseStr.slice(6, -2) // Remove "data: " prefix and "\n\n" suffix
    const parsed = JSON.parse(jsonStr)

    expect(parsed.id).toBe('chatcmpl-123')
    expect(parsed.object).toBe('chat.completion.chunk')
    expect(parsed.model).toBe('test-model')
    expect(parsed.choices).toHaveLength(1)
    expect(parsed.choices[0].delta.content).toBe('Hello')
    expect(parsed.choices[0].finish_reason).toBeNull()
  })

  it('should format final chunk with finish_reason stop and [DONE] sentinel', () => {
    const sseStr = buildOaiStreamChunk('chatcmpl-123', '', 'test-model', true)

    // Should contain the final chunk and the [DONE] sentinel
    expect(sseStr).toContain('finish_reason')
    expect(sseStr).toContain('"stop"')
    expect(sseStr).toContain('data: [DONE]')

    // Extract the first data line (the JSON chunk)
    const lines = sseStr.split('\n\n').filter(Boolean)
    expect(lines.length).toBe(2) // final chunk + [DONE]

    const jsonStr = lines[0].replace('data: ', '')
    const parsed = JSON.parse(jsonStr)

    expect(parsed.choices[0].delta).toEqual({})
    expect(parsed.choices[0].finish_reason).toBe('stop')
  })

  it('should include created timestamp as number', () => {
    const sseStr = buildOaiStreamChunk('id', 'content', 'model', false)
    const jsonStr = sseStr.slice(6, -2)
    const parsed = JSON.parse(jsonStr)

    expect(parsed.created).toBeTypeOf('number')
    // Should be a reasonable Unix timestamp (after 2020)
    expect(parsed.created).toBeGreaterThan(1577836800)
  })
})

// ---------------------------------------------------------------------------
// extractLastUserMessage
// ---------------------------------------------------------------------------

describe('extractLastUserMessage', () => {
  it('should return the content of the last user message', () => {
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'First question' },
      { role: 'assistant' as const, content: 'First answer' },
      { role: 'user' as const, content: 'Second question' },
    ]

    expect(extractLastUserMessage(messages)).toBe('Second question')
  })

  it('should return the only user message when there is just one', () => {
    const messages = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'Only question' },
    ]

    expect(extractLastUserMessage(messages)).toBe('Only question')
  })

  it('should return null when no user messages exist', () => {
    const messages = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'assistant' as const, content: 'An answer' },
    ]

    expect(extractLastUserMessage(messages)).toBeNull()
  })

  it('should return null for empty messages array', () => {
    expect(extractLastUserMessage([])).toBeNull()
  })

  it('should return null for non-array input', () => {
    expect(extractLastUserMessage(null as any)).toBeNull()
    expect(extractLastUserMessage(undefined as any)).toBeNull()
  })

  it('should skip user messages with empty content', () => {
    const messages = [
      { role: 'user' as const, content: '' },
      { role: 'user' as const, content: 'Valid question' },
      { role: 'user' as const, content: '' },
    ]

    // Last non-empty user message
    expect(extractLastUserMessage(messages)).toBe('Valid question')
  })
})
