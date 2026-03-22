/**
 * @fileoverview Language instruction prompt builder.
 *
 * Re-exports the buildLanguageInstruction utility as a prompt object
 * consistent with the prompt registry pattern.
 *
 * @module shared/prompts/language-instruction
 */

import { buildLanguageInstruction, buildLanguageReminder } from '@/shared/utils/language-detect.js'

/**
 * @description Prompt object that builds system instructions telling the LLM
 * to respond in a specific language. Supports both a primary directive (prepended
 * before knowledge context) and a reminder (appended after knowledge context)
 * using the sandwich technique for robust multilingual response enforcement.
 */
export const languageInstructionPrompt = {
  /**
   * @description Build the primary language instruction for prepending to the system prompt.
   * @param {string} langCode - ISO 639-3 language code (e.g., 'eng', 'vie')
   * @returns {string} Formatted instruction string
   */
  build(langCode: string): string {
    return buildLanguageInstruction(langCode)
  },

  /**
   * @description Build a short language reminder for appending after the knowledge context.
   * Used together with build() to create a sandwich pattern around knowledge chunks.
   * @param {string} langCode - ISO 639-3 language code (e.g., 'eng', 'vie')
   * @returns {string} Reminder string to append after context
   */
  buildReminder(langCode: string): string {
    return buildLanguageReminder(langCode)
  },
}
