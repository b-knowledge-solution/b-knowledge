/**
 * @fileoverview Word document (.doc/.docx) previewer component.
 * Uses mammoth.js to convert DOCX to HTML for in-browser rendering.
 *
 * @module components/DocumentPreviewer/previews/DocPreview
 */

import { Spinner } from '@/components/ui/spinner';
import mammoth from 'mammoth';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Props for the DocPreviewer component */
interface DocPreviewerProps {
  /** Additional CSS classes */
  className?: string;
  /** URL to fetch the document from */
  url: string;
}

/**
 * @description Check if a blob starts with the ZIP magic bytes (PK header).
 * DOCX files are ZIP archives, so this validates the file format before parsing.
 * @param {Blob} blob - File blob to inspect
 * @returns {Promise<boolean>} True if the blob starts with ZIP magic bytes
 */
const isZipLikeBlob = async (blob: Blob): Promise<boolean> => {
  try {
    // Read first 4 bytes to check for ZIP signature (0x504B)
    const headerSlice = blob.slice(0, 4);
    const buf = await headerSlice.arrayBuffer();
    const bytes = new Uint8Array(buf);
    return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  } catch {
    return false;
  }
};

/**
 * @description Renders a Word document preview by converting DOCX to HTML via mammoth.js
 * @param {DocPreviewerProps} props - URL to fetch and optional class names
 * @returns {JSX.Element} Rendered document HTML or error state
 */
export const DocPreviewer: React.FC<DocPreviewerProps> = ({ className, url }) => {
  const { t } = useTranslation();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Fetch and convert document when URL changes
  useEffect(() => {
    if (!url) return;
    const fetchDocument = async () => {
      setLoading(true);
      try {
        // Fetch document with credentials for authenticated storage access
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load document');
        const blob = await res.blob();

        // Validate the file is a valid DOCX (ZIP archive) before parsing
        const looksLikeZip = await isZipLikeBlob(blob);
        if (!looksLikeZip) {
          setHtmlContent(
            `<div class="flex h-full items-center justify-center"><div class="border border-dashed rounded-xl p-8 max-w-2xl text-center"><p class="text-2xl font-bold mb-4">${t('preview.notAvailable')}</p><p class="italic text-sm leading-relaxed">${t('preview.docxOnly')}</p></div></div>`,
          );
          return;
        }

        // Convert DOCX binary to HTML using mammoth
        const arrayBuffer = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml(
          { arrayBuffer },
          { includeDefaultStyleMap: true },
        );
        // Inject Tailwind classes into generated HTML elements for spacing
        const styledContent = result.value
          .replace(/<p>/g, '<p class="mb-2">')
          .replace(/<h(\d)>/g, '<h$1 class="font-semibold mt-4 mb-2">');
        setHtmlContent(styledContent);
      } catch (err) {
        console.error('Error parsing document:', err);
        setHtmlContent(`<p class="text-red-500 text-center p-8">${t('preview.failedToParseDocument')}</p>`);
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
