/**
 * @fileoverview Single search result card component with optional feedback buttons.
 * @module features/ai/components/SearchResultCard
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, FileSpreadsheet, FileImage, File, ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { SearchResult } from '../types/search.types'
import ImageLightbox from './ImageLightbox'
import { ChunkContentDisplay } from '@/components/ChunkContentDisplay'

// ============================================================================
// Props
// ============================================================================

/** @description Props for the SearchResultCard component */
interface SearchResultCardProps {
  /** The search result data */
  result: SearchResult
  /** The search query for highlighting */
  query?: string | undefined
  /** Callback when the card is clicked */
  onClick?: ((result: SearchResult) => void) | undefined
  /** Optional CSS class name */
  className?: string
  /** Callback to send feedback on this result */
  onFeedback?: ((thumbup: boolean, result: SearchResult) => void) | undefined
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * @description Returns the appropriate file type icon based on file extension.
 * @param {string} fileType - File extension or type
 * @returns {JSX.Element} Icon component matching the file type
 */
function getFileIcon(fileType?: string) {
  // Map file extensions to color-coded icons for visual identification
  switch (fileType?.toLowerCase()) {
    case 'pdf':
      return <FileText className="h-5 w-5 text-red-500" />
    case 'xlsx':
    case 'xls':
    case 'csv':
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />
    case 'png':
    case 'jpg':
    case 'jpeg':
      return <FileImage className="h-5 w-5 text-blue-500" />
    default:
      return <File className="h-5 w-5 text-muted-foreground" />
  }
}


// ============================================================================
// Component
// ============================================================================

/**
 * @description A single search result card with document info, snippet, score,
 *   and optional thumbs up/down feedback buttons.
 *
 * @param {SearchResultCardProps} props - Component properties
 * @returns {JSX.Element} The rendered search result card
 */
function SearchResultCard({ result, query, onClick, className, onFeedback }: SearchResultCardProps) {
  const { t } = useTranslation()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // Track feedback state: null = no feedback, 'up' = thumbs up, 'down' = thumbs down
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null)

  // Extract file extension from doc name
  const fileExt = result.doc_name?.split('.').pop() || result.file_type

  // Determine if this chunk has an associated image
  const imageUrl = result.image_url
    || (result.img_id ? `/api/documents/images/${result.img_id}` : undefined)

  /**
   * Handle thumbnail click -- open lightbox and prevent card click propagation.
   * @param e - The mouse event
   */
  function handleThumbnailClick(e: React.MouseEvent) {
    e.stopPropagation()
    setLightboxOpen(true)
  }

  /**
   * @description Handle feedback button click, toggle state, and notify parent.
   * @param {React.MouseEvent} e - Mouse event to stop propagation
   * @param {'up' | 'down'} type - Feedback type
   */
  function handleFeedback(e: React.MouseEvent, type: 'up' | 'down') {
    // Prevent card click when clicking feedback buttons
    e.stopPropagation()
    const newValue = feedback === type ? null : type
    setFeedback(newValue)

    // Only send feedback when toggling on (not when un-toggling)
    if (newValue && onFeedback) {
      onFeedback(type === 'up', result)
    }
  }

  return (
    <>
      <button
        onClick={() => onClick?.(result)}
        className={cn(
          'w-full text-left border rounded-xl p-4 hover:shadow-md hover:border-primary/30 transition-all group bg-background',
          className,
        )}
      >
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* File icon */}
          <div className="mt-0.5 shrink-0">{getFileIcon(fileExt)}</div>

          <div className="flex-1 min-w-0">
            {/* Document title */}
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground truncate">
                {result.doc_name}
              </h4>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </div>

            {/* Metadata row */}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {result.dataset_name && (
                <Badge variant="secondary" className="text-[10px]">
                  {result.dataset_name}
                </Badge>
              )}
              {(Array.isArray(result.page_num) ? (result.page_num[0] ?? 0) : result.page_num) > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {t('search.page')} {Array.isArray(result.page_num) ? result.page_num.join(', ') : result.page_num}
                </span>
              )}
            </div>
          </div>

          {/* Relevance score */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-1.5">
              <Progress value={result.score * 100} className="w-12 h-1.5" />
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(result.score * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Image thumbnail when chunk contains an image */}
        {imageUrl && (
          <div className="mt-2">
            <img
              src={imageUrl}
              alt={result.doc_name || 'Chunk image'}
              className="max-h-32 rounded object-cover cursor-zoom-in hover:opacity-80 transition-opacity"
              onClick={handleThumbnailClick}
            />
          </div>
        )}

        {/* Snippet with server-side highlight and expandable full content */}
        <div className="mt-2">
          <ChunkContentDisplay
            highlight={result.highlight ?? null}
            fullContent={result.content_with_weight ?? result.content ?? ''}
            query={query ?? ''}
          />
        </div>

        {/* Feedback buttons -- shown when onFeedback callback is provided */}
        {onFeedback && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', feedback === 'up' && 'text-green-500')}
              onClick={(e) => handleFeedback(e, 'up')}
              title={t('search.helpful')}
            >
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-6 w-6', feedback === 'down' && 'text-red-500')}
              onClick={(e) => handleFeedback(e, 'down')}
              title={t('search.notHelpful')}
            >
              <ThumbsDown className="h-3 w-3" />
            </Button>
            {/* Show thank-you text after submitting feedback */}
            {feedback && (
              <span className="text-[10px] text-muted-foreground ml-1">
                {t('search.feedbackThankYou')}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Image lightbox for full-size preview */}
      {imageUrl && (
        <ImageLightbox
          src={imageUrl}
          alt={result.doc_name || 'Chunk image'}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
        />
      )}
    </>
  )
}

export default SearchResultCard
