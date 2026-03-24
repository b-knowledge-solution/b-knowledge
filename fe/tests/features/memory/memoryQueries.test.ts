/**
 * @fileoverview Unit tests for memory TanStack Query hooks.
 *
 * Verifies query key structure, hook return shapes, mutation callbacks,
 * and cache invalidation behavior for all memory query/mutation hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetMemories = vi.fn()
const mockGetMemory = vi.fn()
const mockGetMemoryMessages = vi.fn()
const mockCreateMemory = vi.fn()
const mockUpdateMemory = vi.fn()
const mockDeleteMemory = vi.fn()
const mockSearchMemoryMessages = vi.fn()
const mockDeleteMemoryMessage = vi.fn()
const mockForgetMemoryMessage = vi.fn()
const mockImportChatHistory = vi.fn()

vi.mock('@/features/memory/api/memoryApi', () => ({
  memoryApi: {
    getMemories: (...args: any[]) => mockGetMemories(...args),
    getMemory: (...args: any[]) => mockGetMemory(...args),
    getMemoryMessages: (...args: any[]) => mockGetMemoryMessages(...args),
    createMemory: (...args: any[]) => mockCreateMemory(...args),
    updateMemory: (...args: any[]) => mockUpdateMemory(...args),
    deleteMemory: (...args: any[]) => mockDeleteMemory(...args),
    searchMemoryMessages: (...args: any[]) => mockSearchMemoryMessages(...args),
    deleteMemoryMessage: (...args: any[]) => mockDeleteMemoryMessage(...args),
    forgetMemoryMessage: (...args: any[]) => mockForgetMemoryMessage(...args),
    importChatHistory: (...args: any[]) => mockImportChatHistory(...args),
  },
}))

import {
  useMemories,
  useMemory,
  useMemoryMessages,
  useCreateMemory,
  useUpdateMemory,
  useDeleteMemory,
  useSearchMemoryMessages,
  useDeleteMemoryMessage,
  useForgetMemoryMessage,
  useImportChatHistory,
} from '@/features/memory/api/memoryQueries'

import { queryKeys } from '@/lib/queryKeys'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Creates a test wrapper with a fresh QueryClient for each hook test
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)

  return { Wrapper, queryClient }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('memory query key structure', () => {
  it('memory.all is ["memory"]', () => {
    expect(queryKeys.memory.all).toEqual(['memory'])
  })

  it('memory.lists() is ["memory", "list"]', () => {
    expect(queryKeys.memory.lists()).toEqual(['memory', 'list'])
  })

  it('memory.detail(id) is ["memory", "detail", id]', () => {
    expect(queryKeys.memory.detail('mem-1')).toEqual(['memory', 'detail', 'mem-1'])
  })

  it('memory.messages(id) extends detail key with "messages"', () => {
    expect(queryKeys.memory.messages('mem-1')).toEqual(['memory', 'detail', 'mem-1', 'messages'])
  })

  it('memory.list(filters) appends filters object', () => {
    const filters = { search: 'test' }
    expect(queryKeys.memory.list(filters)).toEqual(['memory', 'list', filters])
  })
})

describe('useMemories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches memory list on mount', async () => {
    const mockData = [{ id: 'mem-1', name: 'Pool A' }]
    mockGetMemories.mockResolvedValue(mockData)
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useMemories(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockData)
    expect(mockGetMemories).toHaveBeenCalledTimes(1)
  })
})

describe('useMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches a single memory pool when id is provided', async () => {
    const mockData = { id: 'mem-1', name: 'Pool A' }
    mockGetMemory.mockResolvedValue(mockData)
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useMemory('mem-1'), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockData)
    expect(mockGetMemory).toHaveBeenCalledWith('mem-1')
  })

  it('does not fetch when id is empty string', async () => {
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useMemory(''), { wrapper: Wrapper })

    // Query should remain in idle/disabled state
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGetMemory).not.toHaveBeenCalled()
  })
})

describe('useMemoryMessages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches messages for a given memory pool', async () => {
    const mockData = { items: [{ message_id: 'msg-1' }], total: 1 }
    mockGetMemoryMessages.mockResolvedValue(mockData)
    const { Wrapper } = createWrapper()

    const { result } = renderHook(
      () => useMemoryMessages('mem-1', { page: 1, page_size: 20 }),
      { wrapper: Wrapper }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(mockData)
  })

  it('does not fetch when id is empty', () => {
    const { Wrapper } = createWrapper()

    const { result } = renderHook(
      () => useMemoryMessages(''),
      { wrapper: Wrapper }
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGetMemoryMessages).not.toHaveBeenCalled()
  })
})

describe('useCreateMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls createMemory and invalidates list cache on success', async () => {
    const createdPool = { id: 'mem-new', name: 'New Pool' }
    mockCreateMemory.mockResolvedValue(createdPool)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useCreateMemory(), { wrapper: Wrapper })

    await result.current.mutateAsync({ name: 'New Pool' })

    expect(mockCreateMemory).toHaveBeenCalledWith({ name: 'New Pool' })
    // Verify list cache invalidation
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.memory.lists() })
    )
  })
})

describe('useUpdateMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls updateMemory and invalidates both detail and list caches', async () => {
    mockUpdateMemory.mockResolvedValue({ id: 'mem-1', name: 'Updated' })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateMemory(), { wrapper: Wrapper })

    await result.current.mutateAsync({ id: 'mem-1', data: { name: 'Updated' } })

    expect(mockUpdateMemory).toHaveBeenCalledWith('mem-1', { name: 'Updated' })
    // Verify both detail and list cache invalidation
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.memory.detail('mem-1') })
    )
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.memory.lists() })
    )
  })
})

describe('useDeleteMemory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls deleteMemory and invalidates list cache', async () => {
    mockDeleteMemory.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteMemory(), { wrapper: Wrapper })

    await result.current.mutateAsync('mem-1')

    expect(mockDeleteMemory).toHaveBeenCalledWith('mem-1')
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.memory.lists() })
    )
  })
})

describe('useSearchMemoryMessages', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls searchMemoryMessages with correct params', async () => {
    const mockResults = [{ message_id: 'msg-1', score: 0.9 }]
    mockSearchMemoryMessages.mockResolvedValue(mockResults)
    const { Wrapper } = createWrapper()

    const { result } = renderHook(() => useSearchMemoryMessages(), { wrapper: Wrapper })

    const data = await result.current.mutateAsync({ id: 'mem-1', query: 'test', topK: 5 })

    expect(mockSearchMemoryMessages).toHaveBeenCalledWith('mem-1', 'test', 5)
    expect(data).toEqual(mockResults)
  })
})

describe('useDeleteMemoryMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls deleteMemoryMessage and invalidates messages cache', async () => {
    mockDeleteMemoryMessage.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteMemoryMessage(), { wrapper: Wrapper })

    await result.current.mutateAsync({ id: 'mem-1', messageId: 'msg-42' })

    expect(mockDeleteMemoryMessage).toHaveBeenCalledWith('mem-1', 'msg-42')
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.memory.messages('mem-1') })
    )
  })
})

describe('useForgetMemoryMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls forgetMemoryMessage and invalidates messages cache', async () => {
    mockForgetMemoryMessage.mockResolvedValue(undefined)
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useForgetMemoryMessage(), { wrapper: Wrapper })

    await result.current.mutateAsync({ id: 'mem-1', messageId: 'msg-42' })

    expect(mockForgetMemoryMessage).toHaveBeenCalledWith('mem-1', 'msg-42')
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.memory.messages('mem-1') })
    )
  })
})

describe('useImportChatHistory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls importChatHistory and invalidates messages cache', async () => {
    mockImportChatHistory.mockResolvedValue({ imported: 10 })
    const { Wrapper, queryClient } = createWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useImportChatHistory(), { wrapper: Wrapper })

    const data = await result.current.mutateAsync({ memoryId: 'mem-1', sessionId: 's-abc' })

    expect(mockImportChatHistory).toHaveBeenCalledWith('mem-1', 's-abc')
    expect(data).toEqual({ imported: 10 })
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.memory.messages('mem-1') })
    )
  })
})
