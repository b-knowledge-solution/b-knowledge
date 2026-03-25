/**
 * @fileoverview Image reference carousel for assistant messages.
 *
 * Displays a responsive grid of images extracted from document chunks that
 * were cited in the assistant's answer. Images are loaded from the backend
 * via /api/rag/images/:imageId endpoint.
 *
 * Mirrors RAGFlow's ReferenceImageList component behavior:
 * - Extracts cited chunk indices from message text
 * - Filters chunks that have img_id (image content)
 * - Renders responsive grid with figure labels
 *
 * @module features/chat/components/ReferenceImageList
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ChatChunk } from '../types/chat.types'

// ============================================================================
// Helpers
// ============================================================================

/** Regex to extract cited chunk indices from message text — all marker formats */
const CITATION_INDEX_REG = /##ID:(\d+)\$|##(\d+)\$\$|\[ID:(\d+)\]/g

/**
 * @description Extract all cited chunk indices from message content.
 * @param {string} content - Message text with citation markers
 * @returns {Set<number>} Set of cited chunk indices (0-based)
 */
function extractCitedIndices(content: string): Set<number> {
  const indices = new Set<number>()
  let match: RegExpExecArray | null
  const regex = new RegExp(CITATION_INDEX_REG.source, 'g')
  while ((match = regex.exec(content)) !== null) {
    // Match groups: [1] = ##ID:n$, [2] = ##n$$, [3] = [ID:n]
    const idx = match[1] ?? match[2] ?? match[3]
    if (idx != null) indices.add(Number(idx))
  }
  return indices
}

// ============================================================================
// Props
// ============================================================================

interface ReferenceImageListProps {
  /** Array of reference chunks (may or may not contain images) */
  chunks: ChatChunk[] | undefined
  /** Message content text — used to determine which chunks are cited */
  messageContent: string
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * @description Full-screen image lightbox with zoom, rotate, and close controls.
 * Opens when user clicks a thumbnail. Supports keyboard shortcuts (Escape to close,
 * +/- for zoom). Matches RAGFlow's photo viewer behavior.
 */
function ImageLightbox({
  imageId,
  index,
  onClose,
}: {
  imageId: string
  index: number
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 0.25, 4)), [])
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 0.25, 0.25)), [])
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), [])
  const resetView = useCallback(() => { setZoom(1); setRotation(0) }, [])

  // Keyboard shortcuts: Escape to close, +/- for zoom
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoomIn()
      else if (e.key === '-') zoomOut()
      else if (e.key === 'r') rotate()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, zoomIn, zoomOut, rotate])

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }, [zoomIn, zoomOut])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1 z-10">
        <span className="text-xs text-white/70 px-2">Fig. {index + 1}</span>
        <div className="w-px h-4 bg-white/20" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={zoomOut} title="Zoom out (-)">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <button
          className="text-xs text-white/70 hover:text-white w-12 text-center"
          onClick={resetView}
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={zoomIn} title="Zoom in (+)">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-white/20" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={rotate} title="Rotate (R)">
          <RotateCw className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-white/20" />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={onClose} title="Close (Esc)">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Image with zoom and rotate transforms */}
      <div className="flex-1 flex items-center justify-center overflow-hidden w-full" onWheel={handleWheel}>
        <img
          src={`/api/rag/images/${imageId}`}
          alt={`Fig. ${index + 1}`}
          className="transition-transform duration-200 ease-out select-none"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            maxWidth: '90vw',
            maxHeight: '85vh',
            objectFit: 'contain',
          }}
          draggable={false}
        />
      </div>
    </div>
  )
}

/**
 * @description Single image card with figure label. Opens fullscreen lightbox on click.
 * @param {{ imageId: string; index: number }} props - Image ID and display index
 * @returns {JSX.Element} Image card with lightbox
 */
function ImageCard({ imageId, index }: { imageId: string; index: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <figure
        className="relative cursor-pointer group overflow-hidden rounded-lg border border-border/50 bg-muted/30"
        onClick={() => setExpanded(true)}
      >
        <img
          src={`/api/rag/images/${imageId}`}
          alt={`Fig. ${index + 1}`}
          className="w-full h-auto max-h-48 object-contain transition-transform group-hover:scale-105"
          loading="lazy"
        />
        <figcaption className="absolute bottom-0 right-0 text-[10px] font-medium bg-black/60 text-white px-1.5 py-0.5 rounded-tl">
          Fig. {index + 1}
        </figcaption>
      </figure>

      {/* Portal to document.body so lightbox escapes overflow-hidden ancestors */}
      {expanded && createPortal(
        <ImageLightbox
          imageId={imageId}
          index={index}
          onClose={() => setExpanded(false)}
        />,
        document.body,
      )}
    </>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description Renders a responsive grid of images from cited chunks.
 * Only shows images that were actually cited in the message text.
 * Skips rendering entirely if no image chunks are cited.
 *
 * @param {ReferenceImageListProps} props - Component properties
 * @returns {JSX.Element | null} Image grid or null if no images
 */
export function ReferenceImageList({ chunks, messageContent }: ReferenceImageListProps) {
  const imageItems = useMemo(() => {
    if (!chunks?.length || !messageContent) return []

    // Find which chunk indices are cited in the message
    const citedIndices = extractCitedIndices(messageContent)

    // Filter to chunks that have images AND are cited
    return chunks
      .map((chunk, index) => ({ chunk, index }))
      .filter(({ chunk, index }) => chunk.img_id && citedIndices.has(index))
  }, [chunks, messageContent])

  // Don't render anything if no image chunks are cited
  if (imageItems.length === 0) return null

  return (
    <div
      className={cn(
        'grid gap-2 mt-2',
        // Responsive columns based on image count
        imageItems.length === 1
          ? 'grid-cols-1 max-w-xs'
          : imageItems.length === 2
            ? 'grid-cols-2 max-w-md'
            : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
      )}
    >
      {imageItems.map(({ chunk, index }) => (
        <ImageCard
          key={chunk.chunk_id}
          imageId={chunk.img_id!}
          index={index}
        />
      ))}
    </div>
  )
}
