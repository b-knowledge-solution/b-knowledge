import { memo, useEffect, useRef } from 'react';
import {
  AreaHighlight,
  Highlight,
  IHighlight,
  PdfHighlighter,
  PdfLoader,
  Popup,
} from 'react-pdf-highlighter';
import { Spin } from 'antd';
import { AlertCircle } from 'lucide-react';

// react-pdf-highlighter uses class components incompatible with React 18 strict types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Loader = PdfLoader as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Highlighter = PdfHighlighter as any;

export interface PdfPreviewProps {
  highlights?: IHighlight[] | undefined;
  setWidthAndHeight?: ((width: number, height: number) => void) | undefined;
  url: string;
  className?: string | undefined;
}

const HighlightPopup = ({
  comment,
}: {
  comment: { text: string; emoji: string };
}) =>
  comment.text ? (
    <div className="Highlight__popup">
      {comment.emoji} {comment.text}
    </div>
  ) : null;

const PdfPreview = ({
  highlights: state,
  setWidthAndHeight,
  url,
  className,
}: PdfPreviewProps) => {
  const ref = useRef<(highlight: IHighlight) => void>(() => {});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (state?.length && state.length > 0) {
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
            <Spin size="large" />
          </div>
        }
        workerSrc="/pdfjs-dist/pdf.worker.min.js"
        errorMessage={
          <div className="flex flex-col items-center justify-center h-full text-red-500 p-8">
            <AlertCircle className="w-12 h-12 mb-2" />
            <p>Failed to load PDF</p>
          </div>
        }
      >
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(pdfDocument: any) => {
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
                const isTextHighlight = !Boolean(
                  highlight.content && highlight.content.image,
                );

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
