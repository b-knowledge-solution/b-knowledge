import jsPreviewExcel from '@js-preview/excel';
import { useEffect, useRef } from 'react';

interface ExcelPreviewerProps {
  className?: string;
  url: string;
}

export const ExcelPreviewer: React.FC<ExcelPreviewerProps> = ({ className, url }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchAndPreview = async () => {
    if (!containerRef.current || !url) return;
    const myExcelPreviewer = jsPreviewExcel.init(containerRef.current);
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load file');
      const arrayBuffer = await res.arrayBuffer();
      await myExcelPreviewer.preview(arrayBuffer);
    } catch (e) {
      console.warn('Excel preview failed', e);
      myExcelPreviewer.destroy();
    }
  }

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
