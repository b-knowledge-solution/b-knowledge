/**
 * @fileoverview Unit tests for the useRetrievalTest hook.
 * Verifies test execution, results population, and clearResults behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock the datasetApi module used by the hook
vi.mock('../../../src/features/datasets/api/datasetApi', () => ({
  datasetApi: {
    runRetrievalTest: vi.fn(),
  },
}))

import { useRetrievalTest } from '../../../src/features/datasets/hooks/useRetrievalTest'
import { datasetApi } from '../../../src/features/datasets/api/datasetApi'

/**
 * @description Creates a QueryClientProvider wrapper for renderHook with retry disabled
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useRetrievalTest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('initializes with empty results and testing=false', () => {
    const { result } = renderHook(() => useRetrievalTest('ds1'), {
      wrapper: createWrapper(),
    })

    expect(result.current.results).toEqual([])
    expect(result.current.testing).toBe(false)
  })

  it('runTest calls datasetApi.runRetrievalTest with all params', async () => {
    const mockChunks = [
      { id: 'c1', content: 'chunk 1', score: 0.95 },
      { id: 'c2', content: 'chunk 2', score: 0.85 },
    ]
    vi.mocked(datasetApi.runRetrievalTest).mockResolvedValue({
      chunks: mockChunks,
    })

    const { result } = renderHook(() => useRetrievalTest('ds1'), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.runTest({
        query: 'test query',
        method: 'hybrid',
        top_k: 5,
        similarity_threshold: 0.7,
        vector_similarity_weight: 0.5,
        doc_ids: ['d1', 'd2'],
      })
    })

    // Verify the API was called with dataset ID and all parameters
    expect(datasetApi.runRetrievalTest).toHaveBeenCalledWith('ds1', {
      query: 'test query',
      method: 'hybrid',
      top_k: 5,
      similarity_threshold: 0.7,
      vector_similarity_weight: 0.5,
      doc_ids: ['d1', 'd2'],
    })
  })

  it('populates results state on success', async () => {
    const mockChunks = [
      { id: 'c1', content: 'result chunk', score: 0.9 },
    ]
    vi.mocked(datasetApi.runRetrievalTest).mockResolvedValue({
      chunks: mockChunks,
    })

    const { result } = renderHook(() => useRetrievalTest('ds1'), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.runTest({ query: 'search term' })
    })

    // Results should be populated with the returned chunks
    expect(result.current.results).toEqual(mockChunks)
  })

  it('clearResults resets results to empty array', async () => {
    const mockChunks = [{ id: 'c1', content: 'data', score: 0.8 }]
    vi.mocked(datasetApi.runRetrievalTest).mockResolvedValue({
      chunks: mockChunks,
    })

    const { result } = renderHook(() => useRetrievalTest('ds1'), {
      wrapper: createWrapper(),
    })

    // First populate results
    await act(async () => {
      await result.current.runTest({ query: 'populate' })
    })
    expect(result.current.results).toHaveLength(1)

    // Then clear them
    act(() => {
      result.current.clearResults()
    })

    expect(result.current.results).toEqual([])
  })

  it('does not call API when datasetId is undefined', async () => {
    const { result } = renderHook(() => useRetrievalTest(undefined), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.runTest({ query: 'test' })
    })

    // Guard clause should prevent the API call
    expect(datasetApi.runRetrievalTest).not.toHaveBeenCalled()
  })
})
