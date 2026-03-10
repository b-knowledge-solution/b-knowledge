/**
 * @fileoverview Lightbox dialog for viewing full-size images from search results.
 * @module features/ai/components/ImageLightbox
 */

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'

// ============================================================================
// Props
// ============================================================================

interface ImageLightboxProps {
  /** Image source URL */
  src: string
  /** Alt text for the image */
  alt?: string
  /** Whether the lightbox is open */
  open: boolean
  /** Callback to change open state */
  onOpenChange: (open: boolean) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * @description A dialog/modal component that displays a full-size image with
 * a dark backdrop. Supports keyboard escape to close.
 *
 * @param {ImageLightboxProps} props - Component properties
 * @returns {JSX.Element} The rendered lightbox dialog
 */
function ImageLightbox({ src, alt = 'Image preview', open, onOpenChange }: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-auto p-2 bg-black/90 border-none">
        {/* Accessible but visually hidden title */}
        <DialogTitle className="sr-only">{alt}</DialogTitle>

        {/* Full-size image */}
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-full object-contain rounded"
        />
      </DialogContent>
    </Dialog>
  )
}

export default ImageLightbox
