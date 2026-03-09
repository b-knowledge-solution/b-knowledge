import { Spin } from 'antd';
import Papa from 'papaparse';
import React, { useEffect, useState } from 'react';

interface CSVData {
  rows: string[][];
  headers: string[];
}

interface CsvPreviewerProps {
  className?: string;
  url: string;
}

const CsvPreviewer: React.FC<CsvPreviewerProps> = ({ className, url }) => {
  const [data, setData] = useState<CSVData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadCSV = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load CSV');
        const blob = await res.blob();
        const reader = new FileReader();
        reader.readAsText(blob);
        reader.onload = () => {
          const result = Papa.parse<string[]>(reader.result as string, {
            header: false,
            skipEmptyLines: false,
          });
          const rows = result.data as string[][];
          const headers = rows[0] || [];
          setData({ headers, rows: rows.slice(1) });
          setIsLoading(false);
        };
      } catch {
        setIsLoading(false);
      }
    };
    loadCSV();
    return () => setData(null);
  }, [url]);

  return (
    <div className={`relative w-full h-full p-4 bg-white dark:bg-gray-900 rounded-md overflow-auto max-h-[80vh] ${className || ''}`}>
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spin size="large" />
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
