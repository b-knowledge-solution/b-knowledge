import { Spinner } from '@/components/ui/spinner';
import { useCallback, useEffect, useState } from 'react';

interface VideoPreviewerProps {
  className?: string;
  url: string;
}

export const VideoPreviewer: React.FC<VideoPreviewerProps> = ({ className, url }) => {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVideo = useCallback(async () => {
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
  }, [url]);

  useEffect(() => {
    if (url) fetchVideo();
  }, [url, fetchVideo]);

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
