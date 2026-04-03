/**
 * @fileoverview Search result document dialog — opens a large Dialog with
 * DocumentPreviewer when a user clicks a search result card.
 * Shows document preview with highlight overlay (no chunk list sidebar),
 * matching the chat feature's document preview behavior.
 *
 * @module features/search/components/SearchResultDocDialog
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DocumentPreviewer } from '@/components/DocumentPreviewer'
import { getExtension } from '@/utils/document-util'
import type { Chunk } from '@/features/datasets/types'
import type { SearchResult } from '../types/search.types'

/**
 * @description Props for the SearchResultDocDialog component.
 */
interface SearchResultDocDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** The search result to preview — provides doc ID, dataset ID, positions, etc. */
  result: SearchResult | null
}

/**
 * @description Convert a SearchResult to a Chunk for highlight positioning.
 * Maps search result fields to the Chunk format expected by DocumentPreviewer.
 * @param {SearchResult} result - The search result to convert
 * @returns {Chunk} Chunk with position data for PDF highlighting
 */
function searchResultToChunk(result: SearchResult): Chunk {
  const chunk: Chunk = {
    chunk_id: result.chunk_id,
    text: result.content_with_weight || result.content || '',
  }
  chunk.doc_id = result.doc_id
  chunk.doc_name = result.doc_name
  chunk.page_num = Array.isArray(result.page_num)
    ? result.page_num
    : result.page_num ? [result.page_num] : []
  chunk.score = result.score
  if (result.positions) chunk.positions = result.positions
  return chunk
}

/**
 * @description Dialog showing document preview with highlight overlay on the clicked chunk.
 * Displays document-only view (no chunk list sidebar) with auto-scroll to the
 * highlighted area, matching the chat feature's citation preview behavior.
 *
 * @param {SearchResultDocDialogProps} props - Component properties
 * @returns {JSX.Element} The rendered document preview dialog
 */
function SearchResultDocDialog({
  open,
  onClose,
  result,
}: SearchResultDocDialogProps) {
  const { t } = useTranslation()

  const documentId = result?.doc_id
  const documentName = result?.doc_name
  const datasetId = result?.dataset_id

  // Determine file extension for display
  const fileExt = documentName ? getExtension(documentName) : ''

  // Build the download URL for the document
  const downloadUrl = documentId && datasetId
    ? `/api/rag/datasets/${datasetId}/documents/${documentId}/download`
    : ''

  // Convert search result to Chunk for highlight positioning
  const selectedChunk = useMemo(() => {
    if (!result) return null
    return searchResultToChunk(result)
  }, [result])

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[80vh] p-0 flex flex-col">
        {/* Header with file icon and name */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{documentName || t('search.documentPreview')}</span>
            {fileExt && (
              <span className="text-xs text-muted-foreground uppercase shrink-0">
                .{fileExt}
              </span>
            )}
            {/* Show score when available */}
            {result?.score != null && (
              <span className="text-xs text-muted-foreground">
                {Math.round(result.score * 100)}%
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Document preview — full width, no chunk sidebar, with highlight overlay */}
        <div className="flex-1 overflow-hidden">
          {documentId && datasetId ? (
            <DocumentPreviewer
              datasetId={datasetId}
              docId={documentId}
              fileName={documentName || ''}
              downloadUrl={downloadUrl}
              showChunks={false}
              selectedChunk={selectedChunk}
              initialPage={
                selectedChunk?.page_num?.[0]
                  ?? (Array.isArray(result?.page_num) ? result?.page_num[0] : result?.page_num)
                  ?? undefined
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {t('search.documentPreview')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SearchResultDocDialog
