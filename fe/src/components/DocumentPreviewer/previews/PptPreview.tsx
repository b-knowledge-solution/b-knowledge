import { useEffect, useRef } from 'react';
import { init } from 'pptx-preview';

interface PptPreviewerProps {
  className?: string;
  url: string;
}

export const PptPreviewer: React.FC<PptPreviewerProps> = ({ className, url }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!url || !containerRef.current) return;
    const fetchDocument = async () => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load PPT');
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        if (containerRef.current) {
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
