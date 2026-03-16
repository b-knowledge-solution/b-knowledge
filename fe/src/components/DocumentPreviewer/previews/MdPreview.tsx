/**
 * @fileoverview Markdown file previewer component.
 * Fetches raw markdown content and renders it with GFM support.
 *
 * @module components/DocumentPreviewer/previews/MdPreview
 */

import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle } from 'lucide-react';

/** Props for the MdPreviewer component */
interface MdPreviewerProps {
  /** Additional CSS classes */
  className?: string;
  /** URL to fetch the markdown file from */
  url: string;
}

/**
 * @description Fetches and renders a markdown file with GitHub-flavored markdown support
 * @param {MdPreviewerProps} props - URL to fetch and optional class names
 * @returns {JSX.Element} Rendered markdown content or loading/error state
 */
export const MdPreviewer: React.FC<MdPreviewerProps> = ({ url, className }) => {
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch raw markdown content when URL changes
  useEffect(() => {
    setError(null);
    setLoading(true);
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch markdown file');
        return res.text();
      })
      .then((text) => setContent(text))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [url]);

  // Show spinner while fetching
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

  // Show error message if fetch failed
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 p-8">
        <AlertCircle className="w-12 h-12 mb-2" />
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={`p-4 overflow-auto h-full prose dark:prose-invert max-w-none ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
};
