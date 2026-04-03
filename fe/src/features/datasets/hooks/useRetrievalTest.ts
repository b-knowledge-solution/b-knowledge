/**
 * @fileoverview Hook for running retrieval tests against a dataset.
 * Uses TanStack Query useMutation for the test execution.
 *
 * @module features/datasets/hooks/useRetrievalTest
 */

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { datasetApi } from '../api/datasetApi'
import type { RetrievalChunk } from '../types'

// ============================================================================
// Types
// ============================================================================

/** @description Parameters for a retrieval test */
interface RetrievalTestParams {
  query: string
  method?: string
  top_k?: number
  similarity_threshold?: number
  vector_similarity_weight?: number
  doc_ids?: string[]
}

export interface UseRetrievalTestReturn {
  /** Test results */
  results: RetrievalChunk[]
  /** Whether test is running */
  testing: boolean
  /** Run a retrieval test */
  runTest: (params: RetrievalTestParams) => Promise<void>
  /** Clear results */
  clearResults: () => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for running retrieval tests against a dataset.
 *
 * @param {string | undefined} datasetId - Dataset ID
 * @returns {UseRetrievalTestReturn} Test state and operations
 */
export function useRetrievalTest(datasetId: string | undefined): UseRetrievalTestReturn {
  // Local state for results since they are ephemeral and not cached
  const [results, setResults] = useState<RetrievalChunk[]>([])

  // Mutation for running the retrieval test
  const testMutation = useMutation({
    mutationFn: (params: RetrievalTestParams) =>
      datasetApi.runRetrievalTest(datasetId!, params),
    onSuccess: (data) => {
      // Store the returned chunks in local state
      setResults(data.chunks)
    },
  })

  /** Run a retrieval test */
  const runTest = async (params: RetrievalTestParams) => {
    if (!datasetId) return
    await testMutation.mutateAsync(params)
  }

  /** Clear results */
  const clearResults = () => {
    setResults([])
  }

  return {
    results,
    testing: testMutation.isPending,
    runTest,
    clearResults,
  }
}
