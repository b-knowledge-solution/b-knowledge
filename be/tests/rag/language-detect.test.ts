/**
 * @fileoverview Tests for language detection utility.
 *
 * Covers detectLanguage with multiple languages and short text Unicode
 * script fallback, buildLanguageInstruction for known/unknown codes,
 * and LANG_NAMES export shape.
 */

import { describe, expect, it } from 'vitest'
import { detectLanguage, buildLanguageInstruction, buildLanguageReminder, LANG_NAMES } from '../../src/shared/utils/language-detect'

describe('language-detect', () => {
  // ── detectLanguage ──────────────────────────────────────────────────

  describe('detectLanguage', () => {
    it.each([
      {
        langCode: 'eng',
        text: 'Please explain how quality management works for medical device teams.',
      },
      {
        langCode: 'vie',
        text: 'Tiêu chuẩn này giúp doanh nghiệp cải tiến quy trình quản lý chất lượng.',
      },
      {
        langCode: 'jpn',
        text: 'この仕様書は品質管理の手順をわかりやすく説明しています。',
      },
      {
        langCode: 'cmn',
        text: '这个标准用于指导医疗器械质量管理体系的建立和改进。',
      },
      {
        langCode: 'kor',
        text: '이 표준은 의료기기 품질경영 시스템 구축에 필요한 요구사항을 설명합니다.',
      },
      {
        langCode: 'fra',
        text: 'Cette norme de qualite aide les equipes a structurer leurs procedures efficacement.',
      },
      {
        langCode: 'deu',
        text: 'Diese Norm unterstützt Unternehmen beim Aufbau eines Qualitätsmanagementsystems.',
      },
      {
        langCode: 'spa',
        text: 'Esta norma ayuda a las empresas a mejorar su sistema de gestion de calidad.',
      },
      {
        langCode: 'ara',
        text: 'يساعد هذا المعيار المؤسسات على تحسين نظام إدارة الجودة بشكل مستمر.',
      },
      {
        langCode: 'rus',
        text: 'Этот стандарт помогает организациям улучшать систему менеджмента качества.',
      },
      {
        langCode: 'tha',
        text: 'มาตรฐานนี้ช่วยให้องค์กรพัฒนาระบบการจัดการคุณภาพอย่างต่อเนื่อง',
      },
    ])('returns $langCode for representative text', async ({ langCode, text }) => {
      expect(await detectLanguage(text)).toBe(langCode)
    })

    it('returns eng for English text', async () => {
      expect(await detectLanguage('Hello world, this is a test sentence')).toBe('eng')
    })

    it('returns eng for ISO question that franc may classify as deu', async () => {
      expect(await detectLanguage('what is ISO 13485')).toBe('eng')
    })

    it('returns vie for Vietnamese text', async () => {
      // Vietnamese text with diacritical marks that franc can identify
      expect(await detectLanguage('Xin chào các bạn, hôm nay là một ngày đẹp trời')).toBe('vie')
    })

    it('returns eng for very short text with no script match', async () => {
      // Text too short for franc, no distinctive Unicode script
      expect(await detectLanguage('short')).toBe('eng')
    })

    it('returns eng for very short ambiguous text', async () => {
      expect(await detectLanguage('abc')).toBe('eng')
    })

    it('returns cmn for short CJK text via script detection', async () => {
      // Chinese characters, under 20 chars
      expect(await detectLanguage('你好世界')).toBe('cmn')
    })

    it('returns jpn for short Hiragana/Katakana text via script detection', async () => {
      expect(await detectLanguage('こんにちは')).toBe('jpn')
    })

    it('returns kor for short Hangul text via script detection', async () => {
      expect(await detectLanguage('안녕하세요')).toBe('kor')
    })

    it('returns rus for short Cyrillic text via script detection', async () => {
      expect(await detectLanguage('Привет')).toBe('rus')
    })

    it('returns ara for short Arabic text via script detection', async () => {
      expect(await detectLanguage('مرحبا')).toBe('ara')
    })

    it('returns tha for short Thai text via script detection', async () => {
      expect(await detectLanguage('สวัสดี')).toBe('tha')
    })

    it('returns eng for English text mixed with numbers and punctuation', async () => {
      expect(await detectLanguage('Can you summarize ISO 13485:2016 requirements for SMEs?')).toBe('eng')
    })

    it('returns eng for mixed-case ASCII product question', async () => {
      expect(await detectLanguage('WHAT is the best way to deploy this API in production')).toBe('eng')
    })

    it.each([
      'hello', 'test', 'table', 'config', 'undefined', 'documentation',
      'document', 'important', 'description', 'solution', 'administration',
      'application', 'information', 'production', 'attention', 'analyse',
    ])('returns eng for single Latin word "%s" misclassified by franc', async (word) => {
      expect(await detectLanguage(word)).toBe('eng')
    })

    it.each([
      'explain compliance',
      'data source',
      'my documents',
      'sign up',
      'reset password',
      'find relevant sections',
      'summarize this document',
    ])('returns eng for short ASCII phrase "%s"', async (phrase) => {
      expect(await detectLanguage(phrase)).toBe('eng')
    })

    it('keeps deu when German-specific diacritics are present', async () => {
      expect(await detectLanguage('Wie können wir die Qualität überführen und Prüfgrößen erhöhen?')).toBe('deu')
    })

    it('keeps spa when Spanish-specific punctuation and accents are present', async () => {
      expect(await detectLanguage('¿Cómo mejorar la gestión de calidad en producción?')).toBe('spa')
    })

    it('keeps fra when French diacritics are present', async () => {
      expect(await detectLanguage('Comment améliorer la qualité des données dans l\u2019application ?')).toBe('fra')
    })

    it('handles empty string gracefully', async () => {
      // Empty string should fall back to eng
      expect(await detectLanguage('')).toBe('eng')
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

    it('includes multi-line directive with cross-language knowledge handling', () => {
      const result = buildLanguageInstruction('jpn')
      // Should instruct to respond in Japanese even if context is in another language
      expect(result).toContain('Japanese')
      expect(result).toContain('Even if the knowledge context below is in a different language')
      expect(result).toContain('Do NOT switch languages mid-response')
    })
  })

  // ── buildLanguageReminder ──────────────────────────────────────────

  describe('buildLanguageReminder', () => {
    it('returns reminder containing the target language name', () => {
      const result = buildLanguageReminder('vie')
      expect(result).toContain('Vietnamese')
      expect(result).toContain('REMINDER')
    })

    it('mentions overriding knowledge context language', () => {
      const result = buildLanguageReminder('jpn')
      expect(result).toContain('Regardless of the language of the knowledge context')
      expect(result).toContain('Japanese')
    })

    it('returns fallback for unknown language code', () => {
      const result = buildLanguageReminder('xyz')
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

    it('contains all supported language codes used by detector', () => {
      expect(Object.keys(LANG_NAMES).sort()).toEqual([
        'ara',
        'cmn',
        'deu',
        'eng',
        'fra',
        'jpn',
        'kor',
        'rus',
        'spa',
        'tha',
        'vie',
      ])
    })
  })
})
