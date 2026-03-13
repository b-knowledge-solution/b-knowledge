/**
 * @fileoverview Main chunk management panel with table, search, and add button.
 *
 * @module features/datasets/components/ChunkManagementPanel
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus } from 'lucide-react';
import { useChunks } from '../api/datasetQueries';
import ChunkTable from './ChunkTable';
import AddChunkModal from './AddChunkModal';

// ============================================================================
// Types
// ============================================================================

interface ChunkManagementPanelProps {
  /** Dataset ID */
  datasetId: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Panel for managing dataset chunks.
 *
 * @param props - Component props
 * @returns React element
 */
const ChunkManagementPanel: React.FC<ChunkManagementPanelProps> = ({
  datasetId,
}) => {
  const { t } = useTranslation();
  const [addModalOpen, setAddModalOpen] = useState(false);

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
  } = useChunks(datasetId);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            placeholder={t('datasetSettings.chunks.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {total} {t('datasetSettings.chunks.total')}
        </span>
        <div className="flex-1" />
        <Button onClick={() => setAddModalOpen(true)}>
          <Plus size={16} className="mr-1" />
          {t('datasetSettings.chunks.add')}
        </Button>
      </div>

      {/* Chunk list */}
      <ChunkTable
        chunks={chunks}
        loading={loading}
        onUpdate={updateChunk}
        onDelete={deleteChunk}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            {t('common.next')}
          </Button>
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

export default ChunkManagementPanel;
