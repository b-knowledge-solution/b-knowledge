/**
 * @fileoverview Phase 7 SH1 frontend harness for runtime catalog refresh work.
 *
 * Keeps the current Phase 4 behavior green while establishing the query-client
 * and refetch utilities that 7.3 will extend with socket invalidation and
 * polling fallback assertions.
 */
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/queryKeys'

vi.mock('@/features/permissions/api/permissionsApi', () => ({
  permissionsApi: {
    getCatalog: vi.fn(),
  },
}))

import { permissionsApi } from '@/features/permissions/api/permissionsApi'
import { usePermissionCatalog } from '@/features/permissions/api/permissionsQueries'

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
  mockedPermissionsApi.getCatalog.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('permissionsCatalogRefresh harness', () => {
  it('hydrates the catalog query through the existing usePermissionCatalog hook', async () => {
    const response = {
      permissions: [
        {
          key: 'knowledge_base.view',
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

  it('reuses the same query key when the catalog is manually invalidated', async () => {
    const firstResponse = {
      permissions: [{ key: 'knowledge_base.view', action: 'read', subject: 'KnowledgeBase' }],
    } as MockCatalogResponse
    const secondResponse = {
      permissions: [{ key: 'knowledge_base.delete', action: 'delete', subject: 'KnowledgeBase' }],
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

    expect(queryClient.getQueryState(queryKeys.permissions.catalog()))?.toBeDefined()
    expect(mockedPermissionsApi.getCatalog).toHaveBeenCalledTimes(2)
  })
})
