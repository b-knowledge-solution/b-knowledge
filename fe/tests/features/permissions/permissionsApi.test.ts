/**
 * @fileoverview Unit tests for the permissions admin HTTP client.
 *
 * Verifies that every exported function calls `@/lib/api` with the exact
 * path and body shape the BE routes in `be/src/modules/permissions/routes/`
 * expect. Mocks `@/lib/api` so no network is touched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the HTTP layer before importing the module under test
vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '@/lib/api'
import {
  createGrant,
  createOverride,
  deleteGrant,
  deleteOverride,
  getCatalog,
  getGrants,
  getRolePermissions,
  getUserOverrides,
  updateRolePermissions,
  whoCanDo,
} from '@/features/permissions/api/permissionsApi'
import {
  GRANT_RESOURCE_DOCUMENT_CATEGORY,
  GRANT_RESOURCE_KNOWLEDGE_BASE,
  GRANTEE_TYPE_USER,
  OVERRIDE_EFFECT_ALLOW,
} from '@/features/permissions/types/permissions.types'
import { queryKeys } from '@/lib/queryKeys'

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

describe('permissionsApi', () => {
  beforeEach(() => {
    mockedApi.get.mockReset().mockResolvedValue(undefined)
    mockedApi.post.mockReset().mockResolvedValue(undefined)
    mockedApi.put.mockReset().mockResolvedValue(undefined)
    mockedApi.delete.mockReset().mockResolvedValue(undefined)
  })

  it('getCatalog hits GET /api/permissions/catalog', async () => {
    await getCatalog()
    expect(mockedApi.get).toHaveBeenCalledWith('/api/permissions/catalog')
  })

  it('getCatalog returns the raw backend payload for the current scaffold contract', async () => {
    const catalogPayload = {
      version: '2026-04-09T12:00:00Z',
      permissions: [
        {
          key: 'knowledge_base.view',
          action: 'read',
          subject: 'KnowledgeBase',
        },
      ],
    } as Awaited<ReturnType<typeof getCatalog>>
    mockedApi.get.mockResolvedValueOnce(catalogPayload)

    const result = await getCatalog()

    expect(result).toEqual(catalogPayload)
  })

  it('getRolePermissions hits GET /api/permissions/roles/:role', async () => {
    await getRolePermissions('admin')
    expect(mockedApi.get).toHaveBeenCalledWith('/api/permissions/roles/admin')
  })

  it('updateRolePermissions hits PUT /api/permissions/roles/:role with permission_keys body', async () => {
    await updateRolePermissions('admin', { permission_keys: ['a', 'b'] })
    expect(mockedApi.put).toHaveBeenCalledWith('/api/permissions/roles/admin', {
      permission_keys: ['a', 'b'],
    })
  })

  it('getUserOverrides hits GET /api/permissions/users/:userId/overrides', async () => {
    await getUserOverrides(7)
    expect(mockedApi.get).toHaveBeenCalledWith('/api/permissions/users/7/overrides')
  })

  it('createOverride hits POST /api/permissions/users/:userId/overrides', async () => {
    const body = {
      permission_key: 'dataset.view',
      effect: OVERRIDE_EFFECT_ALLOW,
    }
    await createOverride(7, body)
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/api/permissions/users/7/overrides',
      body,
    )
  })

  it('deleteOverride uses the FLAT /api/permissions/overrides/:id path (NOT nested under /users)', async () => {
    await deleteOverride(42)
    expect(mockedApi.delete).toHaveBeenCalledWith('/api/permissions/overrides/42')
    // Double-check we did not accidentally nest under /users/
    const call = mockedApi.delete.mock.calls[0]?.[0] as string
    expect(call).not.toContain('/users/')
  })

  it('whoCanDo builds query string with action, subject, resource_id', async () => {
    await whoCanDo('read', 'KnowledgeBase', 'kb-uuid')
    expect(mockedApi.get).toHaveBeenCalledWith(
      '/api/permissions/who-can-do?action=read&subject=KnowledgeBase&resource_id=kb-uuid',
    )
  })

  it('whoCanDo omits resource_id when not supplied', async () => {
    await whoCanDo('read', 'KnowledgeBase')
    expect(mockedApi.get).toHaveBeenCalledWith(
      '/api/permissions/who-can-do?action=read&subject=KnowledgeBase',
    )
  })

  it('getGrants hits GET /api/permissions/grants with resource_type + resource_id query', async () => {
    await getGrants(GRANT_RESOURCE_KNOWLEDGE_BASE, 'kb-1')
    expect(mockedApi.get).toHaveBeenCalledWith(
      '/api/permissions/grants?resource_type=KnowledgeBase&resource_id=kb-1',
    )
  })

  it('createGrant hits POST /api/permissions/grants with body', async () => {
    const body = {
      resource_type: GRANT_RESOURCE_DOCUMENT_CATEGORY,
      resource_id: 'c1',
      grantee_type: GRANTEE_TYPE_USER,
      grantee_id: 1,
      actions: ['knowledge_base.view'],
    } as const
    await createGrant(body)
    expect(mockedApi.post).toHaveBeenCalledWith('/api/permissions/grants', body)
  })

  it('deleteGrant hits DELETE /api/permissions/grants/:id', async () => {
    await deleteGrant(9)
    expect(mockedApi.delete).toHaveBeenCalledWith('/api/permissions/grants/9')
  })
})

describe('queryKeys.permissions', () => {
  it('catalog key is stable across repeated calls', () => {
    expect(queryKeys.permissions.catalog()).toEqual(queryKeys.permissions.catalog())
  })

  it('rolePermissions key contains "permissions" namespace and the role', () => {
    const key = queryKeys.permissions.rolePermissions('admin')
    expect(key).toContain('permissions')
    expect(key).toContain('admin')
  })

  it('grants key is stable for identical inputs', () => {
    const a = queryKeys.permissions.grants('KnowledgeBase', 'kb-1')
    const b = queryKeys.permissions.grants('KnowledgeBase', 'kb-1')
    expect(a).toEqual(b)
  })
})
