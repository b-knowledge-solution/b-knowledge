import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/ui/spinner';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { datasetApi } from '@/features/datasets/api/datasetApi';
import type { Chunk } from '@/features/datasets/types';
import ChunkCard from './ChunkCard';

interface ChunkListProps {
  datasetId: string;
  docId: string;
  selectedChunk?: Chunk | null | undefined;
  onSelectChunk?: ((chunk: Chunk) => void) | undefined;
}

const PAGE_SIZE = 20;

const ChunkList: React.FC<ChunkListProps> = ({
  datasetId,
  docId,
  selectedChunk,
  onSelectChunk,
}) => {
  const { t } = useTranslation();
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fetchChunks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await datasetApi.listChunks(datasetId, {
        doc_id: docId,
        page,
        limit: PAGE_SIZE,
      });
      setChunks(res.chunks);
      setTotal(res.total);
    } catch (error) {
      console.error('Failed to fetch chunks:', error);
    } finally {
      setLoading(false);
    }
  }, [datasetId, docId, page]);

  useEffect(() => {
    fetchChunks();
  }, [fetchChunks]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {t('datasets.chunks', 'Chunks')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {total} {t('datasets.chunksTotal', 'total')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Spinner />
          </div>
        ) : chunks.length === 0 ? (
          <EmptyState title={t('datasets.noChunks', 'No chunks found')} />
        ) : (
          chunks.map((chunk, index) => (
            <ChunkCard
              key={chunk.chunk_id}
              chunk={chunk}
              index={(page - 1) * PAGE_SIZE + index}
              isSelected={selectedChunk?.chunk_id === chunk.chunk_id}
              onClick={onSelectChunk}
            />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
};

export default ChunkList;
