/**
 * @fileoverview Language detection utility with Unicode script fallback.
 *
 * Uses the `franc` library for long text (>= 20 chars) and falls back to
 * Unicode code-point range heuristics for short text. Provides a language
 * instruction builder for system prompts.
 *
 * @module shared/utils/language-detect
 */

import { franc } from 'franc'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * @description Mapping of ISO 639-3 language codes to human-readable names.
 * Used by buildLanguageInstruction and available for display purposes.
 */
export const LANG_NAMES: Record<string, string> = {
  eng: 'English',
  vie: 'Vietnamese',
  jpn: 'Japanese',
  cmn: 'Chinese',
  kor: 'Korean',
  fra: 'French',
  deu: 'German',
  spa: 'Spanish',
  ara: 'Arabic',
  rus: 'Russian',
  tha: 'Thai',
}

// Unicode range checkers for short-text script detection
const SCRIPT_RANGES: Array<{ test: (ch: number) => boolean; lang: string }> = [
  // CJK Unified Ideographs (Chinese)
  { test: (cp) => cp >= 0x4E00 && cp <= 0x9FFF, lang: 'cmn' },
  // Hangul Syllables (Korean)
  { test: (cp) => cp >= 0xAC00 && cp <= 0xD7AF, lang: 'kor' },
  // Hiragana + Katakana (Japanese)
  { test: (cp) => cp >= 0x3040 && cp <= 0x30FF, lang: 'jpn' },
  // Cyrillic (Russian)
  { test: (cp) => cp >= 0x0400 && cp <= 0x04FF, lang: 'rus' },
  // Arabic
  { test: (cp) => cp >= 0x0600 && cp <= 0x06FF, lang: 'ara' },
  // Thai
  { test: (cp) => cp >= 0x0E00 && cp <= 0x0E7F, lang: 'tha' },
]

// Vietnamese diacritical marks that distinguish it from plain Latin
const VIETNAMESE_PATTERN = /[\u0300-\u036f\u0102\u0103\u0110\u0111\u01A0\u01A1\u01AF\u01B0]/

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @description Detect the language of the given text.
 * For short text (< 20 chars), uses Unicode script range heuristics.
 * For longer text, delegates to the franc trigram-based detector.
 * @param {string} text - Input text to detect language for
 * @returns {string} ISO 639-3 language code (e.g., 'eng', 'vie', 'jpn')
 */
export function detectLanguage(text: string): string {
  // Empty or whitespace-only text defaults to English
  if (!text || text.trim().length === 0) return 'eng'

  // Short text: use Unicode script detection since trigram detection is unreliable
  if (text.length < 20) {
    return detectByScript(text)
  }

  // Long text: use franc trigram-based detection
  const detected = franc(text)
  // franc returns 'und' when it cannot determine the language
  return detected === 'und' ? 'eng' : detected
}

/**
 * @description Build a system prompt instruction telling the LLM to respond
 * in the specified language. Returns a strong directive designed to be prepended
 * to the system prompt before any knowledge context.
 * @param {string} langCode - ISO 639-3 language code
 * @returns {string} Instruction string for inclusion in system prompts
 */
export function buildLanguageInstruction(langCode: string): string {
  const name = LANG_NAMES[langCode] || 'the same language as the user'
  return `## Response Language Requirement
IMPORTANT: You MUST respond entirely in ${name}.
- All answers, explanations, summaries, and citations MUST be written in ${name}.
- Even if the knowledge context below is in a different language, you MUST still answer in ${name}.
- Translate any referenced information into ${name} when composing your response.
- Do NOT switch languages mid-response.`
}

/**
 * @description Build a short language reminder to append after the knowledge context.
 * Uses a "sandwich" technique — language instruction at both start and end of the prompt —
 * to prevent large knowledge contexts in other languages from overriding the language directive.
 * @param {string} langCode - ISO 639-3 language code
 * @returns {string} Reminder string to append after knowledge context
 */
export function buildLanguageReminder(langCode: string): string {
  const name = LANG_NAMES[langCode] || 'the same language as the user'
  return `\nREMINDER: Regardless of the language of the knowledge context above, you MUST respond in ${name}.`
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * @description Detect language from Unicode script ranges for short text.
 * Scans code points and returns the language of the first matching script.
 * @param {string} text - Short input text
 * @returns {string} ISO 639-3 language code
 */
function detectByScript(text: string): string {
  // Check for Vietnamese diacritical marks first (Latin-based script with marks)
  if (VIETNAMESE_PATTERN.test(text)) return 'vie'

  // Scan each character's code point against known script ranges
  for (const char of text) {
    const cp = char.codePointAt(0)!
    for (const range of SCRIPT_RANGES) {
      if (range.test(cp)) return range.lang
    }
  }

  // No distinctive script found — default to English
  return 'eng'
}
