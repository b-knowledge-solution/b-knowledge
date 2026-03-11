import { v4 as uuid } from 'uuid';
import type { Chunk } from '@/features/datasets/types';

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

export const buildChunkHighlights = (
  selectedChunk: Chunk | null | undefined,
  size: { width: number; height: number },
): ChunkHighlight[] => {
  if (
    !selectedChunk?.positions ||
    !Array.isArray(selectedChunk.positions) ||
    !selectedChunk.positions.every((x: unknown) => Array.isArray(x))
  ) {
    return [];
  }

  return selectedChunk.positions
    .filter((x: number[]) => x.length >= 5)
    .map((x: number[]) => {
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

export const getExtension = (name: string): string =>
  name?.slice(name.lastIndexOf('.') + 1).toLowerCase() ?? '';

export const isPdf = (name: string): boolean => getExtension(name) === 'pdf';

export const Images = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'ico', 'svg'];

export const VideoTypes = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'mpeg', 'mpg', 'asf', 'rm', 'rmvb'];

export const isImage = (ext: string): boolean => Images.includes(ext);

export const SupportedPreviewDocumentTypes = [
  'pdf', 'doc', 'docx', 'txt', 'md', 'mdx', 'csv', 'xlsx', 'xls',
  'ppt', 'pptx', ...Images, ...VideoTypes,
];

export const isSupportedPreviewDocumentType = (ext: string): boolean =>
  SupportedPreviewDocumentTypes.includes(ext);
