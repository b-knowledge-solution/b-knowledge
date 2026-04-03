/**
 * @fileoverview PowerPoint file previewer component.
 * Uses pptx-preview library to render PPTX slides in the browser.
 *
 * @module components/DocumentPreviewer/previews/PptPreview
 */

import { useEffect, useRef } from 'react';
import { init } from 'pptx-preview';

/** Props for the PptPreviewer component */
interface PptPreviewerProps {
  /** Additional CSS classes */
  className?: string;
  /** URL to fetch the PowerPoint file from */
  url: string;
}

/**
 * @description Renders a PowerPoint presentation preview using the pptx-preview library
 * @param {PptPreviewerProps} props - URL to fetch and optional class names
 * @returns {JSX.Element} Container div that the PPTX previewer renders into
 */
export const PptPreviewer: React.FC<PptPreviewerProps> = ({ className, url }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch and render PPTX when URL changes
  useEffect(() => {
    if (!url || !containerRef.current) return;
    const fetchDocument = async () => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load PPT');
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        if (containerRef.current) {
          // Size the previewer to fit the container with padding
          const width = containerRef.current.clientWidth - 50;
          const height = containerRef.current.clientHeight - 50;
          const pptxPreviewer = init(containerRef.current, { width, height });
          pptxPreviewer.preview(arrayBuffer);
        }
      } catch (err) {
        console.error('PPT preview failed:', err);
      }
    };
    fetchDocument();
  }, [url]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md overflow-auto ${className || ''}`}
    />
  );
};
