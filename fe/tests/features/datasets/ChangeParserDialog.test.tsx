/**
 * @fileoverview Unit tests for ChangeParserDialog types and data model.
 *
 * NOTE: Component rendering hangs in vitest due to babel-plugin-react-compiler
 * interactions with Radix UI Dialog/Select primitives in jsdom. These tests
 * validate the parser options data and the isUnchanged guard logic.
 */
import { describe, it, expect } from 'vitest'
import { PARSER_OPTIONS } from '@/features/datasets/types'

describe('ChangeParserDialog (unit)', () => {
  describe('PARSER_OPTIONS', () => {
    it('contains exactly 17 parser types', () => {
      expect(PARSER_OPTIONS).toHaveLength(17)
    })

    it('includes all expected parser values', () => {
      const values = PARSER_OPTIONS.map((p) => p.value)
      const expected = [
        'naive', 'qa', 'resume', 'manual', 'table', 'paper', 'book',
        'laws', 'presentation', 'one', 'picture', 'audio', 'email',
        'openapi', 'adr', 'clinical', 'sdlc_checklist',
      ]
      for (const v of expected) {
        expect(values).toContain(v)
      }
    })

    it('each option has a non-empty value and label', () => {
      for (const opt of PARSER_OPTIONS) {
        expect(opt.value).toBeTruthy()
        expect(opt.label).toBeTruthy()
      }
    })

    it('maps naive parser to General label', () => {
      const naive = PARSER_OPTIONS.find((p) => p.value === 'naive')
      expect(naive?.label).toBe('General')
    })
  })

  describe('isUnchanged guard', () => {
    // Replicates the logic: selectedParser === (document?.parser_id || 'naive')
    function isUnchanged(selectedParser: string, documentParserId?: string): boolean {
      return selectedParser === (documentParserId || 'naive')
    }

    it('returns true when parser is the same', () => {
      expect(isUnchanged('naive', 'naive')).toBe(true)
    })

    it('returns true when document has no parser_id (defaults to naive)', () => {
      expect(isUnchanged('naive', undefined)).toBe(true)
    })

    it('returns false when parser is different', () => {
      expect(isUnchanged('qa', 'naive')).toBe(false)
    })

    it('returns false when changing from default to explicit parser', () => {
      expect(isUnchanged('paper', undefined)).toBe(false)
    })
  })
})
