/**
 * @fileoverview Tests for Project API service.
 *
 * Tests:
 * - Project CRUD: getProjects, getProjectById, createProject, updateProject, deleteProject
 * - Permissions: getProjectPermissions, setProjectPermission, removeProjectPermission
 * - Document Categories: getDocumentCategories, createDocumentCategory, updateDocumentCategory, deleteDocumentCategory
 * - Category Versions: getCategoryVersions, createCategoryVersion, deleteCategoryVersion
 * - Version Documents: getVersionDocuments (query string building)
 * - Project Chats: getProjectChats, createProjectChat, deleteProjectChat
 * - Project Members: fetchProjectMembers, addProjectMember, removeProjectMember
 * - Activity: fetchProjectActivity (pagination params)
 * - Sync Configs: getSyncConfigs, createSyncConfig, deleteSyncConfig, testSyncConnection, triggerSync
 *
 * Mocks `api` and `apiFetch` from `@/lib/api`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mocks
// ============================================================================

const mockApi = {
  get: vi.fn().mockResolvedValue({}),
  post: vi.fn().mockResolvedValue({}),
  put: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue(undefined),
}
const mockApiFetch = vi.fn().mockResolvedValue({})

vi.mock('@/lib/api', () => ({
  api: mockApi,
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

// ============================================================================
// Tests
// ============================================================================

describe('projectApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * @description Dynamically imports the project API module so mocks are resolved
   * @returns {Promise<typeof import('@/features/projects/api/projectApi')>} Module exports
   */
  async function importModule() {
    return await import('@/features/projects/api/projectApi')
  }

  // --------------------------------------------------------------------------
  // Project CRUD
  // --------------------------------------------------------------------------

  describe('Project CRUD', () => {
    /** @description Should list all projects via GET /api/projects */
    it('getProjects calls api.get with correct endpoint', async () => {
      const { getProjects } = await importModule()
      await getProjects()
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects')
    })

    /** @description Should fetch a single project by UUID */
    it('getProjectById calls api.get with project ID', async () => {
      const { getProjectById } = await importModule()
      await getProjectById('proj-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1')
    })

    /** @description Should POST creation payload to /api/projects */
    it('createProject sends correct payload', async () => {
      const { createProject } = await importModule()
      const data = { name: 'Test Project', category: 'office' as const }
      await createProject(data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects', data)
    })

    /** @description Should PUT update payload to the project endpoint */
    it('updateProject sends correct ID and payload', async () => {
      const { updateProject } = await importModule()
      const data = { name: 'Updated' }
      await updateProject('proj-1', data)
      expect(mockApi.put).toHaveBeenCalledWith('/api/projects/proj-1', data)
    })

    /** @description Should DELETE project by UUID */
    it('deleteProject calls api.delete with correct endpoint', async () => {
      const { deleteProject } = await importModule()
      await deleteProject('proj-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/proj-1')
    })
  })

  // --------------------------------------------------------------------------
  // Permissions
  // --------------------------------------------------------------------------

  describe('Permissions', () => {
    /** @description Should fetch permissions for a project */
    it('getProjectPermissions calls correct endpoint', async () => {
      const { getProjectPermissions } = await importModule()
      await getProjectPermissions('proj-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1/permissions')
    })

    /** @description Should set a permission with the correct payload */
    it('setProjectPermission sends grantee data', async () => {
      const { setProjectPermission } = await importModule()
      const data = {
        grantee_type: 'user',
        grantee_id: 'user-1',
        tab_documents: 'manage',
        tab_chat: 'view',
        tab_settings: 'none',
      }
      await setProjectPermission('proj-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects/proj-1/permissions', data)
    })

    /** @description Should remove a specific permission by ID */
    it('removeProjectPermission calls delete with correct IDs', async () => {
      const { removeProjectPermission } = await importModule()
      await removeProjectPermission('proj-1', 'perm-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/proj-1/permissions/perm-1')
    })
  })

  // --------------------------------------------------------------------------
  // Document Categories
  // --------------------------------------------------------------------------

  describe('Document Categories', () => {
    /** @description Should list categories for a project */
    it('getDocumentCategories calls correct endpoint', async () => {
      const { getDocumentCategories } = await importModule()
      await getDocumentCategories('proj-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1/categories')
    })

    /** @description Should create a category with name and config */
    it('createDocumentCategory sends creation payload', async () => {
      const { createDocumentCategory } = await importModule()
      const data = { name: 'Legal Docs', sort_order: 1 }
      await createDocumentCategory('proj-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects/proj-1/categories', data)
    })

    /** @description Should update a category with partial data */
    it('updateDocumentCategory sends update payload', async () => {
      const { updateDocumentCategory } = await importModule()
      const data = { name: 'Updated Name' }
      await updateDocumentCategory('proj-1', 'cat-1', data)
      expect(mockApi.put).toHaveBeenCalledWith('/api/projects/proj-1/categories/cat-1', data)
    })

    /** @description Should delete a category by IDs */
    it('deleteDocumentCategory calls delete with correct IDs', async () => {
      const { deleteDocumentCategory } = await importModule()
      await deleteDocumentCategory('proj-1', 'cat-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/proj-1/categories/cat-1')
    })
  })

  // --------------------------------------------------------------------------
  // Category Versions
  // --------------------------------------------------------------------------

  describe('Category Versions', () => {
    /** @description Should list versions for a category */
    it('getCategoryVersions calls correct nested endpoint', async () => {
      const { getCategoryVersions } = await importModule()
      await getCategoryVersions('proj-1', 'cat-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1/categories/cat-1/versions')
    })

    /** @description Should create a version with label and config */
    it('createCategoryVersion sends creation payload', async () => {
      const { createCategoryVersion } = await importModule()
      const data = { version_label: 'v1.0', chunk_method: 'naive' }
      await createCategoryVersion('proj-1', 'cat-1', data)
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/projects/proj-1/categories/cat-1/versions',
        data,
      )
    })

    /** @description Should delete a version by all three IDs */
    it('deleteCategoryVersion calls correct deeply nested endpoint', async () => {
      const { deleteCategoryVersion } = await importModule()
      await deleteCategoryVersion('proj-1', 'cat-1', 'ver-1')
      expect(mockApi.delete).toHaveBeenCalledWith(
        '/api/projects/proj-1/categories/cat-1/versions/ver-1',
      )
    })
  })

  // --------------------------------------------------------------------------
  // Version Documents (query string building)
  // --------------------------------------------------------------------------

  describe('getVersionDocuments', () => {
    /** @description Should build URL without query string when no query params are given */
    it('builds URL without query string when params omitted', async () => {
      const { getVersionDocuments } = await importModule()
      await getVersionDocuments('proj-1', 'cat-1', 'ver-1')
      expect(mockApi.get).toHaveBeenCalledWith(
        '/api/projects/proj-1/categories/cat-1/versions/ver-1/documents',
      )
    })

    /** @description Should include pagination params in query string */
    it('appends pagination query params when provided', async () => {
      const { getVersionDocuments } = await importModule()
      await getVersionDocuments('proj-1', 'cat-1', 'ver-1', {
        page: 2,
        page_size: 10,
        keywords: 'test',
      })
      // Verify the URL contains the query parameters
      const calledUrl = mockApi.get.mock.calls[0][0] as string
      expect(calledUrl).toContain('page=2')
      expect(calledUrl).toContain('page_size=10')
      expect(calledUrl).toContain('keywords=test')
    })

    /** @description Should omit zero-value page from query string (falsy check) */
    it('omits page when it is 0 (falsy)', async () => {
      const { getVersionDocuments } = await importModule()
      await getVersionDocuments('proj-1', 'cat-1', 'ver-1', { page: 0 })
      const calledUrl = mockApi.get.mock.calls[0][0] as string
      // page=0 is falsy, so it should be omitted
      expect(calledUrl).not.toContain('page=')
    })
  })

  // --------------------------------------------------------------------------
  // Project Chats
  // --------------------------------------------------------------------------

  describe('Project Chats', () => {
    /** @description Should list chat assistants for a project */
    it('getProjectChats calls correct endpoint', async () => {
      const { getProjectChats } = await importModule()
      await getProjectChats('proj-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1/chats')
    })

    /** @description Should create a chat with name and dataset IDs */
    it('createProjectChat sends creation payload', async () => {
      const { createProjectChat } = await importModule()
      const data = { name: 'Support Chat', dataset_ids: ['ds-1'] }
      await createProjectChat('proj-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects/proj-1/chats', data)
    })

    /** @description Should delete a chat assistant by project and chat ID */
    it('deleteProjectChat calls correct endpoint', async () => {
      const { deleteProjectChat } = await importModule()
      await deleteProjectChat('proj-1', 'chat-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/proj-1/chats/chat-1')
    })
  })

  // --------------------------------------------------------------------------
  // Project Members
  // --------------------------------------------------------------------------

  describe('Project Members', () => {
    /** @description Should fetch members for a project */
    it('fetchProjectMembers calls correct endpoint', async () => {
      const { fetchProjectMembers } = await importModule()
      await fetchProjectMembers('proj-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1/members')
    })

    /** @description Should add a member with user_id in the body */
    it('addProjectMember sends user_id in body', async () => {
      const { addProjectMember } = await importModule()
      await addProjectMember('proj-1', 'user-1')
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects/proj-1/members', {
        user_id: 'user-1',
      })
    })

    /** @description Should remove a member by project and user ID */
    it('removeProjectMember calls correct endpoint', async () => {
      const { removeProjectMember } = await importModule()
      await removeProjectMember('proj-1', 'user-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/proj-1/members/user-1')
    })
  })

  // --------------------------------------------------------------------------
  // Activity (pagination)
  // --------------------------------------------------------------------------

  describe('fetchProjectActivity', () => {
    /** @description Should use default limit=20 and offset=0 */
    it('uses default pagination values', async () => {
      const { fetchProjectActivity } = await importModule()
      await fetchProjectActivity('proj-1')
      const calledUrl = mockApi.get.mock.calls[0][0] as string
      expect(calledUrl).toContain('limit=20')
      expect(calledUrl).toContain('offset=0')
    })

    /** @description Should pass custom limit and offset in query string */
    it('passes custom pagination params', async () => {
      const { fetchProjectActivity } = await importModule()
      await fetchProjectActivity('proj-1', 50, 100)
      const calledUrl = mockApi.get.mock.calls[0][0] as string
      expect(calledUrl).toContain('limit=50')
      expect(calledUrl).toContain('offset=100')
    })
  })

  // --------------------------------------------------------------------------
  // Sync Configs
  // --------------------------------------------------------------------------

  describe('Sync Configs', () => {
    /** @description Should list sync configs for a project */
    it('getSyncConfigs calls correct endpoint', async () => {
      const { getSyncConfigs } = await importModule()
      await getSyncConfigs('proj-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1/sync-configs')
    })

    /** @description Should create a sync config with connection details */
    it('createSyncConfig sends creation payload', async () => {
      const { createSyncConfig } = await importModule()
      const data = {
        source_type: 'sharepoint' as const,
        connection_config: { site_url: 'https://sp.example.com' },
      }
      await createSyncConfig('proj-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects/proj-1/sync-configs', data)
    })

    /** @description Should delete a sync config by project and config ID */
    it('deleteSyncConfig calls correct endpoint', async () => {
      const { deleteSyncConfig } = await importModule()
      await deleteSyncConfig('proj-1', 'cfg-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/projects/proj-1/sync-configs/cfg-1')
    })

    /** @description Should test sync connection before saving */
    it('testSyncConnection posts test payload', async () => {
      const { testSyncConnection } = await importModule()
      const data = {
        source_type: 'confluence' as const,
        connection_config: { base_url: 'https://confluence.example.com' },
      }
      await testSyncConnection('proj-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/projects/proj-1/sync-configs/test', data)
    })

    /** @description Should trigger a manual sync run */
    it('triggerSync posts to trigger endpoint', async () => {
      const { triggerSync } = await importModule()
      await triggerSync('proj-1', 'cfg-1')
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/projects/proj-1/sync-configs/cfg-1/trigger',
      )
    })
  })

  // --------------------------------------------------------------------------
  // Entity Permissions
  // --------------------------------------------------------------------------

  describe('Entity Permissions', () => {
    /** @description Should list all entity permissions for a project */
    it('getEntityPermissions calls correct endpoint', async () => {
      const { getEntityPermissions } = await importModule()
      await getEntityPermissions('proj-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/projects/proj-1/entity-permissions')
    })

    /** @description Should set an entity permission with full payload */
    it('setEntityPermission posts correct data', async () => {
      const { setEntityPermission } = await importModule()
      const data = {
        entity_type: 'category',
        entity_id: 'cat-1',
        grantee_type: 'user',
        grantee_id: 'user-1',
        permission_level: 'edit',
      }
      await setEntityPermission('proj-1', data)
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/projects/proj-1/entity-permissions',
        data,
      )
    })

    /** @description Should remove an entity permission by ID */
    it('removeEntityPermission calls delete with correct endpoint', async () => {
      const { removeEntityPermission } = await importModule()
      await removeEntityPermission('proj-1', 'eperm-1')
      expect(mockApi.delete).toHaveBeenCalledWith(
        '/api/projects/proj-1/entity-permissions/eperm-1',
      )
    })
  })
})
