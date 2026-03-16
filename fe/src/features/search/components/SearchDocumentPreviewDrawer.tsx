/**
 * @fileoverview Document preview drawer for search results.
 * Opens a side sheet with document preview and chunk highlighting.
 * @module features/ai/components/SearchDocumentPreviewDrawer
 */

import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import DocumentPreviewer from '@/components/DocumentPreviewer/DocumentPreviewer'
import { getExtension } from '@/utils/document-util'
import type { SearchResult } from '../types/search.types'

// ============================================================================
// Props
// ============================================================================

/** @description Props for the SearchDocumentPreviewDrawer component */
interface SearchDocumentPreviewDrawerProps {
  /** Whether the drawer is open */
  open: boolean
  /** Callback to close the drawer */
  onClose: () => void
  /** Document ID to preview */
  documentId: string | undefined
  /** Document file name */
  documentName: string | undefined
  /** The search result chunk with position data */
  chunk: SearchResult | null | undefined
  /** Dataset ID for the document */
  datasetId: string | undefined
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Side drawer that shows a document preview with chunk highlighting.
 * Uses the shared DocumentPreviewer component with PDF highlight support.
 *
 * @param {SearchDocumentPreviewDrawerProps} props - Component properties
 * @returns {JSX.Element} The rendered preview drawer
 */
function SearchDocumentPreviewDrawer({
  open,
  onClose,
  documentId,
  documentName,
  chunk,
  datasetId,
}: SearchDocumentPreviewDrawerProps) {
  const { t } = useTranslation()

  // Build file extension for icon display
  const fileExt = documentName ? getExtension(documentName) : ''

  // Build the download URL for the document
  const apiBase = import.meta.env.VITE_API_BASE_URL || ''
  const downloadUrl = documentId && datasetId
    ? `${apiBase}/api/rag/datasets/${datasetId}/documents/${documentId}/download`
    : ''

  // Build a chunk-like object for the previewer's highlight support
  const selectedChunk = chunk?.positions
    ? { positions: chunk.positions, text: chunk.content }
    : null

  return (
    <Sheet open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <SheetContent
        side="right"
        className="w-[600px] sm:w-[800px] sm:max-w-[80vw] p-0 flex flex-col"
      >
        {/* Header with file icon and name */}
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{documentName || t('search.documentPreview')}</span>
            {fileExt && (
              <span className="text-xs text-muted-foreground uppercase shrink-0">
                .{fileExt}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Document preview area */}
        <div className="flex-1 overflow-hidden">
          {documentId && datasetId ? (
            <DocumentPreviewer
              datasetId={datasetId}
              docId={documentId}
              fileName={documentName || ''}
              downloadUrl={downloadUrl}
              showChunks={false}
              selectedChunk={selectedChunk as any}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {t('search.documentPreview')}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default SearchDocumentPreviewDrawer
