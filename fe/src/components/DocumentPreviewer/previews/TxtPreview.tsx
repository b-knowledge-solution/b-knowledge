import { Spinner } from '@/components/ui/spinner';
import { useEffect, useState } from 'react';

interface TxtPreviewerProps {
  className?: string;
  url: string;
}

export const TxtPreviewer: React.FC<TxtPreviewerProps> = ({ className, url }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<string>('');

  useEffect(() => {
    if (!url) { setData(''); return; }
    const fetchTxt = async () => {
      setLoading(true);
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load file');
        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsText(blob);
        reader.onload = () => {
          setData(reader.result as string);
          setLoading(false);
        };
      } catch {
        setLoading(false);
      }
    };
    fetchTxt();
  }, [url]);

  return (
    <div className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md overflow-auto ${className || ''}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {!loading && <pre className="whitespace-pre-wrap p-2 text-sm text-gray-800 dark:text-gray-200">{data}</pre>}
    </div>
  );
};
