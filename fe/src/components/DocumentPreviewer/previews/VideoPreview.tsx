/**
 * @fileoverview Video file previewer component.
 * Fetches video content via authenticated request and plays it with native controls.
 *
 * @module components/DocumentPreviewer/previews/VideoPreview
 */

import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';

/** Props for the VideoPreviewer component */
interface VideoPreviewerProps {
  /** Additional CSS classes */
  className?: string;
  /** URL to fetch the video from */
  url: string;
}

/**
 * @description Fetches and displays a video with native HTML5 controls via blob URL
 * @param {VideoPreviewerProps} props - URL to fetch and optional class names
 * @returns {JSX.Element} Video player with loading spinner
 */
export const VideoPreviewer: React.FC<VideoPreviewerProps> = ({ className, url }) => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Fetch video blob and create an object URL for playback */
  const fetchVideo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load video');
      const blob = await res.blob();
      setVideoSrc(URL.createObjectURL(blob));
    } catch {
      // noop
    } finally {
      setIsLoading(false);
    }
  }

  // Fetch video when URL changes
  useEffect(() => {
    if (url) fetchVideo();
  }, [url]);

  // Revoke object URL on cleanup to prevent memory leaks
  useEffect(() => {
    return () => {
      if (videoSrc) URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  return (
    <div className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md overflow-auto ${className || ''}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {!isLoading && videoSrc && (
        <video
          src={videoSrc}
          controls
          className="w-full h-auto max-w-full object-contain"
        />
      )}
    </div>
  );
};
