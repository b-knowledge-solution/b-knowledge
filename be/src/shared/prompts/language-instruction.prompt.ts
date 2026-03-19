/**
 * @fileoverview Language instruction prompt builder.
 *
 * Re-exports the buildLanguageInstruction utility as a prompt object
 * consistent with the prompt registry pattern.
 *
 * @module shared/prompts/language-instruction
 */

import { buildLanguageInstruction } from '@/shared/utils/language-detect.js'

/**
 * @description Prompt object that builds a system instruction telling the LLM
 * to respond in a specific language.
 */
export const languageInstructionPrompt = {
  /**
   * @description Build a language instruction string for inclusion in system prompts.
   * @param {string} langCode - ISO 639-3 language code (e.g., 'eng', 'vie')
   * @returns {string} Formatted instruction string
   */
  build(langCode: string): string {
    return buildLanguageInstruction(langCode)
  },
}
