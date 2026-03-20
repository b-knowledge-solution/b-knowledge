/**
 * @fileoverview Tests for document utility functions.
 *
 * Tests:
 * - getExtension: file extension extraction
 * - isPdf: PDF file detection
 * - isImage: image type detection
 * - isSupportedPreviewDocumentType: preview support detection
 * - buildChunkHighlights: chunk-to-highlight conversion for PDF viewer
 *
 * Mocks `uuid` for deterministic highlight IDs.
 */

import { describe, it, expect, vi } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

// Mock uuid for deterministic highlight IDs
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}))

// Mock the Chunk type import — the functions only use positions and text fields
vi.mock('@/features/datasets/types', () => ({}))

// ============================================================================
// Tests
// ============================================================================

describe('document-util', () => {
  /**
   * @description Dynamically imports the module so mocks are resolved
   * @returns {Promise<typeof import('@/utils/document-util')>} Module exports
   */
  async function importModule() {
    return await import('@/utils/document-util')
  }

  // --------------------------------------------------------------------------
  // getExtension
  // --------------------------------------------------------------------------

  describe('getExtension', () => {
    /** @description Should extract and lowercase the extension from a simple filename */
    it('extracts lowercase extension from filename', async () => {
      const { getExtension } = await importModule()
      expect(getExtension('report.PDF')).toBe('pdf')
    })

    /** @description Should return the last extension for double-extension files */
    it('returns last extension for double extensions', async () => {
      const { getExtension } = await importModule()
      expect(getExtension('archive.tar.gz')).toBe('gz')
    })

    /** @description Should return the filename itself when there is no dot */
    it('returns the entire name when no extension exists', async () => {
      const { getExtension } = await importModule()
      // No dot means lastIndexOf('.') is -1, so slice(0) returns the whole string
      expect(getExtension('README')).toBe('readme')
    })

    /** @description Should handle empty string */
    it('returns empty string for empty input', async () => {
      const { getExtension } = await importModule()
      expect(getExtension('')).toBe('')
    })

    /** @description Should handle filenames with spaces */
    it('handles filenames with spaces', async () => {
      const { getExtension } = await importModule()
      expect(getExtension('my document.docx')).toBe('docx')
    })
  })

  // --------------------------------------------------------------------------
  // isPdf
  // --------------------------------------------------------------------------

  describe('isPdf', () => {
    /** @description Should return true for .pdf extension (case insensitive) */
    it('returns true for PDF files', async () => {
      const { isPdf } = await importModule()
      expect(isPdf('report.pdf')).toBe(true)
      expect(isPdf('REPORT.PDF')).toBe(true)
      expect(isPdf('doc.Pdf')).toBe(true)
    })

    /** @description Should return false for non-PDF files */
    it('returns false for non-PDF files', async () => {
      const { isPdf } = await importModule()
      expect(isPdf('report.docx')).toBe(false)
      expect(isPdf('image.png')).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // isImage
  // --------------------------------------------------------------------------

  describe('isImage', () => {
    /** @description Should return true for all recognized image extensions */
    it('recognizes standard image formats', async () => {
      const { isImage } = await importModule()

      // Test a selection of image types
      expect(isImage('jpg')).toBe(true)
      expect(isImage('jpeg')).toBe(true)
      expect(isImage('png')).toBe(true)
      expect(isImage('gif')).toBe(true)
      expect(isImage('svg')).toBe(true)
      expect(isImage('webp')).toBe(true)
      expect(isImage('tiff')).toBe(true)
      expect(isImage('bmp')).toBe(true)
      expect(isImage('ico')).toBe(true)
    })

    /** @description Should return false for non-image extensions */
    it('rejects non-image formats', async () => {
      const { isImage } = await importModule()
      expect(isImage('pdf')).toBe(false)
      expect(isImage('docx')).toBe(false)
      expect(isImage('mp4')).toBe(false)
      expect(isImage('')).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // isSupportedPreviewDocumentType
  // --------------------------------------------------------------------------

  describe('isSupportedPreviewDocumentType', () => {
    /** @description Should return true for all supported preview types */
    it('recognizes previewable document types', async () => {
      const { isSupportedPreviewDocumentType } = await importModule()

      // Document types
      expect(isSupportedPreviewDocumentType('pdf')).toBe(true)
      expect(isSupportedPreviewDocumentType('doc')).toBe(true)
      expect(isSupportedPreviewDocumentType('docx')).toBe(true)
      expect(isSupportedPreviewDocumentType('txt')).toBe(true)
      expect(isSupportedPreviewDocumentType('md')).toBe(true)
      expect(isSupportedPreviewDocumentType('csv')).toBe(true)
      expect(isSupportedPreviewDocumentType('xlsx')).toBe(true)
      expect(isSupportedPreviewDocumentType('ppt')).toBe(true)
      expect(isSupportedPreviewDocumentType('pptx')).toBe(true)

      // Image types should also be previewable
      expect(isSupportedPreviewDocumentType('png')).toBe(true)
      expect(isSupportedPreviewDocumentType('jpg')).toBe(true)

      // Video types should also be previewable
      expect(isSupportedPreviewDocumentType('mp4')).toBe(true)
    })

    /** @description Should return false for unsupported types */
    it('rejects unsupported types', async () => {
      const { isSupportedPreviewDocumentType } = await importModule()
      expect(isSupportedPreviewDocumentType('zip')).toBe(false)
      expect(isSupportedPreviewDocumentType('exe')).toBe(false)
      expect(isSupportedPreviewDocumentType('json')).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // buildChunkHighlights
  // --------------------------------------------------------------------------

  describe('buildChunkHighlights', () => {
    const size = { width: 800, height: 1200 }

    /** @description Should return empty array when chunk is null */
    it('returns empty array for null chunk', async () => {
      const { buildChunkHighlights } = await importModule()
      expect(buildChunkHighlights(null, size)).toEqual([])
    })

    /** @description Should return empty array when chunk is undefined */
    it('returns empty array for undefined chunk', async () => {
      const { buildChunkHighlights } = await importModule()
      expect(buildChunkHighlights(undefined, size)).toEqual([])
    })

    /** @description Should return empty array when chunk has no positions */
    it('returns empty array when positions is missing', async () => {
      const { buildChunkHighlights } = await importModule()
      const chunk = { chunk_id: 'c1', text: 'hello' } as any
      expect(buildChunkHighlights(chunk, size)).toEqual([])
    })

    /** @description Should return empty array when positions is not an array */
    it('returns empty array when positions is not an array', async () => {
      const { buildChunkHighlights } = await importModule()
      const chunk = { chunk_id: 'c1', text: 'hello', positions: 'invalid' } as any
      expect(buildChunkHighlights(chunk, size)).toEqual([])
    })

    /** @description Should return empty array when positions contain non-array items */
    it('returns empty array when positions contain non-array items', async () => {
      const { buildChunkHighlights } = await importModule()
      const chunk = { chunk_id: 'c1', text: 'hello', positions: [1, 2, 3] } as any
      expect(buildChunkHighlights(chunk, size)).toEqual([])
    })

    /** @description Should filter out positions with fewer than 5 coordinates */
    it('filters out positions with fewer than 5 elements', async () => {
      const { buildChunkHighlights } = await importModule()
      const chunk = {
        chunk_id: 'c1',
        text: 'hello',
        positions: [
          [1, 10, 20],       // Too short — should be filtered
          [1, 10, 20, 30, 40], // Valid — 5 elements
        ],
      } as any

      const result = buildChunkHighlights(chunk, size)

      // Only the valid position should produce a highlight
      expect(result).toHaveLength(1)
    })

    /** @description Should correctly map position array to highlight structure */
    it('creates highlight with correct bounding rect and page number', async () => {
      const { buildChunkHighlights } = await importModule()
      const chunk = {
        chunk_id: 'c1',
        text: 'Sample text',
        positions: [[3, 100, 200, 50, 150]], // [page, x1, x2, y1, y2]
      } as any

      const result = buildChunkHighlights(chunk, size)

      expect(result).toHaveLength(1)
      const highlight = result[0]!

      // Verify page number from position[0]
      expect(highlight.position.pageNumber).toBe(3)

      // Verify bounding rect coordinates from position[1..4]
      expect(highlight.position.boundingRect).toEqual({
        width: 800,
        height: 1200,
        x1: 100,
        x2: 200,
        y1: 50,
        y2: 150,
      })

      // Verify rects contains the same bounding rect
      expect(highlight.position.rects).toEqual([highlight.position.boundingRect])

      // Verify content text
      expect(highlight.content.text).toBe('Sample text')

      // Verify UUID was used for the ID
      expect(highlight.id).toBe('test-uuid-1234')
    })

    /** @description Should handle multiple valid positions producing multiple highlights */
    it('produces one highlight per valid position', async () => {
      const { buildChunkHighlights } = await importModule()
      const chunk = {
        chunk_id: 'c1',
        text: 'Multi-page chunk',
        positions: [
          [1, 10, 20, 30, 40],
          [2, 50, 60, 70, 80],
          [3, 90, 100, 110, 120],
        ],
      } as any

      const result = buildChunkHighlights(chunk, size)

      expect(result).toHaveLength(3)
      // Verify each highlight has the correct page number
      expect(result[0]!.position.pageNumber).toBe(1)
      expect(result[1]!.position.pageNumber).toBe(2)
      expect(result[2]!.position.pageNumber).toBe(3)
    })

    /** @description Should use empty string for text when chunk.text is falsy */
    it('uses empty string when chunk text is undefined', async () => {
      const { buildChunkHighlights } = await importModule()
      const chunk = {
        chunk_id: 'c1',
        text: undefined,
        positions: [[1, 10, 20, 30, 40]],
      } as any

      const result = buildChunkHighlights(chunk, size)

      expect(result[0]!.content.text).toBe('')
    })
  })

  // --------------------------------------------------------------------------
  // Exported constants
  // --------------------------------------------------------------------------

  describe('exported constants', () => {
    /** @description Images constant should contain all expected image extensions */
    it('Images contains standard image formats', async () => {
      const { Images } = await importModule()
      expect(Images).toContain('jpg')
      expect(Images).toContain('jpeg')
      expect(Images).toContain('png')
      expect(Images).toContain('gif')
      expect(Images).toContain('svg')
      expect(Images).toContain('webp')
    })

    /** @description VideoTypes constant should contain standard video extensions */
    it('VideoTypes contains standard video formats', async () => {
      const { VideoTypes } = await importModule()
      expect(VideoTypes).toContain('mp4')
      expect(VideoTypes).toContain('avi')
      expect(VideoTypes).toContain('mov')
      expect(VideoTypes).toContain('mkv')
    })
  })
})
