import React from 'react';
import { FileText } from 'lucide-react';
import type { Chunk } from '@/features/datasets/types';

interface ChunkCardProps {
  chunk: Chunk;
  index: number;
  isSelected?: boolean | undefined;
  onClick?: ((chunk: Chunk) => void) | undefined;
}

const ChunkCard: React.FC<ChunkCardProps> = ({ chunk, index, isSelected, onClick }) => {
  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
        isSelected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      onClick={() => onClick?.(chunk)}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-600 dark:text-gray-400">
          {index + 1}
        </span>
        {chunk.page_num && chunk.page_num.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <FileText size={12} />
            p.{chunk.page_num.join(', ')}
          </span>
        )}
        {chunk.score != null && (
          <span className="ml-auto text-xs font-mono text-gray-400">
            {chunk.score.toFixed(3)}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-4 whitespace-pre-wrap break-words">
        {chunk.text}
      </p>
    </div>
  );
};

export default ChunkCard;
