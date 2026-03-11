/**
 * @fileoverview Document reference panel for chat citations.
 * Displays referenced documents and their chunks with expandable content.
 * @module features/ai/components/ChatReferencePanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, ChevronDown, ChevronRight, X, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { ChatReference, ChatChunk, DocAggregate } from '../types/chat.types'

// ============================================================================
// Props
// ============================================================================

interface ChatReferencePanelProps {
  /** The reference data to display */
  reference: ChatReference | null
  /** Callback to close the panel */
  onClose: () => void
  /** Callback when a document is clicked for preview */
  onDocumentClick?: ((docId: string) => void) | undefined
  /** Optional CSS class name */
  className?: string
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Renders a single expandable document aggregate with its chunks.
 */
function DocumentItem({
  doc,
  chunks,
  onDocumentClick,
}: {
  doc: DocAggregate
  chunks: ChatChunk[]
  onDocumentClick?: ((docId: string) => void) | undefined
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  // Filter chunks belonging to this document
  const docChunks = chunks.filter((c) => c.doc_id === doc.doc_id)

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Document header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-sm hover:bg-muted/50 transition-colors"
      >
        {/* Expand/collapse icon */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        {/* File icon */}
        <FileText className="h-4 w-4 text-primary shrink-0" />

        {/* Document name */}
        <span className="flex-1 truncate text-left font-medium">{doc.doc_name}</span>

        {/* Chunk count badge */}
        <Badge variant="secondary" className="text-xs">
          {doc.count} {t('chat.chunks')}
        </Badge>
      </button>

      {/* Expanded chunk list */}
      {expanded && (
        <div className="border-t divide-y">
          {docChunks.map((chunk, idx) => (
            <div key={chunk.chunk_id} className="p-3 space-y-2">
              {/* Chunk header with position info */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>#{idx + 1}</span>
                {chunk.page_num_int > 0 && (
                  <span>{t('chat.page')} {chunk.page_num_int}</span>
                )}

                {/* Relevance score */}
                {chunk.score !== undefined && (
                  <div className="flex items-center gap-1 ml-auto">
                    <span>{t('chat.relevance')}</span>
                    <Progress
                      value={chunk.score * 100}
                      className="w-16 h-1.5"
                    />
                    <span>{Math.round(chunk.score * 100)}%</span>
                  </div>
                )}
              </div>

              {/* Chunk content */}
              <p className="text-sm text-foreground/80 line-clamp-4 whitespace-pre-wrap">
                {chunk.content_with_weight}
              </p>
            </div>
          ))}

          {/* Open document button */}
          {onDocumentClick && (
            <div className="p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => onDocumentClick(doc.doc_id)}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {t('chat.openDocument')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Collapsible reference panel showing cited documents and chunks.
 *
 * @param {ChatReferencePanelProps} props - Component properties
 * @returns {JSX.Element} The rendered reference panel
 */
function ChatReferencePanel({
  reference,
  onClose,
  onDocumentClick,
  className,
}: ChatReferencePanelProps) {
  const { t } = useTranslation()

  // Nothing to show
  if (!reference || reference.doc_aggs.length === 0) {
    return null
  }

  return (
    <div className={cn('flex flex-col h-full border-l bg-background', className)}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">
          {t('chat.references')} ({reference.doc_aggs.length})
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {reference.doc_aggs.map((doc) => (
          <DocumentItem
            key={doc.doc_id}
            doc={doc}
            chunks={reference.chunks}
            onDocumentClick={onDocumentClick}
          />
        ))}
      </div>
    </div>
  )
}

export default ChatReferencePanel
