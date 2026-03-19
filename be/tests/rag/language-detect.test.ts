/**
 * @fileoverview Tests for language detection utility.
 *
 * Covers detectLanguage with multiple languages and short text Unicode
 * script fallback, buildLanguageInstruction for known/unknown codes,
 * and LANG_NAMES export shape.
 */

import { describe, expect, it } from 'vitest'
import { detectLanguage, buildLanguageInstruction, LANG_NAMES } from '../../src/shared/utils/language-detect'

describe('language-detect', () => {
  // ── detectLanguage ──────────────────────────────────────────────────

  describe('detectLanguage', () => {
    it('returns eng for English text', () => {
      expect(detectLanguage('Hello world, this is a test sentence')).toBe('eng')
    })

    it('returns vie for Vietnamese text', () => {
      // Vietnamese text with diacritical marks that franc can identify
      expect(detectLanguage('Xin chào các bạn, hôm nay là một ngày đẹp trời')).toBe('vie')
    })

    it('returns eng for very short text with no script match', () => {
      // Text too short for franc, no distinctive Unicode script
      expect(detectLanguage('short')).toBe('eng')
    })

    it('returns eng for very short ambiguous text', () => {
      expect(detectLanguage('abc')).toBe('eng')
    })

    it('returns cmn for short CJK text via script detection', () => {
      // Chinese characters, under 20 chars
      expect(detectLanguage('你好世界')).toBe('cmn')
    })

    it('returns jpn for short Hiragana/Katakana text via script detection', () => {
      expect(detectLanguage('こんにちは')).toBe('jpn')
    })

    it('returns kor for short Hangul text via script detection', () => {
      expect(detectLanguage('안녕하세요')).toBe('kor')
    })

    it('returns rus for short Cyrillic text via script detection', () => {
      expect(detectLanguage('Привет')).toBe('rus')
    })

    it('returns ara for short Arabic text via script detection', () => {
      expect(detectLanguage('مرحبا')).toBe('ara')
    })

    it('returns tha for short Thai text via script detection', () => {
      expect(detectLanguage('สวัสดี')).toBe('tha')
    })

    it('handles empty string gracefully', () => {
      // Empty string should fall back to eng
      expect(detectLanguage('')).toBe('eng')
    })
  })

  // ── buildLanguageInstruction ────────────────────────────────────────

  describe('buildLanguageInstruction', () => {
    it('returns instruction containing English for eng code', () => {
      const result = buildLanguageInstruction('eng')
      expect(result).toContain('English')
      expect(result).toContain('IMPORTANT')
    })

    it('returns instruction containing Vietnamese for vie code', () => {
      const result = buildLanguageInstruction('vie')
      expect(result).toContain('Vietnamese')
    })

    it('returns fallback for unknown language code', () => {
      const result = buildLanguageInstruction('unknown_code')
      expect(result).toContain('the same language as the user')
    })
  })

  // ── LANG_NAMES ──────────────────────────────────────────────────────

  describe('LANG_NAMES', () => {
    it('has expected language mappings', () => {
      expect(LANG_NAMES['eng']).toBe('English')
      expect(LANG_NAMES['vie']).toBe('Vietnamese')
      expect(LANG_NAMES['jpn']).toBe('Japanese')
      expect(LANG_NAMES['cmn']).toBe('Chinese')
      expect(LANG_NAMES['kor']).toBe('Korean')
      expect(LANG_NAMES['rus']).toBe('Russian')
      expect(LANG_NAMES['ara']).toBe('Arabic')
      expect(LANG_NAMES['tha']).toBe('Thai')
    })
  })
})
