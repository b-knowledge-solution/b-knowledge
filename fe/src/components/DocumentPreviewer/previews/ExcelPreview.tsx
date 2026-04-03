/**
 * @fileoverview Excel spreadsheet previewer component.
 * Uses @js-preview/excel to render Excel files in the browser.
 *
 * @module components/DocumentPreviewer/previews/ExcelPreview
 */

import jsPreviewExcel from '@js-preview/excel';
import { useEffect, useRef } from 'react';

/** Props for the ExcelPreviewer component */
interface ExcelPreviewerProps {
  /** Additional CSS classes */
  className?: string;
  /** URL to fetch the Excel file from */
  url: string;
}

/**
 * @description Renders an Excel spreadsheet preview using the js-preview-excel library
 * @param {ExcelPreviewerProps} props - URL to fetch and optional class names
 * @returns {JSX.Element} Container div that the Excel previewer renders into
 */
export const ExcelPreviewer: React.FC<ExcelPreviewerProps> = ({ className, url }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  /** Fetch the Excel file and render it into the container element */
  const fetchAndPreview = async () => {
    // Guard: skip if container or URL not ready
    if (!containerRef.current || !url) return;
    // Initialize the Excel previewer in the container DOM node
    const myExcelPreviewer = jsPreviewExcel.init(containerRef.current);
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load file');
      const arrayBuffer = await res.arrayBuffer();
      await myExcelPreviewer.preview(arrayBuffer);
    } catch (e) {
      console.warn('Excel preview failed', e);
      // Destroy the previewer instance on failure to avoid memory leaks
      myExcelPreviewer.destroy();
    }
  }

  // Re-fetch and preview when URL changes
  useEffect(() => {
    fetchAndPreview();
  }, [url]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md overflow-auto ${className || ''}`}
    />
  );
};
