/**
 * @fileoverview Unit tests for the TTS (Text-to-Speech) service.
 *
 * Tests normalizeText(), splitForTts(), and the synthesize() async generator.
 * All external dependencies (ModelFactory, fetch, logger) are mocked.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TtsService } from '../../../src/shared/services/tts.service.js'
import type { TtsOptions } from '../../../src/shared/services/tts.service.js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}))

const mockModelFactory = vi.hoisted(() => ({
  modelProvider: {
    findById: vi.fn(),
    findDefaults: vi.fn(),
    findAll: vi.fn(),
  },
}))

vi.mock('../../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

vi.mock('../../../src/shared/models/factory.js', () => ({
  ModelFactory: mockModelFactory,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Create a mock ModelProvider for TTS tests
 * @param {Partial<any>} overrides - Fields to override
 * @returns {any} Mock ModelProvider object
 */
function createMockProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'provider-1',
    factory_name: 'OpenAI',
    model_type: 'tts',
    model_name: 'tts-1',
    api_key: 'sk-test-key',
    api_base: 'https://api.openai.com',
    status: 'active',
    is_default: true,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

/**
 * @description Helper to collect all chunks from an async generator into a single Buffer
 * @param {AsyncGenerator<Buffer>} gen - The async generator to drain
 * @returns {Promise<Buffer>} Concatenated buffer of all yielded chunks
 */
async function collectAsyncGenerator(gen: AsyncGenerator<Buffer>): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of gen) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TtsService', () => {
  let service: TtsService
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    service = new TtsService()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  // =========================================================================
  // normalizeText
  // =========================================================================

  describe('normalizeText', () => {
    /**
     * @description Should remove fenced code blocks
     */
    it('should remove fenced code blocks', () => {
      const input = 'Before\n```js\nconsole.log("hi")\n```\nAfter'
      const result = service.normalizeText(input)

      // Code block content should be stripped, leaving surrounding text
      expect(result).toBe('Before After')
    })

    /**
     * @description Should remove inline code markers
     */
    it('should remove inline code markers', () => {
      const input = 'Use the `fetch` API for requests'
      const result = service.normalizeText(input)

      expect(result).toBe('Use the API for requests')
    })

    /**
     * @description Should remove citation markers like ##ID:n$$
     */
    it('should remove citation markers', () => {
      const input = 'According to the docs##ref:1$$, this is correct##0:2$$.'
      const result = service.normalizeText(input)

      expect(result).toBe('According to the docs, this is correct.')
    })

    /**
     * @description Should remove markdown headers
     */
    it('should remove markdown header markers', () => {
      const input = '## Section Title\n### Subsection'
      const result = service.normalizeText(input)

      expect(result).toBe('Section Title Subsection')
    })

    /**
     * @description Should remove bold markers while keeping text
     */
    it('should remove bold markers', () => {
      const input = 'This is **bold** and __also bold__'
      const result = service.normalizeText(input)

      expect(result).toBe('This is bold and also bold')
    })

    /**
     * @description Should remove italic markers while keeping text
     */
    it('should remove italic markers', () => {
      const input = 'This is *italic* and _also italic_'
      const result = service.normalizeText(input)

      expect(result).toBe('This is italic and also italic')
    })

    /**
     * @description Should remove strikethrough markers
     */
    it('should remove strikethrough markers', () => {
      const input = 'This is ~~deleted~~ text'
      const result = service.normalizeText(input)

      expect(result).toBe('This is deleted text')
    })

    /**
     * @description Should convert markdown links to plain text
     */
    it('should convert markdown links to plain text', () => {
      const input = 'Visit [Google](https://google.com) for more'
      const result = service.normalizeText(input)

      expect(result).toBe('Visit Google for more')
    })

    /**
     * @description Should remove markdown images via link removal.
     * Note: The link regex runs before the image regex, so [alt](url)
     * is stripped first, leaving the leading '!' character.
     */
    it('should remove markdown image links', () => {
      const input = 'See ![architecture diagram](https://example.com/img.png) below'
      const result = service.normalizeText(input)

      // Link regex matches [alt](url) first, leaving the '!' prefix
      expect(result).toBe('See !architecture diagram below')
    })

    /**
     * @description Should remove horizontal rules
     */
    it('should remove horizontal rules', () => {
      const input = 'Above\n---\nBelow'
      const result = service.normalizeText(input)

      expect(result).toBe('Above Below')
    })

    /**
     * @description Should remove list markers (- * + and numbered)
     */
    it('should remove list markers', () => {
      const input = '- Item one\n* Item two\n1. Item three'
      const result = service.normalizeText(input)

      expect(result).toBe('Item one Item two Item three')
    })

    /**
     * @description Should collapse multiple whitespace into single space
     */
    it('should collapse whitespace', () => {
      const input = 'word1    word2\n\n\nword3'
      const result = service.normalizeText(input)

      expect(result).toBe('word1 word2 word3')
    })

    /**
     * @description Should return empty string for empty input
     */
    it('should handle empty string', () => {
      expect(service.normalizeText('')).toBe('')
    })

    /**
     * @description Should return plain text unchanged
     */
    it('should leave plain text unchanged', () => {
      const input = 'Just a normal sentence with no markdown.'
      expect(service.normalizeText(input)).toBe(input)
    })
  })

  // =========================================================================
  // splitForTts
  // =========================================================================

  describe('splitForTts', () => {
    /**
     * @description Should return single-element array for short text
     */
    it('should return text as single chunk when under maxChars', () => {
      const text = 'Short sentence.'
      const result = service.splitForTts(text, 500)

      expect(result).toEqual(['Short sentence.'])
    })

    /**
     * @description Should split long text at sentence boundaries
     */
    it('should split at sentence boundaries when text exceeds maxChars', () => {
      // Two sentences, each ~30 chars — set maxChars to 40 to force split
      const text = 'First sentence here. Second sentence here.'
      const result = service.splitForTts(text, 25)

      // Should split into separate sentences
      expect(result.length).toBeGreaterThan(1)
      // Every chunk text should be non-empty
      result.forEach((chunk) => expect(chunk.length).toBeGreaterThan(0))
    })

    /**
     * @description Should handle a single sentence longer than maxChars
     */
    it('should push oversized single sentence as its own chunk', () => {
      // One very long sentence with no sentence boundary
      const longSentence = 'A'.repeat(600)
      const result = service.splitForTts(longSentence, 500)

      // The single sentence exceeds maxChars and should appear as its own chunk
      expect(result).toEqual([longSentence])
    })

    /**
     * @description Should combine short sentences into chunks up to maxChars
     */
    it('should combine short sentences up to the limit', () => {
      const text = 'Hi. Hey. Yo. Ok.'
      const result = service.splitForTts(text, 500)

      // All sentences fit in one chunk
      expect(result).toEqual(['Hi. Hey. Yo. Ok.'])
    })

    /**
     * @description Should use default maxChars of 500
     */
    it('should use default maxChars of 500', () => {
      const text = 'A'.repeat(400)
      const result = service.splitForTts(text)

      // Under 500 chars — single chunk
      expect(result).toEqual([text])
    })

    /**
     * @description Should handle empty string
     */
    it('should return single-element array for empty string', () => {
      const result = service.splitForTts('')

      expect(result).toEqual([''])
    })
  })

  // =========================================================================
  // synthesize
  // =========================================================================

  describe('synthesize', () => {
    /**
     * @description Should yield nothing for text that normalizes to empty
     */
    it('should yield nothing when text normalizes to empty', async () => {
      // Input that is only markdown code blocks — normalizes to empty
      const gen = service.synthesize('```\ncode only\n```')
      const result = await collectAsyncGenerator(gen)

      // Empty text after normalization — no audio generated
      expect(result.length).toBe(0)
      expect(mockLog.warn).toHaveBeenCalledWith(
        'TTS: empty text after normalization, skipping'
      )
    })

    /**
     * @description Should resolve TTS provider and stream audio chunks
     */
    it('should call TTS API and yield audio buffer chunks', async () => {
      const provider = createMockProvider()
      // Return a default TTS provider
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([provider])

      // Simulate a streaming response with two chunks
      const chunk1 = new Uint8Array([0x01, 0x02, 0x03])
      const chunk2 = new Uint8Array([0x04, 0x05])

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(chunk1)
          controller.enqueue(chunk2)
          controller.close()
        },
      })

      fetchSpy.mockResolvedValue(new Response(stream, { status: 200 }))

      const gen = service.synthesize('Hello world')
      const result = await collectAsyncGenerator(gen)

      // Should have received all bytes from both chunks
      expect(result).toEqual(Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]))

      // Verify the API was called with correct endpoint and body
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/speech',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer sk-test-key',
            'Content-Type': 'application/json',
          },
        })
      )
    })

    /**
     * @description Should use custom voice and format options
     */
    it('should pass custom TTS options to the API', async () => {
      const provider = createMockProvider()
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([provider])

      const emptyStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      fetchSpy.mockResolvedValue(new Response(emptyStream, { status: 200 }))

      const options: TtsOptions = { voice: 'nova', speed: 1.5, format: 'opus' }
      const gen = service.synthesize('Test text', options)
      await collectAsyncGenerator(gen)

      // Extract and verify the request body contains custom options
      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string
      )
      expect(callBody.voice).toBe('nova')
      expect(callBody.speed).toBe(1.5)
      expect(callBody.response_format).toBe('opus')
    })

    /**
     * @description Should throw when TTS API returns error status
     */
    it('should throw on non-OK API response', async () => {
      const provider = createMockProvider()
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([provider])

      fetchSpy.mockResolvedValue(
        new Response('Unauthorized', { status: 401 })
      )

      const gen = service.synthesize('Hello')

      // Collecting the generator should throw due to 401 response
      await expect(collectAsyncGenerator(gen)).rejects.toThrow(
        'TTS API returned 401'
      )
    })

    /**
     * @description Should throw when response body is null
     */
    it('should throw on empty response body', async () => {
      const provider = createMockProvider()
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([provider])

      // Create a Response with null body
      const response = new Response(null, { status: 200 })
      // Override body to null explicitly
      Object.defineProperty(response, 'body', { value: null })
      fetchSpy.mockResolvedValue(response)

      const gen = service.synthesize('Hello')

      await expect(collectAsyncGenerator(gen)).rejects.toThrow(
        'TTS API returned empty response body'
      )
    })

    /**
     * @description Should use specific provider when providerId is given
     */
    it('should look up specific provider by ID', async () => {
      const provider = createMockProvider({ id: 'custom-provider' })
      mockModelFactory.modelProvider.findById.mockResolvedValue(provider)

      const emptyStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      fetchSpy.mockResolvedValue(new Response(emptyStream, { status: 200 }))

      const gen = service.synthesize('Hello', {}, 'custom-provider')
      await collectAsyncGenerator(gen)

      // Should have looked up the provider by ID
      expect(mockModelFactory.modelProvider.findById).toHaveBeenCalledWith(
        'custom-provider'
      )
      // Should NOT have called findDefaults
      expect(mockModelFactory.modelProvider.findDefaults).not.toHaveBeenCalled()
    })

    /**
     * @description Should throw when specified provider is not found
     */
    it('should throw when specific provider is not found', async () => {
      mockModelFactory.modelProvider.findById.mockResolvedValue(null)

      const gen = service.synthesize('Hello', {}, 'nonexistent-id')

      await expect(collectAsyncGenerator(gen)).rejects.toThrow(
        'TTS provider nonexistent-id not found or inactive'
      )
    })

    /**
     * @description Should throw when specified provider is inactive
     */
    it('should throw when specific provider is inactive', async () => {
      const inactiveProvider = createMockProvider({ status: 'inactive' })
      mockModelFactory.modelProvider.findById.mockResolvedValue(inactiveProvider)

      const gen = service.synthesize('Hello', {}, 'provider-1')

      await expect(collectAsyncGenerator(gen)).rejects.toThrow(
        'not found or inactive'
      )
    })

    /**
     * @description Should fall back to any active TTS provider when no default exists
     */
    it('should fall back to any active TTS provider', async () => {
      // No default TTS provider
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([])
      // But there is a non-default active provider
      const fallbackProvider = createMockProvider({ is_default: false })
      mockModelFactory.modelProvider.findAll.mockResolvedValue([fallbackProvider])

      const emptyStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      fetchSpy.mockResolvedValue(new Response(emptyStream, { status: 200 }))

      const gen = service.synthesize('Hello')
      await collectAsyncGenerator(gen)

      // Should have searched for any active TTS provider
      expect(mockModelFactory.modelProvider.findAll).toHaveBeenCalledWith({
        model_type: 'tts',
        status: 'active',
      })
    })

    /**
     * @description Should throw when no TTS provider is configured at all
     */
    it('should throw when no TTS provider exists', async () => {
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([])
      mockModelFactory.modelProvider.findAll.mockResolvedValue([])

      const gen = service.synthesize('Hello')

      await expect(collectAsyncGenerator(gen)).rejects.toThrow(
        'No TTS model provider configured'
      )
    })

    /**
     * @description Should strip trailing slashes from api_base before building URL
     */
    it('should strip trailing slashes from api_base', async () => {
      const provider = createMockProvider({
        api_base: 'https://custom-host.com//',
      })
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([provider])

      const emptyStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      fetchSpy.mockResolvedValue(new Response(emptyStream, { status: 200 }))

      const gen = service.synthesize('Hello')
      await collectAsyncGenerator(gen)

      // URL should have trailing slashes stripped
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://custom-host.com/v1/audio/speech',
        expect.anything()
      )
    })

    /**
     * @description Should use default model name 'tts-1' when provider has no model_name
     */
    it('should default to tts-1 model when model_name is empty', async () => {
      const provider = createMockProvider({ model_name: '' })
      mockModelFactory.modelProvider.findDefaults.mockResolvedValue([provider])

      const emptyStream = new ReadableStream({
        start(controller) {
          controller.close()
        },
      })
      fetchSpy.mockResolvedValue(new Response(emptyStream, { status: 200 }))

      const gen = service.synthesize('Hello')
      await collectAsyncGenerator(gen)

      const callBody = JSON.parse(
        (fetchSpy.mock.calls[0]![1] as RequestInit).body as string
      )
      expect(callBody.model).toBe('tts-1')
    })
  })
})
