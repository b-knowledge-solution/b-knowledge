/**
 * @fileoverview PDF previewer using pdfjs-dist directly with custom highlight overlay.
 * Replaces react-pdf-highlighter which crashes in React 18/19 due to
 * getPageView timing issues in componentDidUpdate.
 *
 * Renders PDF pages as canvas elements and overlays highlight rectangles
 * based on chunk position data from the selected chunk.
 *
 * @module components/DocumentPreviewer/previews/PdfPreview
 */

import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { TextLayer } from 'pdfjs-dist'
// Vite resolves the worker file as a URL via ?url import
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
// Text layer CSS for text selection support (extracted from pdfjs-dist/web/pdf_viewer.css
// to avoid importing generic .dialog/.messageBar rules that conflict with app styles)
import './pdf-text-layer.css'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, ZoomIn, ZoomOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { IHighlight } from 'react-pdf-highlighter'

// Configure pdf.js worker using Vite-resolved URL
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

/**
 * @description Props for the PdfPreview component.
 */
export interface PdfPreviewProps {
  /** Array of highlight regions to display on the PDF */
  highlights?: IHighlight[] | undefined
  /** Callback to report PDF page dimensions for highlight coordinate mapping */
  setWidthAndHeight?: ((width: number, height: number) => void) | undefined
  /** URL to fetch the PDF from */
  url: string
  /** Additional CSS classes */
  className?: string | undefined
  /** Page number to scroll to on initial load (1-based). Used as fallback when no highlights exist. */
  initialPage?: number | undefined
}

/**
 * @description Render a single PDF page into a canvas element with text layer for selection
 * @param page - pdfjs page proxy
 * @param scale - zoom scale
 * @param pageNum - 1-based page number
 * @returns Object containing the page wrapper div and overlay canvas
 */
async function renderPage(
  page: pdfjsLib.PDFPageProxy,
  scale: number,
  pageNum: number,
): Promise<{ pageDiv: HTMLDivElement; overlay: HTMLCanvasElement }> {
  const vp = page.getViewport({ scale })

  // Create wrapper div for this page
  const pageDiv = document.createElement('div')
  pageDiv.className = 'pdf-page relative mb-2'
  pageDiv.style.width = `${vp.width}px`
  pageDiv.style.height = `${vp.height}px`
  pageDiv.setAttribute('data-page', String(pageNum))

  // Create canvas for PDF rendering
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio
  canvas.width = vp.width * dpr
  canvas.height = vp.height * dpr
  canvas.style.width = `${vp.width}px`
  canvas.style.height = `${vp.height}px`
  const ctx = canvas.getContext('2d')!
  ctx.scale(dpr, dpr)

  // Create text layer container for text selection and search (sits between canvas and overlay)
  // The pdfjs CSS (.textLayer) handles position:absolute and inset:0
  const textLayerDiv = document.createElement('div')
  textLayerDiv.className = 'textLayer'
  textLayerDiv.style.zIndex = '1'

  // Create overlay canvas for highlights (transparent, on top of text layer)
  const overlay = document.createElement('canvas')
  overlay.className = 'highlight-overlay'
  overlay.width = vp.width * dpr
  overlay.height = vp.height * dpr
  overlay.style.width = `${vp.width}px`
  overlay.style.height = `${vp.height}px`
  overlay.style.position = 'absolute'
  overlay.style.top = '0'
  overlay.style.left = '0'
  overlay.style.zIndex = '2'
  overlay.style.pointerEvents = 'none'

  // Stack: canvas (bottom) → text layer (middle, selectable) → overlay (top, pointer-events: none)
  pageDiv.appendChild(canvas)
  pageDiv.appendChild(textLayerDiv)
  pageDiv.appendChild(overlay)

  // Render PDF page content to canvas (pdfjs v5+ requires canvas instead of canvasContext)
  await page.render({ canvas, viewport: vp } as any).promise

  // Render text layer for text selection and browser search (Ctrl+F)
  const textContent = await page.getTextContent()
  const textLayer = new TextLayer({
    textContentSource: textContent,
    container: textLayerDiv,
    viewport: vp,
  })
  await textLayer.render()

  return { pageDiv, overlay }
}

/**
 * @description Draw highlight rectangles on overlay canvases and scroll to first match.
 * @param container - The div containing all PDF page elements
 * @param scrollParent - The scrollable container for scroll-to-highlight
 * @param highlights - Array of highlight objects with position data
 */
function drawHighlights(
  container: HTMLDivElement,
  scrollParent: HTMLDivElement | null,
  highlights: IHighlight[],
) {
  // Clear all existing overlay highlights
  container.querySelectorAll('.highlight-overlay').forEach((el) => {
    const ctx = (el as HTMLCanvasElement).getContext('2d')
    if (ctx) {
      const c = el as HTMLCanvasElement
      ctx.clearRect(0, 0, c.width, c.height)
    }
  })

  if (!highlights.length) return

  let scrollTarget: HTMLElement | null = null
  const dpr = window.devicePixelRatio

  for (const highlight of highlights) {
    if (!highlight.position?.rects) continue

    // boundingRect.width/height is the PDF page size at scale=1 (in points)
    const refWidth = highlight.position.boundingRect?.width || 1
    const refHeight = highlight.position.boundingRect?.height || 1

    for (const rect of highlight.position.rects) {
      const pageNum = (rect as any).pageNumber || highlight.position.pageNumber || 1
      const pageDiv = container.querySelector(`[data-page="${pageNum}"]`)
      if (!pageDiv) continue

      const overlay = pageDiv.querySelector('.highlight-overlay') as HTMLCanvasElement
      if (!overlay) continue

      const ctx = overlay.getContext('2d')
      if (!ctx) continue

      // Reset transform — draw at device pixel ratio for crisp lines
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Scale PDF points to canvas display pixels
      const canvasW = overlay.width / dpr
      const canvasH = overlay.height / dpr
      const scaleX = canvasW / refWidth
      const scaleY = canvasH / refHeight

      const x = (rect as any).x1 * scaleX
      const y = (rect as any).y1 * scaleY
      const w = ((rect as any).x2 - (rect as any).x1) * scaleX
      const h = ((rect as any).y2 - (rect as any).y1) * scaleY

      // Skip zero-size highlights (invalid coordinates)
      if (w <= 0 || h <= 0) continue

      // Draw filled highlight rectangle
      ctx.fillStyle = 'rgba(255, 226, 143, 0.4)'
      ctx.fillRect(x, y, w, h)
      // Draw border for visibility
      ctx.strokeStyle = 'rgba(255, 180, 0, 0.8)'
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, w, h)

      // Track first highlight page for scrolling
      if (!scrollTarget) {
        scrollTarget = pageDiv as HTMLElement
      }
    }
  }

  // Scroll to the first highlighted page
  if (scrollTarget && scrollParent) {
    requestAnimationFrame(() => {
      const parentRect = scrollParent.getBoundingClientRect()
      const targetRect = scrollTarget!.getBoundingClientRect()
      const offsetTop = targetRect.top - parentRect.top + scrollParent.scrollTop
      scrollParent.scrollTo({
        top: Math.max(0, offsetTop - 40),
        behavior: 'smooth',
      })
    })
  }
}

/**
 * @description Renders a PDF using pdfjs-dist with custom highlight overlay.
 * Each page is rendered as a canvas. Highlight rectangles are drawn on
 * a transparent overlay canvas matching the page dimensions.
 */
const PdfPreview = ({
  highlights: state,
  setWidthAndHeight,
  url,
  className,
  initialPage,
}: PdfPreviewProps) => {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.2)
  // Counter that increments when all pages are in the DOM
  const [renderVersion, setRenderVersion] = useState(0)

  // Load and render all PDF pages
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const loadPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url })
        const pdf = await loadingTask.promise
        if (cancelled) return
        setNumPages(pdf.numPages)

        // Report first page dimensions for highlight coordinate mapping
        const firstPage = await pdf.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })
        setWidthAndHeight?.(viewport.width, viewport.height)

        // Render each page into the container
        const container = containerRef.current
        if (!container) return

        // Remove existing page elements safely
        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const { pageDiv } = await renderPage(page, scale, i)
          container.appendChild(pageDiv)
        }

        setLoading(false)
        // Bump render version to trigger highlight drawing
        setRenderVersion((v) => v + 1)
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to load PDF')
          setLoading(false)
        }
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [url, scale])

  // Draw highlights whenever they change OR pages finish rendering.
  // Uses a small timeout to ensure React has committed all pending state updates
  // (parent may update pdfSize after setWidthAndHeight, causing new highlights prop).
  useEffect(() => {
    if (renderVersion === 0) return
    if (!state?.length) return

    // Delay to let parent re-render with updated pdfSize → new highlights
    const timer = setTimeout(() => {
      if (containerRef.current) {
        drawHighlights(containerRef.current, scrollRef.current, state)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [state, renderVersion])

  // Also re-draw when highlights change after initial render
  useEffect(() => {
    if (renderVersion === 0 || !state?.length) return
    if (containerRef.current) {
      drawHighlights(containerRef.current, scrollRef.current, state)
    }
  }, [state])

  // Scroll to initialPage when no highlights exist (fallback for chunks without position data)
  useEffect(() => {
    if (renderVersion === 0) return
    // Skip if highlights will handle scrolling
    if (state?.length) return
    if (!initialPage || initialPage < 1) return

    const container = containerRef.current
    const scrollParent = scrollRef.current
    if (!container || !scrollParent) return

    const pageDiv = container.querySelector(`[data-page="${initialPage}"]`)
    if (!pageDiv) return

    requestAnimationFrame(() => {
      const parentRect = scrollParent.getBoundingClientRect()
      const targetRect = pageDiv.getBoundingClientRect()
      const offsetTop = targetRect.top - parentRect.top + scrollParent.scrollTop
      scrollParent.scrollTo({
        top: Math.max(0, offsetTop - 40),
        behavior: 'smooth',
      })
    })
  }, [renderVersion, initialPage, state])

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-full text-destructive p-8 ${className || ''}`}>
        <AlertCircle className="w-12 h-12 mb-2" />
        <p className="text-sm">{t('preview.failedToLoadPdf', 'Failed to load PDF')}</p>
        <p className="text-xs text-muted-foreground mt-1">{error}</p>
      </div>
    )
  }

  return (
    <div className={`w-full h-full flex flex-col ${className || ''}`}>
      {/* Zoom toolbar */}
      <div className="flex items-center justify-center gap-2 py-1.5 px-3 border-b bg-muted/30 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.max(0.5, s - 0.2))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.min(3, s + 0.2))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        {numPages > 0 && (
          <span className="text-xs text-muted-foreground ml-2">{numPages} pages</span>
        )}
      </div>

      {/* PDF pages container */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/20">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        )}
        <div
          ref={containerRef}
          className="flex flex-col items-center py-4 gap-2"
        />
      </div>
    </div>
  )
}

export default PdfPreview
export { PdfPreview }
