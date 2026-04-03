/**
 * @fileoverview Tests for shared RAG query utilities: expandCrossLanguage and extractKeywords.
 * These helpers are used by both chat and search pipelines for cross-language expansion
 * and keyword extraction via LLM.
 *
 * Since the service file (rag-query.service.ts) is created in Phase 2, these tests
 * use inline implementations matching the planned logic to validate behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock logger
vi.mock('../../../src/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

/** @description Mock for llmClientService.chatCompletion */
const mockChatCompletion = vi.fn()

/**
 * @description Inline implementation of expandCrossLanguage matching the planned
 * rag-query.service.ts behavior. Calls LLM to translate query into target languages,
 * then appends translations to the original query.
 * @param query - Original search query
 * @param languages - Target language codes (e.g., ['vi', 'ja'])
 * @param providerId - LLM provider ID
 * @returns Expanded query with translations appended
 */
async function expandCrossLanguage(
  query: string,
  languages: string[],
  providerId: string,
): Promise<string> {
  if (!languages || languages.length === 0) return query

  try {
    const response = await mockChatCompletion(
      {
        messages: [
          { role: 'system', content: 'Translate the following query into the specified languages. Return JSON with translations array.' },
          { role: 'user', content: `Query: "${query}"\nLanguages: ${languages.join(', ')}` },
        ],
      },
      providerId,
      undefined,
    )

    const content = response?.choices?.[0]?.message?.content
    if (!content) return query

    const parsed = JSON.parse(content)
    if (!parsed.translations || !Array.isArray(parsed.translations)) return query

    const translations = parsed.translations.map((t: { text: string }) => t.text)
    return [query, ...translations].join(' ')
  } catch {
    return query
  }
}

/**
 * @description Inline implementation of extractKeywords matching the planned
 * rag-query.service.ts behavior. Calls LLM to extract keywords from the query.
 * @param query - User's search query
 * @param providerId - LLM provider ID
 * @returns Array of extracted keywords, or empty array on failure
 */
async function extractKeywords(
  query: string,
  providerId: string,
): Promise<string[]> {
  try {
    const response = await mockChatCompletion(
      {
        messages: [
          { role: 'system', content: 'Extract keywords from the query. Return JSON with keywords array.' },
          { role: 'user', content: query },
        ],
      },
      providerId,
      undefined,
    )

    const content = response?.choices?.[0]?.message?.content
    if (!content) return []

    const parsed = JSON.parse(content)
    if (!parsed.keywords || !Array.isArray(parsed.keywords)) return []

    return parsed.keywords
  } catch {
    return []
  }
}

describe('rag-query.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('expandCrossLanguage', () => {
    it('should append translations when LLM returns valid response', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({
              translations: [
                { language: 'vi', text: 'xin chao' },
                { language: 'ja', text: 'konnichiwa' },
              ],
            }),
          },
        }],
      })

      const result = await expandCrossLanguage('hello', ['vi', 'ja'], 'provider-1')

      expect(result).toContain('hello')
      expect(result).toContain('xin chao')
      expect(result).toContain('konnichiwa')
      expect(mockChatCompletion).toHaveBeenCalledTimes(1)
      expect(mockChatCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user', content: expect.stringContaining('hello') }),
          ]),
        }),
        'provider-1',
        undefined,
      )
    })

    it('should return original query when LLM throws an error', async () => {
      mockChatCompletion.mockRejectedValue(new Error('LLM service unavailable'))

      const result = await expandCrossLanguage('hello world', ['vi', 'ja'], 'provider-1')

      expect(result).toBe('hello world')
    })

    it('should return original query when languages array is empty', async () => {
      const result = await expandCrossLanguage('hello world', [], 'provider-1')

      expect(result).toBe('hello world')
      expect(mockChatCompletion).not.toHaveBeenCalled()
    })

    it('should return original query when LLM returns malformed JSON', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{
          message: { content: 'not valid json' },
        }],
      })

      const result = await expandCrossLanguage('test query', ['vi'], 'provider-1')

      expect(result).toBe('test query')
    })

    it('should return original query when LLM returns empty choices', async () => {
      mockChatCompletion.mockResolvedValue({ choices: [] })

      const result = await expandCrossLanguage('test query', ['vi'], 'provider-1')

      expect(result).toBe('test query')
    })

    it('should return original query when LLM returns null response', async () => {
      mockChatCompletion.mockResolvedValue(null)

      const result = await expandCrossLanguage('test query', ['vi'], 'provider-1')

      expect(result).toBe('test query')
    })

    it('should return original query when translations field is missing', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{
          message: { content: JSON.stringify({ result: 'no translations field' }) },
        }],
      })

      const result = await expandCrossLanguage('test query', ['vi'], 'provider-1')

      expect(result).toBe('test query')
    })
  })

  describe('extractKeywords', () => {
    it('should return keyword array on successful extraction', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify({ keywords: ['machine', 'learning', 'AI'] }),
          },
        }],
      })

      const result = await extractKeywords('What is machine learning in AI?', 'provider-1')

      expect(result).toEqual(['machine', 'learning', 'AI'])
      expect(mockChatCompletion).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when LLM throws an error', async () => {
      mockChatCompletion.mockRejectedValue(new Error('LLM timeout'))

      const result = await extractKeywords('some query', 'provider-1')

      expect(result).toEqual([])
    })

    it('should return empty array when LLM returns malformed response', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{
          message: { content: '{ invalid }' },
        }],
      })

      const result = await extractKeywords('some query', 'provider-1')

      expect(result).toEqual([])
    })

    it('should return empty array when LLM returns empty choices', async () => {
      mockChatCompletion.mockResolvedValue({ choices: [] })

      const result = await extractKeywords('some query', 'provider-1')

      expect(result).toEqual([])
    })

    it('should return empty array when keywords field is missing', async () => {
      mockChatCompletion.mockResolvedValue({
        choices: [{
          message: { content: JSON.stringify({ result: 'no keywords' }) },
        }],
      })

      const result = await extractKeywords('some query', 'provider-1')

      expect(result).toEqual([])
    })

    it('should return empty array when response is null', async () => {
      mockChatCompletion.mockResolvedValue(null)

      const result = await extractKeywords('some query', 'provider-1')

      expect(result).toEqual([])
    })
  })
})
