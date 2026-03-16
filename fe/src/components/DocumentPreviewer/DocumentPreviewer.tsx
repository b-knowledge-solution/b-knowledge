/**
 * @fileoverview Document previewer component with side-by-side chunk list.
 * Routes to the appropriate file type previewer based on extension and
 * optionally displays a chunk list panel for document annotation review.
 *
 * @module components/DocumentPreviewer/DocumentPreviewer
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Download } from 'lucide-react';
import type { Chunk } from '@/features/datasets/types';
import type { ChunkHighlight } from '@/utils/document-util';
import {
  getExtension,
  isPdf,
  isImage,
  buildChunkHighlights,
} from '@/utils/document-util';
import {
  PdfPreview,
  DocPreviewer,
  TxtPreviewer,
  ImagePreviewer,
  ExcelPreviewer,
  CsvPreviewer,
  PptPreviewer,
  VideoPreviewer,
  MdPreviewer,
} from './previews';
import ChunkList from './ChunkList';

/**
 * @description Props for the DocumentPreviewer component.
 */
interface DocumentPreviewerProps {
  /** Dataset ID that owns the document */
  datasetId: string;
  /** Document ID to preview */
  docId: string;
  /** Original file name (used for extension detection) */
  fileName: string;
  /** Pre-signed URL to download/preview the file */
  downloadUrl: string;
  /** Whether to show the chunk list sidebar */
  showChunks?: boolean | undefined;
  /** Currently selected chunk (controlled from parent) */
  selectedChunk?: Chunk | null | undefined;
  /** Callback when a chunk is selected */
  onSelectChunk?: ((chunk: Chunk) => void) | undefined;
}

/** File extensions treated as plain text for preview */
const TEXT_EXTS = ['txt', 'log', 'json', 'xml', 'css', 'js', 'ts', 'tsx', 'jsx', 'yml', 'yaml', 'html', 'htm'];
/** File extensions treated as Excel spreadsheets */
const EXCEL_EXTS = ['xls', 'xlsx'];
/** File extensions treated as video for preview */
const VIDEO_EXTS = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'mpeg', 'mpg'];

/**
 * @description Routes file to the appropriate previewer component based on file extension
 * @param {object} props - File name, URL, highlights for PDF, and PDF size callback
 * @returns {JSX.Element} Rendered file preview or unsupported fallback with download link
 */
const FilePreviewPanel: React.FC<{
  fileName: string;
  url: string;
  highlights: ChunkHighlight[];
  onPdfSize?: ((width: number, height: number) => void) | undefined;
}> = ({ fileName, url, highlights, onPdfSize }) => {
  const { t } = useTranslation();
  const ext = getExtension(fileName);

  // Route to PDF previewer with highlight overlay support
  if (isPdf(fileName)) {
    return (
      <PdfPreview
        url={url}
        highlights={highlights}
        setWidthAndHeight={onPdfSize}
      />
    );
  }

  // Route to image previewer for supported image formats
  if (isImage(ext)) {
    return <ImagePreviewer url={url} />;
  }

  // Route to markdown previewer for .md and .mdx files
  if (ext === 'md' || ext === 'mdx') {
    return <MdPreviewer url={url} />;
  }

  // Route to CSV table previewer
  if (ext === 'csv') {
    return <CsvPreviewer url={url} />;
  }

  // Route to plain text previewer for code and text files
  if (TEXT_EXTS.includes(ext)) {
    return <TxtPreviewer url={url} />;
  }

  // Route to Word document previewer using mammoth.js
  if (ext === 'doc' || ext === 'docx') {
    return <DocPreviewer url={url} />;
  }

  // Route to Excel spreadsheet previewer
  if (EXCEL_EXTS.includes(ext)) {
    return <ExcelPreviewer url={url} />;
  }

  // Route to PowerPoint slide previewer
  if (ext === 'ppt' || ext === 'pptx') {
    return <PptPreviewer url={url} />;
  }

  // Route to video player previewer
  if (VIDEO_EXTS.includes(ext)) {
    return <VideoPreviewer url={url} />;
  }

  // Fallback for unsupported file types with download option
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400 p-8 text-center">
      <AlertCircle className="w-16 h-16 mb-4 opacity-50" />
      <p className="text-lg font-medium mb-2">
        {t('datasets.previewNotSupported', 'Preview not supported for this file type')}
      </p>
      <p className="text-sm mb-6">{fileName}</p>
      <a
        href={url}
        download
        className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
      >
        <Download className="w-4 h-4" />
        {t('common.download', 'Download')}
      </a>
    </div>
  );
};

/**
 * @description Split-panel document previewer with file preview and optional chunk sidebar
 * @param {DocumentPreviewerProps} props - Dataset/document IDs, file info, and chunk selection state
 * @returns {JSX.Element} Side-by-side document preview and chunk list
 */
const DocumentPreviewer: React.FC<DocumentPreviewerProps> = ({
  datasetId,
  docId,
  fileName,
  downloadUrl,
  showChunks = true,
  selectedChunk,
  onSelectChunk,
}) => {
  const [selectedChunkState, setSelectedChunkState] = useState<Chunk | null>(null);
  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 });

  // Use parent-controlled chunk if provided, otherwise fall back to local state
  const activeChunk = selectedChunk ?? selectedChunkState;

  /** Sync chunk selection between local and parent state */
  const handleSelectChunk = (chunk: Chunk) => {
    setSelectedChunkState(chunk);
    onSelectChunk?.(chunk);
  }

  /** Store PDF page dimensions for coordinate-based chunk highlighting */
  const handlePdfSize = (width: number, height: number) => {
    setPdfSize({ width, height });
  }

  // Build highlight rectangles from the active chunk position data
  const highlights = buildChunkHighlights(activeChunk, pdfSize);

  return (
    <div className="flex h-full">
      {/* Document Preview Panel */}
      <div className={`${showChunks ? 'flex-1' : 'w-full'} bg-gray-100 dark:bg-gray-950 relative overflow-hidden`}>
        <FilePreviewPanel
          fileName={fileName}
          url={downloadUrl}
          highlights={highlights}
          onPdfSize={handlePdfSize}
        />
      </div>

      {/* Chunk List Panel */}
      {showChunks && (
        <div className="w-80 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0 overflow-hidden">
          <ChunkList
            datasetId={datasetId}
            docId={docId}
            selectedChunk={activeChunk}
            onSelectChunk={handleSelectChunk}
          />
        </div>
      )}
    </div>
  );
};

export default DocumentPreviewer;
