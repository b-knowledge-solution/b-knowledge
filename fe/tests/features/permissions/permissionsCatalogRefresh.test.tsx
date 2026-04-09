/**
 * @fileoverview Phase 7 SH1 frontend harness for runtime catalog refresh work.
 *
 * Exercises the live catalog query contract so the runtime permission provider
 * can hydrate from `{ version, permissions }` and replace its in-memory map
 * when a newer payload arrives.
 */
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/queryKeys'
import { PERMISSION_KEYS } from '@/constants/permission-keys'
import { SOCKET_EVENTS } from '@/constants/socket-events'
import { useSocketQueryInvalidation } from '@/hooks/useSocket'

vi.mock('@/features/permissions/api/permissionsApi', () => ({
  permissionsApi: {
    getCatalog: vi.fn(),
  },
}))

let mockUser: { id: string; email: string } | null = null
const connectSocket = vi.fn()
const disconnectSocket = vi.fn()
const socketListeners = new Map<string, Set<() => void>>()
const socketMock = {
  connected: true,
  on: vi.fn((event: string, handler: () => void) => {
    const listeners = socketListeners.get(event) ?? new Set<() => void>()
    listeners.add(handler)
    socketListeners.set(event, listeners)
  }),
  off: vi.fn((event: string, handler: () => void) => {
    socketListeners.get(event)?.delete(handler)
  }),
}

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

vi.mock('@/lib/socket', () => ({
  connectSocket: (...args: unknown[]) => connectSocket(...args),
  disconnectSocket: () => disconnectSocket(),
  getSocket: () => socketMock,
  getSocketStatus: () => 'connected',
}))

import { permissionsApi } from '@/features/permissions/api/permissionsApi'
import {
  PERMISSION_CATALOG_POLL_INTERVAL_MS,
  usePermissionCatalog,
} from '@/features/permissions/api/permissionsQueries'

type MockCatalogResponse = Awaited<ReturnType<typeof permissionsApi.getCatalog>>
type QueryClientWrapper = ({ children }: { children: React.ReactNode }) => JSX.Element

const mockedPermissionsApi = permissionsApi as {
  getCatalog: ReturnType<typeof vi.fn>
}

/**
 * @description Build a fresh query-client wrapper for each test so fetch state
 * and invalidation counts never leak between assertions.
 * @returns {{ queryClient: QueryClient; wrapper: QueryClientWrapper }} Wrapper tuple for renderHook.
 */
function createCatalogHarness(): {
  queryClient: QueryClient
  wrapper: QueryClientWrapper
} {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }

  return {
    queryClient,
    wrapper: Wrapper,
  }
}

/**
 * @description Trigger a narrow catalog refetch through TanStack Query so the
 * same code path can later be reused for socket and polling invalidations.
 * @param {QueryClient} queryClient - Query client under test.
 * @returns {Promise<void>} Resolves once active catalog observers are refetched.
 */
async function refetchCatalog(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.permissions.catalog(),
    refetchType: 'active',
  })
}

beforeEach(() => {
  mockUser = null
  mockedPermissionsApi.getCatalog.mockReset()
  connectSocket.mockReset()
  disconnectSocket.mockReset()
  socketMock.on.mockClear()
  socketMock.off.mockClear()
  socketListeners.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('permissionsCatalogRefresh harness', () => {
  it('hydrates the catalog query through the existing usePermissionCatalog hook', async () => {
    const response = {
      version: '2026-04-09T12:00:00Z',
      permissions: [
        {
          key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
          action: 'read',
          subject: 'KnowledgeBase',
        },
      ],
    } as MockCatalogResponse
    mockedPermissionsApi.getCatalog.mockResolvedValueOnce(response)
    const { wrapper } = createCatalogHarness()

    const { result } = renderHook(() => usePermissionCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(mockedPermissionsApi.getCatalog).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual(response)
  })

  it('reuses the same query key when the versioned catalog is manually invalidated', async () => {
    const firstResponse = {
      version: '2026-04-09T12:00:00Z',
      permissions: [{ key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, action: 'read', subject: 'KnowledgeBase' }],
    } as MockCatalogResponse
    const secondResponse = {
      version: '2026-04-09T12:05:00Z',
      permissions: [{ key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, action: 'delete', subject: 'KnowledgeBase' }],
    } as MockCatalogResponse
    mockedPermissionsApi.getCatalog
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse)
    const { queryClient, wrapper } = createCatalogHarness()

    const { result } = renderHook(() => usePermissionCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(firstResponse)
    })

    await act(async () => {
      await refetchCatalog(queryClient)
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(secondResponse)
    })

    expect(queryClient.getQueryData(queryKeys.permissions.catalog())).toEqual(secondResponse)
    expect(mockedPermissionsApi.getCatalog).toHaveBeenCalledTimes(2)
  })

  it('refreshes stale catalog state via the bounded polling fallback', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const firstResponse = {
      version: '2026-04-09T12:00:00Z',
      permissions: [{ key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, action: 'read', subject: 'KnowledgeBase' }],
    } as MockCatalogResponse
    const secondResponse = {
      version: '2026-04-09T12:05:00Z',
      permissions: [{ key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, action: 'delete', subject: 'KnowledgeBase' }],
    } as MockCatalogResponse
    mockedPermissionsApi.getCatalog
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse)
    const { wrapper } = createCatalogHarness()

    const { result } = renderHook(() => usePermissionCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(firstResponse)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PERMISSION_CATALOG_POLL_INTERVAL_MS)
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(secondResponse)
    })

    expect(mockedPermissionsApi.getCatalog).toHaveBeenCalledTimes(2)
  }, 20000)

  it('connects authenticated sockets for logged-in sessions and tears them down on unmount', async () => {
    const { AuthenticatedSocketBridge } = await import('@/app/AuthenticatedSocketBridge')
    mockUser = { id: 'user-1', email: 'user@example.com' }
    const { wrapper } = createCatalogHarness()
    const rendered = render(<AuthenticatedSocketBridge />, { wrapper })

    await waitFor(() => {
      expect(connectSocket).toHaveBeenCalledWith({
        userId: 'user-1',
        email: 'user@example.com',
      })
    })

    rendered.unmount()
    expect(disconnectSocket).toHaveBeenCalled()
  })

  it('silently invalidates the catalog query when the permissions socket event arrives', async () => {
    const firstResponse = {
      version: '2026-04-09T12:00:00Z',
      permissions: [{ key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, action: 'read', subject: 'KnowledgeBase' }],
    } as MockCatalogResponse
    const secondResponse = {
      version: '2026-04-09T12:05:00Z',
      permissions: [{ key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, action: 'delete', subject: 'KnowledgeBase' }],
    } as MockCatalogResponse
    mockedPermissionsApi.getCatalog
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse)
    const { queryClient, wrapper } = createCatalogHarness()

    function SocketInvalidationHarness() {
      useSocketQueryInvalidation()
      return null
    }

    render(<SocketInvalidationHarness />, { wrapper })

    const { result } = renderHook(() => usePermissionCatalog(), { wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(firstResponse)
    })

    await act(async () => {
      for (const handler of socketListeners.get(SOCKET_EVENTS.PERMISSIONS_CATALOG_UPDATED) ?? []) {
        handler()
      }
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(secondResponse)
    })

    expect(queryClient.getQueryData(queryKeys.permissions.catalog())).toEqual(secondResponse)
  })

})
