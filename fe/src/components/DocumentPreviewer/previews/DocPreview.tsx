import { Spinner } from '@/components/ui/spinner';
import mammoth from 'mammoth';
import { useEffect, useState } from 'react';

interface DocPreviewerProps {
  className?: string;
  url: string;
}

const isZipLikeBlob = async (blob: Blob): Promise<boolean> => {
  try {
    const headerSlice = blob.slice(0, 4);
    const buf = await headerSlice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  } catch {
    return false;
  }
};

export const DocPreviewer: React.FC<DocPreviewerProps> = ({ className, url }) => {
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) return;
    const fetchDocument = async () => {
      setLoading(true);
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load document');
        const blob = await res.blob();

        const looksLikeZip = await isZipLikeBlob(blob);
        if (!looksLikeZip) {
          setHtmlContent(
            '<div class="flex h-full items-center justify-center"><div class="border border-dashed rounded-xl p-8 max-w-2xl text-center"><p class="text-2xl font-bold mb-4">Preview not available</p><p class="italic text-sm leading-relaxed">Only modern .docx files are supported for preview.</p></div></div>',
          );
          return;
        }

        const arrayBuffer = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          { includeDefaultStyleMap: true },
        );
        const styledContent = result.value
          .replace(/<p>/g, '<p class="mb-2">')
          .replace(/<h(\d)>/g, '<h$1 class="font-semibold mt-4 mb-2">');
        setHtmlContent(styledContent);
      } catch (err) {
        console.error('Error parsing document:', err);
        setHtmlContent('<p class="text-red-500 text-center p-8">Failed to parse document</p>');
      } finally {
        setLoading(false);
      }
    };
    fetchDocument();
  }, [url]);

  return (
    <div className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md overflow-auto ${className || ''}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      )}
      {!loading && <div dangerouslySetInnerHTML={{ __html: htmlContent }} />}
    </div>
  );
};
