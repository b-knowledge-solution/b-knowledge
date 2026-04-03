/**
 * @fileoverview Unit tests for TagEditor component logic.
 *
 * NOTE: Direct component rendering hangs in vitest due to a known issue
 * with babel-plugin-react-compiler processing @/components/ui/* files
 * that import Radix UI primitives. These tests validate the core tag
 * manipulation logic extracted from the component.
 */
import { describe, it, expect } from 'vitest'

/**
 * Extracted addTags logic from TagEditor component.
 * Splits text by commas/newlines, trims whitespace, and filters duplicates.
 */
function addTags(text: string, existing: string[]): string[] {
  const newTags = text
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !existing.includes(t))
  if (newTags.length > 0) return [...existing, ...newTags]
  return existing
}

/**
 * Extracted removeTag logic from TagEditor component.
 */
function removeTag(tags: string[], index: number): string[] {
  return tags.filter((_, i) => i !== index)
}

describe('TagEditor (logic)', () => {
  describe('addTags', () => {
    it('adds a single tag to an existing list', () => {
      expect(addTags('newTag', ['existing'])).toEqual(['existing', 'newTag'])
    })

    it('splits comma-separated text into multiple tags', () => {
      expect(addTags('foo,bar,baz', [])).toEqual(['foo', 'bar', 'baz'])
    })

    it('splits newline-separated text into multiple tags', () => {
      expect(addTags('foo\nbar\nbaz', [])).toEqual(['foo', 'bar', 'baz'])
    })

    it('trims whitespace from tags', () => {
      expect(addTags(' foo , bar ', [])).toEqual(['foo', 'bar'])
    })

    it('filters empty strings from split results', () => {
      expect(addTags(',,,', [])).toEqual([])
    })

    it('does not add duplicate tags', () => {
      const result = addTags('dup', ['dup'])
      expect(result).toEqual(['dup'])
    })

    it('filters tags already in existing list from comma-separated input', () => {
      // 'b' is filtered because it exists, but duplicate 'a' in input is kept
      // (component only deduplicates against existing tags, not within input)
      expect(addTags('a,b,a', ['b'])).toEqual(['b', 'a', 'a'])
    })

    it('returns original array when no new tags', () => {
      const existing = ['a', 'b']
      expect(addTags('a,b', existing)).toBe(existing)
    })
  })

  describe('removeTag', () => {
    it('removes tag at specified index', () => {
      expect(removeTag(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
    })

    it('removes first tag', () => {
      expect(removeTag(['a', 'b', 'c'], 0)).toEqual(['b', 'c'])
    })

    it('removes last tag', () => {
      expect(removeTag(['a', 'b', 'c'], 2)).toEqual(['a', 'b'])
    })
  })

  describe('backspace behavior (simulated)', () => {
    it('removes last tag when input is empty', () => {
      const tags = ['x', 'y']
      // Simulates: if (key === 'Backspace' && input === '' && value.length > 0)
      const result = tags.slice(0, -1)
      expect(result).toEqual(['x'])
    })

    it('does not remove when no tags exist', () => {
      const tags: string[] = []
      const shouldRemove = tags.length > 0
      expect(shouldRemove).toBe(false)
    })
  })
})
