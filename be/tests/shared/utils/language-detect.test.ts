/**
 * @fileoverview Unit tests for language detection utility.
 */

import { describe, expect, it } from 'vitest'
import { detectLanguage } from '../../../src/shared/utils/language-detect.js'

describe('detectLanguage', () => {
  it('defaults to English for empty text', async () => {
    expect(await detectLanguage('   ')).toBe('eng')
  })

  it('detects Japanese via script on short text', async () => {
    expect(await detectLanguage('これは何ですか')).toBe('jpn')
  })

  it('keeps French for clear French text with diacritics', async () => {
    const french = 'Comment puis-je acceder aux donnees de l\'application et resoudre ce probleme tres rapidement ?'

    expect(await detectLanguage(french)).toBe('fra')
  })

  it('prefers English for plain ASCII English text that franc may misclassify', async () => {
    const english = 'How can I set up the data source and make the search work for users in production environment?'

    expect(await detectLanguage(english)).toBe('eng')
  })

  it('prefers English for ISO questions misclassified as German by franc', async () => {
    const english = 'what is ISO 13485'

    expect(await detectLanguage(english)).toBe('eng')
  })

  it.each([
    'hello',
    'test',
    'table',
    'config',
    'undefined',
    'documentation',
    'document',
    'important',
    'description',
    'solution',
    'administration',
  ])('prefers English for single Latin word "%s" that franc misclassifies', async (word) => {
    expect(await detectLanguage(word)).toBe('eng')
  })

  it.each([
    'explain compliance',
    'data source',
    'my documents',
    'sign up',
    'reset password',
    'find relevant sections',
  ])('prefers English for short ASCII phrase "%s"', async (phrase) => {
    expect(await detectLanguage(phrase)).toBe('eng')
  })
})
