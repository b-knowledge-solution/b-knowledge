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
import { config } from '@/shared/config/index.js'
import { log } from '@/shared/services/logger.service.js'

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
const LANG_DEU = 'deu'
const LANG_SPA = 'spa'
const LANG_UND = 'und'
const FRANC_MIN_LENGTH = 3
const LATIN_LETTER_PATTERN = /[A-Za-z]/
const NON_ASCII_LATIN_PATTERN = /[\u00C0-\u024F]/
const FRENCH_DIACRITIC_PATTERN = /[\u00E0\u00E2\u00E7\u00E8\u00E9\u00EA\u00EB\u00EE\u00EF\u00F4\u00F9\u00FB\u00FC\u00FF\u0153\u00E6]/i
const GERMAN_DIACRITIC_PATTERN = /[\u00E4\u00F6\u00FC\u00DF]/i
const SPANISH_DIACRITIC_PATTERN = /[\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1\u00FC\u00BF\u00A1]/i
const ASCII_WORD_PATTERN = /[a-z']+/g
const ENGLISH_HINT_WORDS = new Set([
  'the', 'and', 'is', 'are', 'to', 'of', 'in', 'for', 'with', 'what', 'how',
  'why', 'where', 'when', 'can', 'could', 'should', 'would', 'please', 'help',
])
const FRENCH_HINT_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'et', 'est', 'que', 'pour', 'avec',
  'dans', 'sur', 'pas', 'plus', 'une', 'un', 'bonjour', 'merci',
])
const GERMAN_HINT_WORDS = new Set([
  'der', 'die', 'das', 'und', 'ist', 'wie', 'was', 'nicht', 'mit', 'fuer',
  'für', 'ein', 'eine', 'den', 'dem', 'dass',
])
const SPANISH_HINT_WORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'es', 'que', 'para', 'con',
  'por', 'una', 'un', 'como', 'hola', 'gracias',
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

// Sentence boundary pattern — splits on . ? ! or newline to extract the first sentence
const SENTENCE_BOUNDARY_PATTERN = /[.?!\n]/
const SUPPORTED_LANG_CODES = new Set(Object.keys(LANG_NAMES))
const LLM_DETECT_MAX_TOKENS = 10
const LLM_DETECT_TEMPERATURE = 0

/** @description System prompt for LLM-based language detection. Kept minimal to reduce token usage. */
const LLM_DETECT_SYSTEM_PROMPT = `Detect the language of the user's text. Respond with ONLY the ISO 639-3 code. Supported codes: ${Object.keys(LANG_NAMES).join(', ')}. If unsure, respond: eng`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @description Detect the language of the given text.
 * Dispatches to builtin (franc + heuristics) or LLM-based detection depending
 * on the LANGUAGE_DETECT_METHOD env var. LLM mode sends only the first sentence
 * to minimise token usage and latency, falling back to builtin on error.
 * @param {string} text - Input text to detect language for
 * @returns {Promise<string>} ISO 639-3 language code (e.g., 'eng', 'vie', 'jpn')
 */
export async function detectLanguage(text: string): Promise<string> {
  // When FORCE_LANGUAGE is set (e.g. 'eng'), bypass detection entirely — useful for demos.
  if (config.forceLanguage) return config.forceLanguage

  // Empty or whitespace-only text defaults to English
  if (!text || text.trim().length === 0) return LANG_ENG

  // LLM-based detection when configured, with builtin fallback on failure
  if (config.languageDetectMethod === 'llm') {
    try {
      return await detectByLlm(text)
    } catch (err) {
      log.warn('LLM language detection failed, falling back to builtin', {
        error: (err as Error).message,
      })
    }
  }

  return detectByBuiltin(text)
}

/**
 * @description Builtin language detection using franc trigram analysis with heuristic overrides.
 * @param {string} text - Input text to detect language for
 * @returns {string} ISO 639-3 language code
 */
function detectByBuiltin(text: string): string {
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

  if (isLikelyEnglishFromLatinMisclassification(text, detected)) {
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
 * @description Detect language via a lightweight LLM call. Extracts only the first sentence
 * from the user query to minimise token usage and latency. Falls back to builtin on
 * any error or unrecognised response.
 * @param {string} text - Full user query text
 * @returns {Promise<string>} ISO 639-3 language code
 */
async function detectByLlm(text: string): Promise<string> {
  // Lazy-import to avoid circular dependency (llm-client depends on config → models → DB)
  const { llmClientService } = await import('@/shared/services/llm-client.service.js')

  // Extract only the first sentence to keep the LLM call tiny (~5-20 tokens)
  const firstSentence = extractFirstSentence(text)

  const response = await llmClientService.chatCompletion(
    [
      { role: 'system', content: LLM_DETECT_SYSTEM_PROMPT },
      { role: 'user', content: firstSentence },
    ],
    { temperature: LLM_DETECT_TEMPERATURE, max_tokens: LLM_DETECT_MAX_TOKENS },
  )

  // Parse the LLM response — expect a single ISO 639-3 code, possibly with whitespace
  const code = response.trim().toLowerCase()
  if (SUPPORTED_LANG_CODES.has(code)) {
    return code
  }

  // LLM returned something unexpected; fall back to builtin
  log.warn('LLM returned unrecognised language code, falling back to builtin', { llm_response: code })
  return detectByBuiltin(text)
}

/**
 * @description Extract the first sentence from user text for efficient LLM detection.
 * Splits on common sentence boundaries (. ? ! newline) and returns the first segment.
 * @param {string} text - Full user text
 * @returns {string} First sentence, trimmed
 */
function extractFirstSentence(text: string): string {
  const trimmed = text.trim()
  const match = SENTENCE_BOUNDARY_PATTERN.exec(trimmed)
  // Return the portion before the first boundary, or the full text if no boundary found
  const sentence = match ? trimmed.slice(0, match.index + 1) : trimmed
  return sentence.trim()
}

/**
 * @description Determine whether Latin text should be treated as English when franc predicts another Latin language.
 * Uses lightweight lexical hints to avoid common English misclassifications.
 * @param {string} text - Input text
 * @param {string} detected - Language code returned by franc
 * @returns {boolean} True when English evidence is stronger than predicted-language evidence
 */
function isLikelyEnglishFromLatinMisclassification(text: string, detected: string): boolean {
  // Only apply this correction to common Latin-script confusion pairs.
  if (!isEnglishOverrideCandidate(detected)) {
    return false
  }

  // Restrict correction to Latin-script text. Non-Latin languages should not be overridden.
  if (!LATIN_LETTER_PATTERN.test(text)) {
    return false
  }

  // Diacritics from the predicted language are strong evidence; keep that language when present.
  if (hasPredictedLanguageDiacritics(text, detected)) {
    return false
  }

  const normalized = text.toLowerCase()
  const tokens = normalized.match(ASCII_WORD_PATTERN) || []

  const englishHits = countHits(tokens, ENGLISH_HINT_WORDS)
  const predictedLangHits = countHits(tokens, getHintWordsForLanguage(detected))

  // Plain ASCII text (no extended-Latin diacritics) with zero predicted-language hint words
  // has no positive evidence for the predicted language — franc is guessing from trigram
  // statistics alone, which is unreliable for short text and English words borrowed from
  // French/Latin (e.g. "table", "document", "information"). Default to English.
  if (!NON_ASCII_LATIN_PATTERN.test(text) && predictedLangHits === 0) {
    return true
  }

  // When extended-Latin characters or predicted-language hint words are present,
  // compare lexical evidence: override to English only when English hints dominate.
  return englishHits > predictedLangHits
}

/**
 * @description Determine whether a detected language is eligible for English override heuristics.
 * @param {string} detected - Language code returned by franc
 * @returns {boolean} True when override heuristics should be evaluated
 */
function isEnglishOverrideCandidate(detected: string): boolean {
  return detected === LANG_FRA || detected === LANG_DEU || detected === LANG_SPA
}

/**
 * @description Check whether the text contains diacritics strongly associated with the predicted language.
 * @param {string} text - Input text
 * @param {string} detected - Language code returned by franc
 * @returns {boolean} True when language-specific diacritics are found
 */
function hasPredictedLanguageDiacritics(text: string, detected: string): boolean {
  if (detected === LANG_FRA) {
    return FRENCH_DIACRITIC_PATTERN.test(text)
  }

  if (detected === LANG_DEU) {
    return GERMAN_DIACRITIC_PATTERN.test(text)
  }

  if (detected === LANG_SPA) {
    return SPANISH_DIACRITIC_PATTERN.test(text)
  }

  return false
}

/**
 * @description Get hint words associated with a language code for lexical comparison.
 * @param {string} langCode - ISO 639-3 language code
 * @returns {Set<string>} Hint-word lexicon for the language, or an empty set
 */
function getHintWordsForLanguage(langCode: string): Set<string> {
  if (langCode === LANG_FRA) {
    return FRENCH_HINT_WORDS
  }

  if (langCode === LANG_DEU) {
    return GERMAN_HINT_WORDS
  }

  if (langCode === LANG_SPA) {
    return SPANISH_HINT_WORDS
  }

  return new Set<string>()
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
