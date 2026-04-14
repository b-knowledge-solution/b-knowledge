/**
 * @fileoverview Language detection utility with Unicode script fallback.
 *
 * Uses the `franc` library as the primary detector and falls back to
 * Unicode code-point range heuristics when the detector returns unknown.
 * Provides a language instruction builder for system prompts.
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

const LANG_ENG = 'eng'
const LANG_FRA = 'fra'
const LANG_UND = 'und'
const FRANC_MIN_LENGTH = 3
const LATIN_LETTER_PATTERN = /[A-Za-z]/
const NON_ASCII_LATIN_PATTERN = /[\u00C0-\u024F]/
const FRENCH_DIACRITIC_PATTERN = /[\u00E0\u00E2\u00E7\u00E8\u00E9\u00EA\u00EB\u00EE\u00EF\u00F4\u00F9\u00FB\u00FC\u00FF\u0153\u00E6]/i
const ASCII_WORD_PATTERN = /[a-z']+/g
const ENGLISH_HINT_WORDS = new Set([
  'the', 'and', 'is', 'are', 'to', 'of', 'in', 'for', 'with', 'what', 'how',
  'why', 'where', 'when', 'can', 'could', 'should', 'would', 'please', 'help',
])
const FRENCH_HINT_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'et', 'est', 'que', 'pour', 'avec',
  'dans', 'sur', 'pas', 'plus', 'une', 'un', 'bonjour', 'merci',
])
const FRANC_SUPPORTED_LANGS = Object.keys(LANG_NAMES)

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
 * Uses franc as the primary detector for all inputs and falls back to
 * script detection when franc cannot determine the language.
 * @param {string} text - Input text to detect language for
 * @returns {string} ISO 639-3 language code (e.g., 'eng', 'vie', 'jpn')
 */
export function detectLanguage(text: string): string {
  // Empty or whitespace-only text defaults to English
  if (!text || text.trim().length === 0) return LANG_ENG

  // Use franc as the primary detector with a bounded language set.
  // Restricting candidates to our supported language map reduces noisy outputs.
  const detected = franc(text, {
    minLength: FRANC_MIN_LENGTH,
    only: FRANC_SUPPORTED_LANGS,
  })

  // Use script fallback only when franc cannot determine a language.
  if (detected === LANG_UND) {
    return detectByScript(text)
  }

  if (isLikelyEnglishOverFrench(text, detected)) {
    return LANG_ENG
  }

  return detected
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
  return LANG_ENG
}

/**
 * @description Determine whether Latin text should be treated as English even when franc predicts French.
 * Uses lightweight lexical hints to avoid common English->French false positives.
 * @param {string} text - Input text
 * @param {string} detected - Language code returned by franc
 * @returns {boolean} True when English evidence is stronger than French evidence
 */
function isLikelyEnglishOverFrench(text: string, detected: string): boolean {
  // Only apply this correction to the common fra/eng confusion pair.
  if (detected !== LANG_FRA) {
    return false
  }

  // Restrict correction to Latin-script text. Non-Latin languages should not be overridden.
  if (!LATIN_LETTER_PATTERN.test(text)) {
    return false
  }

  // French diacritics are strong evidence; keep French classification when present.
  if (FRENCH_DIACRITIC_PATTERN.test(text)) {
    return false
  }

  const normalized = text.toLowerCase()
  const tokens = normalized.match(ASCII_WORD_PATTERN) || []

  // For plain ASCII Latin text with no French hints, default to English.
  // This catches common product questions that franc occasionally labels as French.
  const englishHits = countHits(tokens, ENGLISH_HINT_WORDS)
  const frenchHits = countHits(tokens, FRENCH_HINT_WORDS)
  if (!NON_ASCII_LATIN_PATTERN.test(text) && frenchHits === 0) {
    return true
  }

  return englishHits > frenchHits
}

/**
 * @description Count the number of tokens that appear in a hint-word set.
 * @param {string[]} tokens - Tokenized lowercase words
 * @param {Set<string>} lexicon - Hint words to count
 * @returns {number} Number of matching tokens
 */
function countHits(tokens: string[], lexicon: Set<string>): number {
  let hits = 0
  for (const token of tokens) {
    if (lexicon.has(token)) {
      hits += 1
    }
  }
  return hits
}
