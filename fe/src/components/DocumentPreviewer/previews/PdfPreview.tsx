/**
 * @fileoverview PDF previewer with chunk highlight overlay support.
 * Uses react-pdf-highlighter for rendering PDFs with area/text highlights
 * that correspond to selected chunks.
 *
 * @module components/DocumentPreviewer/previews/PdfPreview
 */

import { memo, useEffect, useRef } from 'react';
import {
  AreaHighlight,
  Highlight,
  IHighlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
} from 'react-pdf-highlighter';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// react-pdf-highlighter uses class components incompatible with React 18 strict types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Loader = PdfLoader as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Highlighter = PdfHighlighter as any;

/**
 * @description Props for the PdfPreview component.
 */
export interface PdfPreviewProps {
  /** Array of highlight regions to display on the PDF */
  highlights?: IHighlight[] | undefined;
  /** Callback to report PDF page dimensions for highlight coordinate mapping */
  setWidthAndHeight?: ((width: number, height: number) => void) | undefined;
  /** URL to fetch the PDF from */
  url: string;
  /** Additional CSS classes */
  className?: string | undefined;
}

/** Popup content shown on hover over a highlight region */
const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; emoji: string };
}) =>
  // Only render popup if there is comment text
  comment.text ? (
    <div className="Highlight__popup">
      {comment.emoji} {comment.text}
    </div>
  ) : null;

/**
 * @description Renders a PDF with interactive highlight overlay for chunk visualization
 * @param {PdfPreviewProps} props - PDF URL, highlights, and dimension callback
 * @returns {JSX.Element} PDF viewer with highlight support
 */
const PdfPreview = ({
  highlights: state,
  setWidthAndHeight,
  url,
  className,
}: PdfPreviewProps) => {
  const { t } = useTranslation();
  const ref = useRef<(highlight: IHighlight) => void>(() => {});

  // Auto-scroll to the first highlight when highlights change
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (state?.length && state.length > 0) {
      // Delay scroll to ensure PDF has rendered the highlight elements
      timer = setTimeout(() => {
        if (state[0]) ref?.current(state[0]);
      }, 100);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state]);

  return (
    <div
      className={`w-full h-[calc(100vh-180px)] relative rounded-lg overflow-hidden ${className || ''}`}
    >
      <style>{`
        .PdfHighlighter { overflow-x: hidden; }
        .Highlight--scrolledTo .Highlight__part {
          background-color: rgba(255, 226, 143, 1) !important;
        }
      `}</style>
      <Loader
        url={url}
        beforeLoad={
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        }
        workerSrc="/pdfjs-dist/pdf.worker.min.js"
        errorMessage={
          <div className="flex flex-col items-center justify-center h-full text-red-500 p-8">
            <AlertCircle className="w-12 h-12 mb-2" />
            <p>{t('preview.failedToLoadPdf')}</p>
          </div>
        }
      >
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(pdfDocument: any) => {
          // Extract first page dimensions to support coordinate-based highlights
          pdfDocument.getPage(1).then((page: any) => {
            const viewport = page.getViewport({ scale: 1 });
            setWidthAndHeight?.(viewport.width, viewport.height);
          });

          return (
            <Highlighter
              pdfDocument={pdfDocument}
              enableAreaSelection={(event: MouseEvent) => event.altKey}
              onScrollChange={() => {}}
              scrollRef={(scrollTo: (highlight: IHighlight) => void) => {
                ref.current = scrollTo;
              }}
              onSelectionFinished={() => null}
              highlightTransform={(
                highlight: any,
                index: number,
                setTip: any,
                hideTip: any,
                _viewportToScaled: any,
                _screenshot: any,
                isScrolledTo: boolean,
              ) => {
                // Distinguish between text highlights and area (image) highlights
                const isTextHighlight = !Boolean(
                  highlight.content && highlight.content.image,
                );

                // Use text Highlight for text selections, AreaHighlight for region selections
                const component = isTextHighlight ? (
                  <Highlight
                    isScrolledTo={isScrolledTo}
                    position={highlight.position}
                    comment={highlight.comment}
                  />
                ) : (
                  <AreaHighlight
                    isScrolledTo={isScrolledTo}
                    highlight={highlight}
                    onChange={() => {}}
                  />
                );

                return (
                  <Popup
                    popupContent={<HighlightPopup {...highlight} />}
                    onMouseOver={(popupContent: React.ReactElement) =>
                      setTip(highlight, () => popupContent)
                    }
                    onMouseOut={hideTip}
                    key={index}
                  >
                    {component}
                  </Popup>
                );
              }}
              highlights={state || []}
            />
          );
        }}
      </Loader>
    </div>
  );
};

export default memo(PdfPreview);
export { PdfPreview };
