/**
 * @fileoverview Document utility functions for file type detection and PDF chunk highlighting.
 *
 * @module utils/document-util
 */

import { v4 as uuid } from 'uuid';
import type { Chunk } from '@/features/datasets/types';

/**
 * @description Represents a highlight region on a PDF page for a document chunk
 */
export interface ChunkHighlight {
  id: string;
  comment: { text: string; emoji: string };
  content: { text: string };
  position: {
    boundingRect: { width: number; height: number; x1: number; x2: number; y1: number; y2: number };
    rects: { width: number; height: number; x1: number; x2: number; y1: number; y2: number }[];
    pageNumber: number;
  };
}

/**
 * @description Converts chunk position data into highlight objects for rendering on a PDF viewer
 * @param {Chunk | null | undefined} selectedChunk - The chunk whose positions to highlight
 * @param {{ width: number; height: number }} size - The PDF page dimensions for bounding rect calculation
 * @returns {ChunkHighlight[]} Array of highlight objects with bounding rects and page numbers
 */
export const buildChunkHighlights = (
  selectedChunk: Chunk | null | undefined,
  size: { width: number; height: number },
): ChunkHighlight[] => {
  // Guard: return empty array if chunk has no valid position data
  if (
    !selectedChunk?.positions ||
    !Array.isArray(selectedChunk.positions) ||
    !selectedChunk.positions.every((x: unknown) => Array.isArray(x))
  ) {
    return [];
  }

  return selectedChunk.positions
    // Filter out position arrays that don't have enough coordinates (page, x1, x2, y1, y2)
    .filter((x: number[]) => x.length >= 5)
    .map((x: number[]) => {
      // Position array format: [pageNumber, x1, x2, y1, y2]
      const boundingRect = {
        width: size.width,
        height: size.height,
        x1: x[1]!,
        x2: x[2]!,
        y1: x[3]!,
        y2: x[4]!,
      };
      return {
        id: uuid(),
        comment: { text: '', emoji: '' },
        content: { text: selectedChunk.text || '' },
        position: {
          boundingRect,
          rects: [boundingRect],
          pageNumber: x[0]!,
        },
      };
    });
};

/**
 * @description Extracts the file extension from a filename, lowercased
 * @param {string} name - The filename to extract the extension from
 * @returns {string} Lowercase file extension without the dot
 */
export const getExtension = (name: string): string =>
  name?.slice(name.lastIndexOf('.') + 1).toLowerCase() ?? '';

/**
 * @description Checks whether a filename has a PDF extension
 * @param {string} name - The filename to check
 * @returns {boolean} True if the file is a PDF
 */
export const isPdf = (name: string): boolean => getExtension(name) === 'pdf';

/** Supported image file extensions */
export const Images = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'ico', 'svg'];

/** Supported video file extensions */
export const VideoTypes = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'mpeg', 'mpg', 'asf', 'rm', 'rmvb'];

/**
 * @description Checks whether a file extension belongs to an image format
 * @param {string} ext - The file extension to check (without dot)
 * @returns {boolean} True if the extension is a recognized image type
 */
export const isImage = (ext: string): boolean => Images.includes(ext);

/** All file extensions that can be previewed in the document viewer */
export const SupportedPreviewDocumentTypes = [
  'pdf', 'doc', 'docx', 'txt', 'md', 'mdx', 'csv', 'xlsx', 'xls',
  'ppt', 'pptx', ...Images, ...VideoTypes,
];

/**
 * @description Checks whether a file extension can be previewed in the document viewer
 * @param {string} ext - The file extension to check (without dot)
 * @returns {boolean} True if the document type is supported for preview
 */
export const isSupportedPreviewDocumentType = (ext: string): boolean =>
  SupportedPreviewDocumentTypes.includes(ext);
