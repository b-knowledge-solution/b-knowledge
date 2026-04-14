/**
 * @fileoverview Unit tests for language detection utility.
 */

import { describe, expect, it } from 'vitest'
import { detectLanguage } from '../../../src/shared/utils/language-detect.js'

describe('detectLanguage', () => {
  it('defaults to English for empty text', () => {
    expect(detectLanguage('   ')).toBe('eng')
  })

  it('detects Japanese via script on short text', () => {
    expect(detectLanguage('これは何ですか')).toBe('jpn')
  })

  it('keeps French for clear French text with diacritics', () => {
    const french = 'Comment puis-je acceder aux donnees de l\'application et resoudre ce probleme tres rapidement ?'

    expect(detectLanguage(french)).toBe('fra')
  })

  it('prefers English for plain ASCII English text that franc may misclassify', () => {
    const english = 'How can I set up the data source and make the search work for users in production environment?'

    expect(detectLanguage(english)).toBe('eng')
  })
})
