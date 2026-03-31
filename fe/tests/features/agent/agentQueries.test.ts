/**
 * @fileoverview Unit tests for agent TanStack Query hooks.
 *
 * Verifies query keys, mutation invalidation targets, and hook configuration
 * (enabled flags, queryFn wiring). Uses renderHook with QueryClientProvider.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { queryKeys } from '@/lib/queryKeys'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockList = vi.fn()
const mockGetById = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDeleteFn = vi.fn()
const mockDuplicate = vi.fn()
const mockListVersions = vi.fn()
const mockSaveVersion = vi.fn()
const mockRestoreVersion = vi.fn()
const mockDeleteVersion = vi.fn()
const mockListTemplates = vi.fn()
const mockListRuns = vi.fn()

vi.mock('@/features/agents/api/agentApi', () => ({
  agentApi: {
    list: (...args: any[]) => mockList(...args),
    getById: (...args: any[]) => mockGetById(...args),
    create: (...args: any[]) => mockCreate(...args),
    update: (...args: any[]) => mockUpdate(...args),
    delete: (...args: any[]) => mockDeleteFn(...args),
    duplicate: (...args: any[]) => mockDuplicate(...args),
    listVersions: (...args: any[]) => mockListVersions(...args),
    saveVersion: (...args: any[]) => mockSaveVersion(...args),
    restoreVersion: (...args: any[]) => mockRestoreVersion(...args),
    deleteVersion: (...args: any[]) => mockDeleteVersion(...args),
    listTemplates: (...args: any[]) => mockListTemplates(...args),
    listRuns: (...args: any[]) => mockListRuns(...args),
  },
}))

import {
  useAgents,
  useAgent,
  useAgentVersions,
  useAgentRuns,
  useAgentTemplates,
  useCreateAgent,
  useUpdateAgent,
  useDeleteAgent,
  useDuplicateAgent,
  useSaveVersion,
  useRestoreVersion,
  useDeleteVersion,
} from '@/features/agents/api/agentQueries'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }

  return { Wrapper, queryClient }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agentQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ========================================================================
  // Query key structure
  // ========================================================================

  describe('query keys', () => {
    it('agents.all is ["agents"]', () => {
      expect(queryKeys.agents.all).toEqual(['agents'])
    })

    it('agents.lists() extends base key', () => {
      expect(queryKeys.agents.lists()).toEqual(['agents', 'list'])
    })

    it('agents.list() includes filters', () => {
      const filters = { mode: 'agent', search: 'test' }
      expect(queryKeys.agents.list(filters)).toEqual(['agents', 'list', filters])
    })

    it('agents.detail() includes agent ID', () => {
      expect(queryKeys.agents.detail('a-1')).toEqual(['agents', 'detail', 'a-1'])
    })

    it('agents.runs() includes agent ID', () => {
      expect(queryKeys.agents.runs('a-1')).toEqual(['agents', 'detail', 'a-1', 'runs'])
    })

    it('agents.run() includes agent and run IDs', () => {
      expect(queryKeys.agents.run('a-1', 'r-1')).toEqual(['agents', 'detail', 'a-1', 'runs', 'r-1'])
    })

    it('agents.templates() is ["agent-templates"]', () => {
      expect(queryKeys.agents.templates()).toEqual(['agent-templates'])
    })

    it('agents.templatesByCategory() includes category', () => {
      expect(queryKeys.agents.templatesByCategory('rag')).toEqual(['agent-templates', 'rag'])
    })
  })

  // ========================================================================
  // useAgents
  // ========================================================================

  describe('useAgents', () => {
    it('fetches agent list with filters', async () => {
      const mockData = { data: [{ id: 'a-1' }], total: 1, page: 1, page_size: 20 }
      mockList.mockResolvedValue(mockData)

      const { Wrapper } = createWrapper()
      const { result } = renderHook(() => useAgents({ mode: 'agent' }), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockList).toHaveBeenCalledWith({ mode: 'agent' })
      expect(result.current.data).toBe(mockData)
    })
  })

  // ========================================================================
  // useAgent
  // ========================================================================

  describe('useAgent', () => {
    it('fetches agent detail by ID', async () => {
      const mockAgent = { id: 'a-1', name: 'Test' }
      mockGetById.mockResolvedValue(mockAgent)

      const { Wrapper } = createWrapper()
      const { result } = renderHook(() => useAgent('a-1'), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockGetById).toHaveBeenCalledWith('a-1')
    })

    it('does not fetch when id is empty', () => {
      const { Wrapper } = createWrapper()
      renderHook(() => useAgent(''), { wrapper: Wrapper })

      // With enabled: !!id, the query should not run
      expect(mockGetById).not.toHaveBeenCalled()
    })
  })

  // ========================================================================
  // useAgentTemplates
  // ========================================================================

  describe('useAgentTemplates', () => {
    it('fetches template list', async () => {
      const mockTemplates = [{ id: 't-1', name: 'RAG' }]
      mockListTemplates.mockResolvedValue(mockTemplates)

      const { Wrapper } = createWrapper()
      const { result } = renderHook(() => useAgentTemplates(), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockListTemplates).toHaveBeenCalled()
    })
  })

  // ========================================================================
  // useAgentVersions
  // ========================================================================

  describe('useAgentVersions', () => {
    it('fetches versions for an agent', async () => {
      mockListVersions.mockResolvedValue([{ id: 'v-1' }])

      const { Wrapper } = createWrapper()
      const { result } = renderHook(() => useAgentVersions('a-1'), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockListVersions).toHaveBeenCalledWith('a-1')
    })

    it('does not fetch when id is empty', () => {
      const { Wrapper } = createWrapper()
      renderHook(() => useAgentVersions(''), { wrapper: Wrapper })

      expect(mockListVersions).not.toHaveBeenCalled()
    })
  })

  // ========================================================================
  // useAgentRuns
  // ========================================================================

  describe('useAgentRuns', () => {
    it('fetches runs for an agent', async () => {
      mockListRuns.mockResolvedValue([{ id: 'r-1' }])

      const { Wrapper } = createWrapper()
      const { result } = renderHook(() => useAgentRuns('a-1'), { wrapper: Wrapper })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(mockListRuns).toHaveBeenCalledWith('a-1')
    })
  })

  // ========================================================================
  // useCreateAgent
  // ========================================================================

  describe('useCreateAgent', () => {
    it('calls create and invalidates list cache on success', async () => {
      const created = { id: 'a-new', name: 'New Agent' }
      mockCreate.mockResolvedValue(created)

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useCreateAgent(), { wrapper: Wrapper })

      await result.current.mutateAsync({ name: 'New Agent', mode: 'agent' })

      expect(mockCreate).toHaveBeenCalledWith({ name: 'New Agent', mode: 'agent' })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.agents.lists() })
    })
  })

  // ========================================================================
  // useUpdateAgent
  // ========================================================================

  describe('useUpdateAgent', () => {
    it('calls update and invalidates detail + list caches', async () => {
      mockUpdate.mockResolvedValue({ id: 'a-1', name: 'Renamed' })

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useUpdateAgent(), { wrapper: Wrapper })

      await result.current.mutateAsync({ id: 'a-1', data: { name: 'Renamed' } })

      expect(mockUpdate).toHaveBeenCalledWith('a-1', { name: 'Renamed' })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.agents.detail('a-1') })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.agents.lists() })
    })
  })

  // ========================================================================
  // useDeleteAgent
  // ========================================================================

  describe('useDeleteAgent', () => {
    it('calls delete and invalidates list cache', async () => {
      mockDeleteFn.mockResolvedValue(undefined)

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useDeleteAgent(), { wrapper: Wrapper })

      await result.current.mutateAsync('a-1')

      expect(mockDeleteFn).toHaveBeenCalledWith('a-1')
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.agents.lists() })
    })
  })

  // ========================================================================
  // useDuplicateAgent
  // ========================================================================

  describe('useDuplicateAgent', () => {
    it('calls duplicate and invalidates list cache', async () => {
      mockDuplicate.mockResolvedValue({ id: 'a-dup' })

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useDuplicateAgent(), { wrapper: Wrapper })

      await result.current.mutateAsync('a-1')

      expect(mockDuplicate).toHaveBeenCalledWith('a-1')
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.agents.lists() })
    })
  })

  // ========================================================================
  // useSaveVersion
  // ========================================================================

  describe('useSaveVersion', () => {
    it('calls saveVersion and invalidates version cache', async () => {
      mockSaveVersion.mockResolvedValue({ version_number: 2 })

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useSaveVersion(), { wrapper: Wrapper })

      await result.current.mutateAsync({ id: 'a-1', data: { version_label: 'v2' } })

      expect(mockSaveVersion).toHaveBeenCalledWith('a-1', { version_label: 'v2' })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...queryKeys.agents.detail('a-1'), 'versions'],
      })
    })
  })

  // ========================================================================
  // useRestoreVersion
  // ========================================================================

  describe('useRestoreVersion', () => {
    it('calls restoreVersion and invalidates detail + version caches', async () => {
      mockRestoreVersion.mockResolvedValue({ id: 'a-1' })

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useRestoreVersion(), { wrapper: Wrapper })

      await result.current.mutateAsync({ id: 'a-1', versionId: 'v-1' })

      expect(mockRestoreVersion).toHaveBeenCalledWith('a-1', 'v-1')
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.agents.detail('a-1') })
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...queryKeys.agents.detail('a-1'), 'versions'],
      })
    })
  })

  // ========================================================================
  // useDeleteVersion
  // ========================================================================

  describe('useDeleteVersion', () => {
    it('calls deleteVersion and invalidates version cache', async () => {
      mockDeleteVersion.mockResolvedValue(undefined)

      const { Wrapper, queryClient } = createWrapper()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
      const { result } = renderHook(() => useDeleteVersion(), { wrapper: Wrapper })

      await result.current.mutateAsync({ id: 'a-1', versionId: 'v-1' })

      expect(mockDeleteVersion).toHaveBeenCalledWith('a-1', 'v-1')
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: [...queryKeys.agents.detail('a-1'), 'versions'],
      })
    })
  })
})
