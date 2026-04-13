/**
 * @fileoverview Tests for the catalog-backed useHasPermission hook.
 *
 * Verifies:
 *   1. Returns true when the underlying CASL ability grants the (action, subject) pair.
 *   2. Returns false when no matching rule exists.
 *   3. Returns false against the default empty ability (logged-out / pre-boot).
 *   4. Bare strings outside the PERMISSION_KEYS map are caught at compile time.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createMongoAbility } from '@casl/ability'
import React from 'react'
import { queryKeys } from '@/lib/queryKeys'

// Mock the auth feature so ability.tsx's AbilityProvider dependency graph
// doesn't drag the full feature barrel into the test transform — mirrors the
// approach used in tests/lib/ability.test.tsx.
let mockUser: { id: string; email: string } | null = null

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

import { PERMISSION_KEYS } from '@/constants/permission-keys'
import { permissionsApi } from '@/features/permissions/api/permissionsApi'
import { AbilityContext } from '@/lib/ability'

vi.mock('@/features/permissions/api/permissionsApi', () => ({
  permissionsApi: {
    getCatalog: vi.fn(),
  },
}))

const mockedPermissionsApi = permissionsApi as typeof permissionsApi & {
  getCatalog: ReturnType<typeof vi.fn>
}

/**
 * @description Builds a renderHook wrapper that injects a fixed CASL ability
 * via AbilityContext.Provider. Mirrors the wrapper pattern used in ability.test.tsx.
 *
 * @param {ReturnType<typeof createMongoAbility>} ability - Pre-built CASL ability instance.
 * @returns {(props: { children: React.ReactNode }) => JSX.Element} Wrapper component for renderHook.
 */
function makeWrapper(ability: ReturnType<typeof createMongoAbility>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    // Cast keeps the strongly-typed AppAbility shape happy without leaking
    // CASL generics into every test case.
    return (
      <AbilityContext.Provider value={{ ability: ability as never, isLoading: false }}>
        {children}
      </AbilityContext.Provider>
    )
  }
}

/**
 * @description Builds a wrapper with AbilityContext and PermissionCatalogProvider
 * so tests can assert live catalog hydration behavior.
 * @param {ReturnType<typeof createMongoAbility>} ability - Ability instance exposed through context.
 * @param {React.ComponentType<{ children: React.ReactNode }>} PermissionCatalogProviderComponent - Runtime provider under test.
 * @returns {(props: { children: React.ReactNode }) => JSX.Element} Wrapper component for renderHook.
 */
function makeLiveCatalogWrapper(
  ability: ReturnType<typeof createMongoAbility>,
  PermissionCatalogProviderComponent: React.ComponentType<{ children: React.ReactNode }>,
) {
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
      <QueryClientProvider client={queryClient}>
        <AbilityContext.Provider value={{ ability: ability as never, isLoading: false }}>
          <PermissionCatalogProviderComponent>{children}</PermissionCatalogProviderComponent>
        </AbilityContext.Provider>
      </QueryClientProvider>
    )
  }

  return {
    queryClient,
    wrapper: Wrapper,
  }
}

/**
 * @description Dynamically imports the permissions module after mocks are registered.
 * @returns {Promise<typeof import('@/lib/permissions')>} Runtime permission exports.
 */
async function importPermissionsModule() {
  return await import('@/lib/permissions')
}

/**
 * @description Render the permission hook against a fixed CASL ability so
 * tests can focus on catalog-key behavior instead of wrapper setup.
 * @param {PermissionKey} key - Permission key under test.
 * @param {(key: typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS]) => boolean} useHasPermissionHook - Imported hook under test.
 * @param {ReturnType<typeof createMongoAbility>} ability - Ability instance exposed through context.
 * @returns {boolean} Current hook result for the supplied key.
 */
function renderPermissionCheck(
  key: typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS],
  useHasPermissionHook: (key: typeof PERMISSION_KEYS[keyof typeof PERMISSION_KEYS]) => boolean,
  ability: ReturnType<typeof createMongoAbility>,
): boolean {
  const { result } = renderHook(() => useHasPermissionHook(key), {
    wrapper: makeWrapper(ability),
  })

  return result.current
}

describe('useHasPermission', () => {
  beforeEach(() => {
    mockUser = null
    mockedPermissionsApi.getCatalog.mockReset()
  })

  it('returns true when the ability grants the matching (action, subject) pair', async () => {
    const { useHasPermission } = await importPermissionsModule()
    // Knowledge base view maps to (read, KnowledgeBase) in the catalog.
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, useHasPermission, ability)).toBe(true)
  })

  it('returns false when no matching rule exists', async () => {
    const { useHasPermission } = await importPermissionsModule()
    // Only read on KnowledgeBase — delete should be denied.
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_DELETE, useHasPermission, ability)).toBe(false)
  })

  it('returns false against the default empty ability (logged-out / pre-boot)', async () => {
    const { useHasPermission } = await importPermissionsModule()
    // No rules at all — every check should deny.
    const ability = createMongoAbility()
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, useHasPermission, ability)).toBe(false)
  })

  it('supports repeated checks against the same provider-backed ability', async () => {
    const { useHasPermission } = await importPermissionsModule()
    const ability = createMongoAbility([{ action: 'read', subject: 'KnowledgeBase' }])

    // This establishes the provider-backed baseline that Phase 7.3 will keep
    // exercising after the catalog data source becomes runtime-refreshable.
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, useHasPermission, ability)).toBe(true)
    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_DELETE, useHasPermission, ability)).toBe(false)
  })

  it('treats tenant-scoped allow rules as valid UI permissions', async () => {
    const { useHasPermission } = await importPermissionsModule()
    const ability = createMongoAbility([
      {
        action: 'read',
        subject: 'KnowledgeBase',
        conditions: { tenant_id: 'tenant-1' },
      },
    ])

    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, useHasPermission, ability)).toBe(true)
  })

  it('respects later deny precedence for matching tenant-scoped rules', async () => {
    const { useHasPermission } = await importPermissionsModule()
    const ability = createMongoAbility([
      {
        action: 'read',
        subject: 'KnowledgeBase',
        conditions: { tenant_id: 'tenant-1' },
      },
      {
        action: 'read',
        subject: 'KnowledgeBase',
        inverted: true,
        conditions: { tenant_id: 'tenant-1' },
      },
    ])

    expect(renderPermissionCheck(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW, useHasPermission, ability)).toBe(false)
  })

  it('prefers the live runtime catalog mapping over the generated snapshot', async () => {
    const { PermissionCatalogProvider, useHasPermission } = await importPermissionsModule()
    mockUser = { id: 'user-1', email: 'test@example.com' }
    mockedPermissionsApi.getCatalog.mockResolvedValueOnce({
      version: '2026-04-09T12:00:00Z',
      permissions: [
        {
          key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
          action: 'delete',
          subject: 'KnowledgeBase',
        },
      ],
    })

    const ability = createMongoAbility([{ action: 'delete', subject: 'KnowledgeBase' }])
    const { wrapper } = makeLiveCatalogWrapper(ability, PermissionCatalogProvider)
    const { result } = renderHook(
      () => useHasPermission(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('updates the in-memory permission map when a newer catalog payload arrives', async () => {
    const { PermissionCatalogProvider, useHasPermission } = await importPermissionsModule()
    mockUser = { id: 'user-1', email: 'test@example.com' }
    mockedPermissionsApi.getCatalog
      .mockResolvedValueOnce({
        version: '2026-04-09T12:00:00Z',
        permissions: [
          {
            key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
            action: 'read',
            subject: 'KnowledgeBase',
          },
        ],
      })
      .mockResolvedValueOnce({
        version: '2026-04-09T12:05:00Z',
        permissions: [
          {
            key: PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW,
            action: 'delete',
            subject: 'KnowledgeBase',
          },
        ],
      })

    const ability = createMongoAbility([{ action: 'delete', subject: 'KnowledgeBase' }])
    const { queryClient, wrapper } = makeLiveCatalogWrapper(ability, PermissionCatalogProvider)
    const { result } = renderHook(
      () => useHasPermission(PERMISSION_KEYS.KNOWLEDGE_BASE_VIEW),
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current).toBe(false)
    })

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.permissions.catalog(),
        refetchType: 'active',
      })
    })

    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('rejects bare strings outside PERMISSION_KEYS at compile time', async () => {
    const { useHasPermission } = await importPermissionsModule()
    const ability = createMongoAbility()

    const { result } = renderHook(
      () =>
        // @ts-expect-error — bare string is not assignable to PermissionKey
        useHasPermission('not.a.real.key'),
      { wrapper: makeWrapper(ability) },
    )

    // Runtime fallback: unknown keys log a warning and return false.
    expect(result.current).toBe(false)
  })
})
