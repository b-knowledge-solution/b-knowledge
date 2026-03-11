import React, { useState, useMemo, useCallback } from 'react';
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

interface DocumentPreviewerProps {
  datasetId: string;
  docId: string;
  fileName: string;
  downloadUrl: string;
  showChunks?: boolean | undefined;
  selectedChunk?: Chunk | null | undefined;
  onSelectChunk?: ((chunk: Chunk) => void) | undefined;
}

const TEXT_EXTS = ['txt', 'log', 'json', 'xml', 'css', 'js', 'ts', 'tsx', 'jsx', 'yml', 'yaml', 'html', 'htm'];
const EXCEL_EXTS = ['xls', 'xlsx'];
const VIDEO_EXTS = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'mpeg', 'mpg'];

const FilePreviewPanel: React.FC<{
  fileName: string;
  url: string;
  highlights: ChunkHighlight[];
  onPdfSize?: ((width: number, height: number) => void) | undefined;
}> = ({ fileName, url, highlights, onPdfSize }) => {
  const { t } = useTranslation();
  const ext = useMemo(() => getExtension(fileName), [fileName]);

  if (isPdf(fileName)) {
    return (
      <PdfPreview
        url={url}
        highlights={highlights}
        setWidthAndHeight={onPdfSize}
      />
    );
  }

  if (isImage(ext)) {
    return <ImagePreviewer url={url} />;
  }

  if (ext === 'md' || ext === 'mdx') {
    return <MdPreviewer url={url} />;
  }

  if (ext === 'csv') {
    return <CsvPreviewer url={url} />;
  }

  if (TEXT_EXTS.includes(ext)) {
    return <TxtPreviewer url={url} />;
  }

  if (ext === 'doc' || ext === 'docx') {
    return <DocPreviewer url={url} />;
  }

  if (EXCEL_EXTS.includes(ext)) {
    return <ExcelPreviewer url={url} />;
  }

  if (ext === 'ppt' || ext === 'pptx') {
    return <PptPreviewer url={url} />;
  }

  if (VIDEO_EXTS.includes(ext)) {
    return <VideoPreviewer url={url} />;
  }

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

  const activeChunk = selectedChunk ?? selectedChunkState;

  const handleSelectChunk = useCallback(
    (chunk: Chunk) => {
      setSelectedChunkState(chunk);
      onSelectChunk?.(chunk);
    },
    [onSelectChunk],
  );

  const handlePdfSize = useCallback((width: number, height: number) => {
    setPdfSize({ width, height });
  }, []);

  const highlights = useMemo(
    () => buildChunkHighlights(activeChunk, pdfSize),
    [activeChunk, pdfSize],
  );

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
