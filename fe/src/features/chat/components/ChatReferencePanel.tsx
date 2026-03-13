/**
 * @fileoverview Document reference panel for chat citations.
 * Displays referenced documents and their chunks with expandable content.
 * @module features/ai/components/ChatReferencePanel
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, ChevronRight, X, ExternalLink } from 'lucide-react'
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
    <div className="border border-border/50 rounded-xl overflow-hidden bg-background/60 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300">
      {/* Document header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-sm hover:bg-muted/40 transition-all duration-200"
      >
        {/* Expand/collapse icon — smooth rotate */}
        <ChevronRight className={cn(
          'h-4 w-4 text-muted-foreground/60 shrink-0 transition-transform duration-200',
          expanded && 'rotate-90',
        )} />

        {/* File icon */}
        <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-3.5 w-3.5 text-primary" />
        </div>

        {/* Document name */}
        <span className="flex-1 truncate text-left font-medium text-sm">{doc.doc_name}</span>

        {/* Chunk count badge */}
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 bg-muted/60">
          {doc.count}
        </Badge>
      </button>

      {/* Expanded chunk list */}
      {expanded && (
        <div className="border-t border-border/40 divide-y divide-border/30">
          {docChunks.map((chunk, idx) => (
            <div key={chunk.chunk_id} className="p-3 space-y-2">
              {/* Chunk header with position info */}
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
                <span className="font-mono">#{idx + 1}</span>
                {chunk.page_num_int > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px]">
                    {t('chat.page')} {chunk.page_num_int}
                  </span>
                )}

                {/* Relevance score */}
                {chunk.score !== undefined && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Progress
                      value={chunk.score * 100}
                      className="w-14 h-1"
                    />
                    <span className="font-mono text-[10px]">{Math.round(chunk.score * 100)}%</span>
                  </div>
                )}
              </div>

              {/* Chunk content — subtle code-like background */}
              <p className="text-sm text-foreground/75 line-clamp-4 whitespace-pre-wrap rounded-md bg-muted/30 px-2.5 py-2 leading-relaxed">
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
                className="w-full text-xs hover:text-primary transition-colors"
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
    <div className={cn('flex flex-col h-full border-l border-border/50 bg-muted/10 dark:bg-muted/5 backdrop-blur-sm', className)}>
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <h3 className="text-sm font-semibold text-foreground">
          {t('chat.references')}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">({reference.doc_aggs.length})</span>
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-muted/60 transition-colors" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
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
