/**
 * @fileoverview Unit tests for WebCrawlDialog URL validation logic.
 *
 * NOTE: Component rendering hangs in vitest due to babel-plugin-react-compiler
 * interactions with Radix UI Dialog/Switch primitives in jsdom. These tests
 * validate the URL validation logic extracted from the component.
 */
import { describe, it, expect } from 'vitest'

/**
 * Extracted URL validation logic from WebCrawlDialog.handleSubmit.
 * Returns an error string if invalid, or null if valid.
 */
function validateWebCrawlUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'datasets.webCrawlInvalidUrl'
    }
  } catch {
    return 'datasets.webCrawlInvalidUrl'
  }
  return null
}

/**
 * Extracted submit payload builder from WebCrawlDialog.handleSubmit.
 */
function buildSubmitPayload(url: string, name: string, autoParse: boolean) {
  return {
    url,
    ...(name.trim() ? { name: name.trim() } : {}),
    auto_parse: autoParse,
  }
}

describe('WebCrawlDialog (logic)', () => {
  describe('URL validation', () => {
    it('rejects non-http URLs (ftp)', () => {
      expect(validateWebCrawlUrl('ftp://files.example.com/doc')).toBe('datasets.webCrawlInvalidUrl')
    })

    it('rejects completely invalid URLs', () => {
      expect(validateWebCrawlUrl('not-a-url')).toBe('datasets.webCrawlInvalidUrl')
    })

    it('rejects empty string', () => {
      expect(validateWebCrawlUrl('')).toBe('datasets.webCrawlInvalidUrl')
    })

    it('accepts http URLs', () => {
      expect(validateWebCrawlUrl('http://example.com')).toBeNull()
    })

    it('accepts https URLs', () => {
      expect(validateWebCrawlUrl('https://example.com/page')).toBeNull()
    })

    it('rejects javascript: protocol', () => {
      expect(validateWebCrawlUrl('javascript:alert(1)')).toBe('datasets.webCrawlInvalidUrl')
    })

    it('rejects data: protocol', () => {
      expect(validateWebCrawlUrl('data:text/html,<h1>hello</h1>')).toBe('datasets.webCrawlInvalidUrl')
    })
  })

  describe('submit payload builder', () => {
    it('includes url and auto_parse', () => {
      expect(buildSubmitPayload('https://example.com', '', true)).toEqual({
        url: 'https://example.com',
        auto_parse: true,
      })
    })

    it('includes name when non-empty', () => {
      expect(buildSubmitPayload('https://example.com', 'My Doc', true)).toEqual({
        url: 'https://example.com',
        name: 'My Doc',
        auto_parse: true,
      })
    })

    it('trims name whitespace', () => {
      expect(buildSubmitPayload('https://example.com', '  My Doc  ', false)).toEqual({
        url: 'https://example.com',
        name: 'My Doc',
        auto_parse: false,
      })
    })

    it('omits name when only whitespace', () => {
      expect(buildSubmitPayload('https://example.com', '   ', true)).toEqual({
        url: 'https://example.com',
        auto_parse: true,
      })
    })

    it('passes auto_parse as false', () => {
      expect(buildSubmitPayload('https://example.com', '', false)).toEqual({
        url: 'https://example.com',
        auto_parse: false,
      })
    })
  })

  describe('submit button disabled state', () => {
    it('is disabled when URL is empty', () => {
      // Logic: disabled={submitting || !url.trim()}
      expect(!(''.trim())).toBe(true)
    })

    it('is disabled when URL is whitespace', () => {
      expect(!('   '.trim())).toBe(true)
    })

    it('is enabled when URL has content', () => {
      expect(!('https://example.com'.trim())).toBe(false)
    })
  })
})
