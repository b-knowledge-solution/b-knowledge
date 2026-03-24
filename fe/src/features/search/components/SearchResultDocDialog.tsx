/**
 * @fileoverview Search result document dialog — opens a large Dialog with
 * DocumentPreviewer when a user clicks a search result card.
 *
 * @module features/search/components/SearchResultDocDialog
 */

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

/**
 * @description Props for the SearchResultDocDialog component.
 */
interface SearchResultDocDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Document ID to preview */
  documentId: string | undefined
  /** Document file name */
  documentName: string | undefined
  /** Dataset ID for the document */
  datasetId: string | undefined
  /** Optional pre-selected chunk for highlight positioning */
  selectedChunk?: Chunk | null | undefined
}

/**
 * @description Large dialog showing document preview with optional chunk highlighting.
 * Used when a user clicks a search result to view the source document in context.
 *
 * @param {SearchResultDocDialogProps} props - Component properties
 * @returns {JSX.Element} The rendered document preview dialog
 */
function SearchResultDocDialog({
  open,
  onClose,
  documentId,
  documentName,
  datasetId,
  selectedChunk,
}: SearchResultDocDialogProps) {
  const { t } = useTranslation()

  // Determine file extension for display
  const fileExt = documentName ? getExtension(documentName) : ''

  // Build the download URL for the document
  const downloadUrl = documentId && datasetId
    ? `/api/rag/datasets/${datasetId}/documents/${documentId}/download`
    : ''

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
          </DialogTitle>
        </DialogHeader>

        {/* Document preview area with chunk sidebar */}
        <div className="flex-1 overflow-hidden">
          {documentId && datasetId ? (
            <DocumentPreviewer
              datasetId={datasetId}
              docId={documentId}
              fileName={documentName || ''}
              downloadUrl={downloadUrl}
              showChunks={true}
              selectedChunk={selectedChunk}
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
