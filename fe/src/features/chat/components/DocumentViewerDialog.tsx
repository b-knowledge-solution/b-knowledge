/**
 * @fileoverview Document viewer dialog for chat — opens a modal dialog
 * when clicking a document name badge at the bottom of assistant messages.
 * Shows the full document without chunk highlighting.
 *
 * @module features/chat/components/DocumentViewerDialog
 */

import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { DocumentPreviewer } from '@/components/DocumentPreviewer'
import { getExtension } from '@/utils/document-util'

/**
 * @description Props for the DocumentViewerDialog component.
 */
interface DocumentViewerDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to close the dialog */
  onClose: () => void
  /** Document identifier */
  docId: string | undefined
  /** Document file name */
  docName: string | undefined
  /** Dataset ID for the document */
  datasetId: string | undefined
}

/**
 * @description Modal dialog showing a document preview without chunk highlighting.
 * Used when clicking a document name badge at the bottom of assistant messages.
 *
 * @param {DocumentViewerDialogProps} props - Component properties
 * @returns {JSX.Element} The rendered document viewer dialog
 */
function DocumentViewerDialog({
  open,
  onClose,
  docId,
  docName,
  datasetId,
}: DocumentViewerDialogProps) {
  const { t } = useTranslation()

  // Determine file extension for display
  const fileExt = docName ? getExtension(docName) : ''

  // Build the download URL for the document
  const downloadUrl = docId && datasetId
    ? `/api/rag/datasets/${datasetId}/documents/${docId}/download`
    : ''

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl w-[90vw] h-[85vh] p-0 flex flex-col gap-0">
        {/* Header with file icon and name */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{docName || t('chat.documentPreview')}</span>
            {fileExt && (
              <span className="text-xs text-muted-foreground uppercase shrink-0">
                .{fileExt}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {docName || t('chat.documentPreview')}
          </DialogDescription>
        </DialogHeader>

        {/* Document preview — no chunk highlighting */}
        <div className="flex-1 overflow-hidden min-h-0">
          {docId && datasetId ? (
            <DocumentPreviewer
              datasetId={datasetId}
              docId={docId}
              fileName={docName || ''}
              downloadUrl={downloadUrl}
              showChunks={false}
              selectedChunk={null}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              {t('common.noData')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DocumentViewerDialog
