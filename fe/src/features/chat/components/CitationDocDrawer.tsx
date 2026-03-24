/**
 * @fileoverview Citation document drawer for chat — opens a Sheet with
 * DocumentPreviewer when a user clicks a citation in chat messages.
 *
 * @module features/chat/components/CitationDocDrawer
 */

import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { DocumentPreviewer } from '@/components/DocumentPreviewer'
import { getExtension } from '@/utils/document-util'

/**
 * @description Props for the CitationDocDrawer component.
 */
interface CitationDocDrawerProps {
  /** Whether the drawer is open */
  open: boolean
  /** Callback to close the drawer */
  onClose: () => void
  /** Document ID to preview */
  documentId: string | undefined
  /** Document file name */
  documentName: string | undefined
  /** Dataset ID for the document */
  datasetId: string | undefined
}

/**
 * @description Side drawer showing a document preview with chunks when a chat citation is clicked.
 * Uses the shared DocumentPreviewer component for file-type routing and chunk display.
 *
 * @param {CitationDocDrawerProps} props - Component properties
 * @returns {JSX.Element} The rendered citation drawer
 */
function CitationDocDrawer({
  open,
  onClose,
  documentId,
  documentName,
  datasetId,
}: CitationDocDrawerProps) {
  const { t } = useTranslation()

  // Determine file extension for display
  const fileExt = documentName ? getExtension(documentName) : ''

  // Build the download URL for the document
  const downloadUrl = documentId && datasetId
    ? `/api/rag/datasets/${datasetId}/documents/${documentId}/download`
    : ''

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
            <span className="truncate">{documentName || t('chat.documentPreview')}</span>
            {fileExt && (
              <span className="text-xs text-muted-foreground uppercase shrink-0">
                .{fileExt}
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {/* Document preview with chunk list */}
        <div className="flex-1 overflow-hidden">
          {documentId && datasetId ? (
            <DocumentPreviewer
              datasetId={datasetId}
              docId={documentId}
              fileName={documentName || ''}
              downloadUrl={downloadUrl}
              showChunks={true}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {t('common.noData')}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default CitationDocDrawer
