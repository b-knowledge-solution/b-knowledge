/**
 * @fileoverview Image file previewer component.
 * Fetches an image via authenticated request and displays it as an object URL.
 *
 * @module components/DocumentPreviewer/previews/ImagePreview
 */

import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';

/** Props for the ImagePreviewer component */
interface ImagePreviewerProps {
  /** Additional CSS classes */
  className?: string;
  /** URL to fetch the image from */
  url: string;
}

/**
 * @description Fetches and displays an image with loading state via blob URL
 * @param {ImagePreviewerProps} props - URL to fetch and optional class names
 * @returns {JSX.Element} Image element with loading spinner
 */
export const ImagePreviewer: React.FC<ImagePreviewerProps> = ({ className, url }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch image blob and create object URL when source URL changes
  useEffect(() => {
    if (!url) return;
    const fetchImage = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load image');
        const blob = await res.blob();
        setImageSrc(URL.createObjectURL(blob));
      } catch {
        // noop
      } finally {
        setIsLoading(false);
      }
    };
    fetchImage();
  }, [url]);

  // Revoke object URL on cleanup to prevent memory leaks
  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  return (
    <div className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md max-h-[80vh] overflow-auto ${className || ''}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {!isLoading && imageSrc && (
        <img
          src={imageSrc}
          alt="preview"
          className="w-full h-auto max-w-full object-contain"
        />
      )}
    </div>
  );
};
