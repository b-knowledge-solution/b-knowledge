/**
 * @fileoverview Citation document drawer for chat — opens a Sheet with
 * DocumentPreviewer when a user clicks a citation in chat messages.
 *
 * RAGFlow-style behavior: when a citation is clicked, the drawer opens
 * with the PDF already scrolled to and highlighting the exact chunk location.
 * The chunk data (with positions) is passed directly from the citation click.
 *
 * @module features/chat/components/CitationDocDrawer
 */

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { DocumentPreviewer } from '@/components/DocumentPreviewer'
import { getExtension } from '@/utils/document-util'
import type { ChatChunk } from '../types/chat.types'
import type { Chunk } from '@/features/datasets/types'

/**
 * @description Props for the CitationDocDrawer component.
 */
interface CitationDocDrawerProps {
  /** Whether the drawer is open */
  open: boolean
  /** Callback to close the drawer */
  onClose: () => void
  /** The clicked citation chunk — contains doc_id, positions, and content for highlighting */
  chunk: ChatChunk | null | undefined
  /** Dataset ID for the document */
  datasetId: string | undefined
}

/**
 * @description Convert a ChatChunk (from chat references) to the Chunk type
 * expected by DocumentPreviewer for highlight rendering.
 * @param {ChatChunk} chatChunk - Chat reference chunk with positions
 * @returns {Chunk} Dataset chunk format compatible with DocumentPreviewer
 */
function chatChunkToChunk(chatChunk: ChatChunk): Chunk {
  const chunk: Chunk = {
    chunk_id: chatChunk.chunk_id,
    text: chatChunk.content_with_weight,
  }
  chunk.doc_id = chatChunk.doc_id
  chunk.doc_name = chatChunk.docnm_kwd
  chunk.page_num = Array.isArray(chatChunk.page_num_int)
    ? chatChunk.page_num_int
    : chatChunk.page_num_int ? [chatChunk.page_num_int] : []
  if (chatChunk.positions) chunk.positions = chatChunk.positions
  if (chatChunk.score != null) chunk.score = chatChunk.score
  return chunk
}

/**
 * @description Side drawer showing a document preview with the cited chunk
 * highlighted and scrolled into view. Matches RAGFlow behavior: clicking a
 * citation opens the PDF with the exact chunk location highlighted immediately.
 *
 * @param {CitationDocDrawerProps} props - Component properties
 * @returns {JSX.Element} The rendered citation drawer
 */
function CitationDocDrawer({
  open,
  onClose,
  chunk,
  datasetId,
}: CitationDocDrawerProps) {
  const { t } = useTranslation()

  const documentName = chunk?.docnm_kwd
  const documentId = chunk?.doc_id

  // Determine file extension for display
  const fileExt = documentName ? getExtension(documentName) : ''

  // Build the download URL for the document
  const downloadUrl = documentId && datasetId
    ? `/api/rag/datasets/${datasetId}/documents/${documentId}/download`
    : ''

  // Convert ChatChunk to Chunk format for DocumentPreviewer highlighting
  const selectedChunk = useMemo(
    () => chunk ? chatChunkToChunk(chunk) : null,
    [chunk],
  )

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
          <SheetDescription className="sr-only">
            {documentName || t('chat.documentPreview')}
          </SheetDescription>
        </SheetHeader>

        {/* Document preview — PDF only with citation chunk highlighted, no chunk list */}
        <div className="flex-1 overflow-hidden">
          {documentId && datasetId ? (
            <DocumentPreviewer
              datasetId={datasetId}
              docId={documentId}
              fileName={documentName || ''}
              downloadUrl={downloadUrl}
              showChunks={false}
              selectedChunk={selectedChunk}
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
