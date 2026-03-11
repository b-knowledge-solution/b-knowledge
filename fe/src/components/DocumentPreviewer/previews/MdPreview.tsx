import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Spinner } from '@/components/ui/spinner';
import { AlertCircle } from 'lucide-react';

interface MdPreviewerProps {
  className?: string;
  url: string;
}

export const MdPreviewer: React.FC<MdPreviewerProps> = ({ url, className }) => {
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner />
      </div>
    );
  }

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
