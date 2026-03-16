/**
 * @fileoverview Paginated chunk list panel for the document previewer.
 * Displays searchable, paginated list of document chunks with CRUD operations.
 *
 * @module components/DocumentPreviewer/ChunkList
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Pagination } from '@/components/ui/pagination';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useChunks } from '@/features/datasets/api/datasetQueries';
import type { Chunk } from '@/features/datasets/types';
import ChunkCard from './ChunkCard';
import AddChunkModal from '@/features/datasets/components/AddChunkModal';

/**
 * @description Props for the ChunkList component.
 */
interface ChunkListProps {
  /** Dataset ID that owns the document */
  datasetId: string;
  /** Document ID to load chunks for */
  docId: string;
  /** Currently selected chunk (controlled from parent) */
  selectedChunk?: Chunk | null | undefined;
  /** Callback when a chunk is selected */
  onSelectChunk?: ((chunk: Chunk) => void) | undefined;
}

/**
 * @description Displays a searchable, paginated list of document chunks with add, edit, and delete capabilities
 * @param {ChunkListProps} props - Dataset/document IDs and selection callbacks
 * @returns {JSX.Element} Rendered chunk list panel
 */
const ChunkList: React.FC<ChunkListProps> = ({
  datasetId,
  docId,
  selectedChunk,
  onSelectChunk,
}) => {
  const { t } = useTranslation();
  const [addModalOpen, setAddModalOpen] = useState(false);
  
  // Fetch chunks with search, pagination, and CRUD operations
  const {
    chunks,
    total,
    page,
    loading,
    search,
    setSearch,
    setPage,
    addChunk,
    updateChunk,
    deleteChunk,
  } = useChunks(datasetId, docId);

  // Calculate total pages based on 20 items per page
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="flex flex-col h-full relative">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('datasets.chunks', 'Chunks')}
            <span className="text-xs font-normal text-muted-foreground ml-2">({total} {t('datasets.chunksTotal', 'total')})</span>
          </h3>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddModalOpen(true)}>
            <Plus size={14} />
          </Button>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={t('datasetSettings.chunks.searchPlaceholder', 'Search chunks...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* Chunk cards with loading, empty, and populated states */}
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
              // Calculate global index across pages for correct numbering
              index={(page - 1) * 20 + index}
              isSelected={selectedChunk?.chunk_id === chunk.chunk_id}
              onClick={onSelectChunk}
              onUpdate={updateChunk}
              onDelete={deleteChunk}
            />
          ))
        )}
      </div>

      {/* Show pagination controls only when more than one page exists */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Add chunk modal */}
      <AddChunkModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={addChunk}
      />
    </div>
  );
};

export default ChunkList;
