/**
 * @fileoverview CSV file previewer component.
 * Fetches and parses CSV data using PapaParse, rendering it as an HTML table.
 *
 * @module components/DocumentPreviewer/previews/CsvPreview
 */

import { Spinner } from '@/components/ui/spinner';
import Papa from 'papaparse';
import React, { useEffect, useState } from 'react';

/** Parsed CSV data with separate headers and rows */
interface CSVData {
  rows: string[][];
  headers: string[];
}

/** Props for the CsvPreviewer component */
interface CsvPreviewerProps {
  /** Additional CSS classes */
  className?: string;
  /** URL to fetch the CSV file from */
  url: string;
}

/**
 * @description Fetches and renders CSV file content as a styled HTML table
 * @param {CsvPreviewerProps} props - URL to fetch and optional class names
 * @returns {JSX.Element} Table rendering of the CSV data
 */
const CsvPreviewer: React.FC<CsvPreviewerProps> = ({ className, url }) => {
  const [data, setData] = useState<CSVData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch and parse CSV when URL changes
  useEffect(() => {
    const loadCSV = async () => {
      setIsLoading(true);
      try {
        // Fetch CSV with credentials for authenticated access
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load CSV');
        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsText(blob);
        reader.onload = () => {
          // Parse CSV without header mode to treat first row as headers manually
          const result = Papa.parse<string[]>(reader.result as string, {
            header: false,
            skipEmptyLines: false,
          });
          const rows = result.data as string[][];
          // Extract first row as headers, remaining as data rows
          const headers = rows[0] || [];
          setData({ headers, rows: rows.slice(1) });
          setIsLoading(false);
        };
      } catch {
        setIsLoading(false);
      }
    };
    loadCSV();
    // Clean up data on URL change
    return () => setData(null);
  }, [url]);

  return (
    <div className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md overflow-auto max-h-[80vh] ${className || ''}`}>
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner />
        </div>
      ) : data ? (
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {data.headers.map((header, i) => (
                <th key={i} className="px-6 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {data.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {cell || '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
};

export default CsvPreviewer;
