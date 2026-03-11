/**
 * @fileoverview Hook for running retrieval tests against a dataset.
 *
 * @module features/datasets/hooks/useRetrievalTest
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { datasetApi } from '../api/datasetApi';
import { globalMessage } from '@/app/App';
import type { RetrievalChunk } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseRetrievalTestReturn {
  /** Test results */
  results: RetrievalChunk[];
  /** Whether test is running */
  testing: boolean;
  /** Run a retrieval test */
  runTest: (params: {
    query: string;
    method?: string;
    top_k?: number;
    similarity_threshold?: number;
  }) => Promise<void>;
  /** Clear results */
  clearResults: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for running retrieval tests.
 *
 * @param datasetId - Dataset ID
 * @returns Test state and operations
 */
export function useRetrievalTest(datasetId: string | undefined): UseRetrievalTestReturn {
  const { t } = useTranslation();
  const [results, setResults] = useState<RetrievalChunk[]>([]);
  const [testing, setTesting] = useState(false);

  /** Run a retrieval test. */
  const runTest = useCallback(
    async (params: {
      query: string;
      method?: string;
      top_k?: number;
      similarity_threshold?: number;
    }) => {
      if (!datasetId) return;
      setTesting(true);
      try {
        const data = await datasetApi.runRetrievalTest(datasetId, params);
        setResults(data.chunks);
      } catch (err: any) {
        globalMessage.error(err?.message || t('common.error'));
      } finally {
        setTesting(false);
      }
    },
    [datasetId, t],
  );

  /** Clear results. */
  const clearResults = useCallback(() => {
    setResults([]);
  }, []);

  return {
    results,
    testing,
    runTest,
    clearResults,
  };
}
