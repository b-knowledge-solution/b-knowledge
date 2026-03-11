/**
 * @fileoverview Hook for chunk management operations.
 *
 * @module features/datasets/hooks/useChunks
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { datasetApi } from '../api/datasetApi';
import { globalMessage } from '@/app/App';
import type { Chunk } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseChunksReturn {
  /** List of chunks */
  chunks: Chunk[];
  /** Total chunk count */
  total: number;
  /** Current page */
  page: number;
  /** Whether chunks are loading */
  loading: boolean;
  /** Search query */
  search: string;
  /** Set search query */
  setSearch: (value: string) => void;
  /** Set current page */
  setPage: (page: number) => void;
  /** Refresh chunks */
  refresh: () => void;
  /** Add a manual chunk */
  addChunk: (text: string) => Promise<void>;
  /** Update a chunk */
  updateChunk: (chunkId: string, text: string) => Promise<void>;
  /** Delete a chunk */
  deleteChunk: (chunkId: string) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing dataset chunks.
 *
 * @param datasetId - Dataset ID
 * @returns Chunk state and operations
 */
export function useChunks(datasetId: string | undefined): UseChunksReturn {
  const { t } = useTranslation();
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const LIMIT = 20;

  /** Fetch chunks from API. */
  const fetchChunks = useCallback(async () => {
    if (!datasetId) return;
    setLoading(true);
    try {
      const data = await datasetApi.listChunks(datasetId, {
        page,
        limit: LIMIT,
        ...(search ? { search } : {}),
      });
      setChunks(data.chunks);
      setTotal(data.total);
    } catch (err) {
      console.error('Failed to load chunks:', err);
    } finally {
      setLoading(false);
    }
  }, [datasetId, page, search]);

  useEffect(() => {
    fetchChunks();
  }, [fetchChunks]);

  /** Add a manual chunk. */
  const addChunk = useCallback(
    async (text: string) => {
      if (!datasetId) return;
      try {
        await datasetApi.addChunk(datasetId, { text });
        globalMessage.success(t('datasetSettings.chunks.addSuccess'));
        await fetchChunks();
      } catch (err: any) {
        globalMessage.error(err?.message || t('common.error'));
      }
    },
    [datasetId, fetchChunks, t],
  );

  /** Update a chunk. */
  const updateChunk = useCallback(
    async (chunkId: string, text: string) => {
      if (!datasetId) return;
      try {
        await datasetApi.updateChunk(datasetId, chunkId, { text });
        globalMessage.success(t('datasetSettings.chunks.updateSuccess'));
        await fetchChunks();
      } catch (err: any) {
        globalMessage.error(err?.message || t('common.error'));
      }
    },
    [datasetId, fetchChunks, t],
  );

  /** Delete a chunk. */
  const deleteChunk = useCallback(
    async (chunkId: string) => {
      if (!datasetId) return;
      try {
        await datasetApi.deleteChunk(datasetId, chunkId);
        globalMessage.success(t('datasetSettings.chunks.deleteSuccess'));
        await fetchChunks();
      } catch (err: any) {
        globalMessage.error(err?.message || t('common.error'));
      }
    },
    [datasetId, fetchChunks, t],
  );

  return {
    chunks,
    total,
    page,
    loading,
    search,
    setSearch,
    setPage,
    refresh: fetchChunks,
    addChunk,
    updateChunk,
    deleteChunk,
  };
}
