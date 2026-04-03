/**
 * @fileoverview Tests for Knowledge Base API service.
 *
 * Tests:
 * - Knowledge Base CRUD: getKnowledgeBases, getKnowledgeBaseById, createKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase
 * - Permissions: getKnowledgeBasePermissions, setKnowledgeBasePermission, removeKnowledgeBasePermission
 * - Document Categories: getDocumentCategories, createDocumentCategory, updateDocumentCategory, deleteDocumentCategory
 * - Category Versions: getCategoryVersions, createCategoryVersion, deleteCategoryVersion
 * - Version Documents: getVersionDocuments (query string building)
 * - Knowledge Base Chats: getKnowledgeBaseChats, createKnowledgeBaseChat, deleteKnowledgeBaseChat
 * - Knowledge Base Members: fetchKnowledgeBaseMembers, addKnowledgeBaseMember, removeKnowledgeBaseMember
 * - Activity: fetchKnowledgeBaseActivity (pagination params)
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

describe('knowledgeBaseApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * @description Dynamically imports the knowledge base API module so mocks are resolved
   * @returns {Promise<typeof import('@/features/knowledge-base/api/knowledgeBaseApi')>} Module exports
   */
  async function importModule() {
    return await import('@/features/knowledge-base/api/knowledgeBaseApi')
  }

  // --------------------------------------------------------------------------
  // Knowledge Base CRUD
  // --------------------------------------------------------------------------

  describe('Knowledge Base CRUD', () => {
    /** @description Should list all knowledge bases via GET /api/knowledge-base */
    it('getKnowledgeBases calls api.get with correct endpoint', async () => {
      const { getKnowledgeBases } = await importModule()
      await getKnowledgeBases()
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base')
    })

    /** @description Should fetch a single knowledge base by UUID */
    it('getKnowledgeBaseById calls api.get with knowledge base ID', async () => {
      const { getKnowledgeBaseById } = await importModule()
      await getKnowledgeBaseById('kb-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1')
    })

    /** @description Should POST creation payload to /api/knowledge-base */
    it('createKnowledgeBase sends correct payload', async () => {
      const { createKnowledgeBase } = await importModule()
      const data = { name: 'Test Knowledge Base', category: 'office' as const }
      await createKnowledgeBase(data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-base', data)
    })

    /** @description Should PUT update payload to the knowledge base endpoint */
    it('updateKnowledgeBase sends correct ID and payload', async () => {
      const { updateKnowledgeBase } = await importModule()
      const data = { name: 'Updated' }
      await updateKnowledgeBase('kb-1', data)
      expect(mockApi.put).toHaveBeenCalledWith('/api/knowledge-base/kb-1', data)
    })

    /** @description Should DELETE knowledge base by UUID */
    it('deleteKnowledgeBase calls api.delete with correct endpoint', async () => {
      const { deleteKnowledgeBase } = await importModule()
      await deleteKnowledgeBase('kb-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/knowledge-base/kb-1')
    })
  })

  // --------------------------------------------------------------------------
  // Permissions
  // --------------------------------------------------------------------------

  describe('Permissions', () => {
    /** @description Should fetch permissions for a knowledge base */
    it('getKnowledgeBasePermissions calls correct endpoint', async () => {
      const { getKnowledgeBasePermissions } = await importModule()
      await getKnowledgeBasePermissions('kb-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1/permissions')
    })

    /** @description Should set a permission with the correct payload */
    it('setKnowledgeBasePermission sends grantee data', async () => {
      const { setKnowledgeBasePermission } = await importModule()
      const data = {
        grantee_type: 'user',
        grantee_id: 'user-1',
        tab_documents: 'manage',
        tab_chat: 'view',
        tab_settings: 'none',
      }
      await setKnowledgeBasePermission('kb-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-base/kb-1/permissions', data)
    })

    /** @description Should remove a specific permission by ID */
    it('removeKnowledgeBasePermission calls delete with correct IDs', async () => {
      const { removeKnowledgeBasePermission } = await importModule()
      await removeKnowledgeBasePermission('kb-1', 'perm-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/knowledge-base/kb-1/permissions/perm-1')
    })
  })

  // --------------------------------------------------------------------------
  // Document Categories
  // --------------------------------------------------------------------------

  describe('Document Categories', () => {
    /** @description Should list categories for a knowledge base */
    it('getDocumentCategories calls correct endpoint', async () => {
      const { getDocumentCategories } = await importModule()
      await getDocumentCategories('kb-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1/categories')
    })

    /** @description Should create a category with name and config */
    it('createDocumentCategory sends creation payload', async () => {
      const { createDocumentCategory } = await importModule()
      const data = { name: 'Legal Docs', sort_order: 1 }
      await createDocumentCategory('kb-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-base/kb-1/categories', data)
    })

    /** @description Should update a category with partial data */
    it('updateDocumentCategory sends update payload', async () => {
      const { updateDocumentCategory } = await importModule()
      const data = { name: 'Updated Name' }
      await updateDocumentCategory('kb-1', 'cat-1', data)
      expect(mockApi.put).toHaveBeenCalledWith('/api/knowledge-base/kb-1/categories/cat-1', data)
    })

    /** @description Should delete a category by IDs */
    it('deleteDocumentCategory calls delete with correct IDs', async () => {
      const { deleteDocumentCategory } = await importModule()
      await deleteDocumentCategory('kb-1', 'cat-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/knowledge-base/kb-1/categories/cat-1')
    })
  })

  // --------------------------------------------------------------------------
  // Category Versions
  // --------------------------------------------------------------------------

  describe('Category Versions', () => {
    /** @description Should list versions for a category */
    it('getCategoryVersions calls correct nested endpoint', async () => {
      const { getCategoryVersions } = await importModule()
      await getCategoryVersions('kb-1', 'cat-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1/categories/cat-1/versions')
    })

    /** @description Should create a version with label and config */
    it('createCategoryVersion sends creation payload', async () => {
      const { createCategoryVersion } = await importModule()
      const data = { version_label: 'v1.0', chunk_method: 'naive' }
      await createCategoryVersion('kb-1', 'cat-1', data)
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/knowledge-base/kb-1/categories/cat-1/versions',
        data,
      )
    })

    /** @description Should delete a version by all three IDs */
    it('deleteCategoryVersion calls correct deeply nested endpoint', async () => {
      const { deleteCategoryVersion } = await importModule()
      await deleteCategoryVersion('kb-1', 'cat-1', 'ver-1')
      expect(mockApi.delete).toHaveBeenCalledWith(
        '/api/knowledge-base/kb-1/categories/cat-1/versions/ver-1',
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
      await getVersionDocuments('kb-1', 'cat-1', 'ver-1')
      expect(mockApi.get).toHaveBeenCalledWith(
        '/api/knowledge-base/kb-1/categories/cat-1/versions/ver-1/documents',
      )
    })

    /** @description Should include pagination params in query string */
    it('appends pagination query params when provided', async () => {
      const { getVersionDocuments } = await importModule()
      await getVersionDocuments('kb-1', 'cat-1', 'ver-1', {
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
      await getVersionDocuments('kb-1', 'cat-1', 'ver-1', { page: 0 })
      const calledUrl = mockApi.get.mock.calls[0][0] as string
      // page=0 is falsy, so it should be omitted
      expect(calledUrl).not.toContain('page=')
    })
  })

  // --------------------------------------------------------------------------
  // Knowledge Base Chats
  // --------------------------------------------------------------------------

  describe('Knowledge Base Chats', () => {
    /** @description Should list chat assistants for a knowledge base */
    it('getKnowledgeBaseChats calls correct endpoint', async () => {
      const { getKnowledgeBaseChats } = await importModule()
      await getKnowledgeBaseChats('kb-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1/chats')
    })

    /** @description Should create a chat with name and dataset IDs */
    it('createKnowledgeBaseChat sends creation payload', async () => {
      const { createKnowledgeBaseChat } = await importModule()
      const data = { name: 'Support Chat', dataset_ids: ['ds-1'] }
      await createKnowledgeBaseChat('kb-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-base/kb-1/chats', data)
    })

    /** @description Should delete a chat assistant by knowledge base and chat ID */
    it('deleteKnowledgeBaseChat calls correct endpoint', async () => {
      const { deleteKnowledgeBaseChat } = await importModule()
      await deleteKnowledgeBaseChat('kb-1', 'chat-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/knowledge-base/kb-1/chats/chat-1')
    })
  })

  // --------------------------------------------------------------------------
  // Knowledge Base Members
  // --------------------------------------------------------------------------

  describe('Knowledge Base Members', () => {
    /** @description Should fetch members for a knowledge base */
    it('fetchKnowledgeBaseMembers calls correct endpoint', async () => {
      const { fetchKnowledgeBaseMembers } = await importModule()
      await fetchKnowledgeBaseMembers('kb-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1/members')
    })

    /** @description Should add a member with user_id in the body */
    it('addKnowledgeBaseMember sends user_id in body', async () => {
      const { addKnowledgeBaseMember } = await importModule()
      await addKnowledgeBaseMember('kb-1', 'user-1')
      expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-base/kb-1/members', {
        user_id: 'user-1',
      })
    })

    /** @description Should remove a member by knowledge base and user ID */
    it('removeKnowledgeBaseMember calls correct endpoint', async () => {
      const { removeKnowledgeBaseMember } = await importModule()
      await removeKnowledgeBaseMember('kb-1', 'user-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/knowledge-base/kb-1/members/user-1')
    })
  })

  // --------------------------------------------------------------------------
  // Activity (pagination)
  // --------------------------------------------------------------------------

  describe('fetchKnowledgeBaseActivity', () => {
    /** @description Should use default limit=20 and offset=0 */
    it('uses default pagination values', async () => {
      const { fetchKnowledgeBaseActivity } = await importModule()
      await fetchKnowledgeBaseActivity('kb-1')
      const calledUrl = mockApi.get.mock.calls[0][0] as string
      expect(calledUrl).toContain('limit=20')
      expect(calledUrl).toContain('offset=0')
    })

    /** @description Should pass custom limit and offset in query string */
    it('passes custom pagination params', async () => {
      const { fetchKnowledgeBaseActivity } = await importModule()
      await fetchKnowledgeBaseActivity('kb-1', 50, 100)
      const calledUrl = mockApi.get.mock.calls[0][0] as string
      expect(calledUrl).toContain('limit=50')
      expect(calledUrl).toContain('offset=100')
    })
  })

  // --------------------------------------------------------------------------
  // Sync Configs
  // --------------------------------------------------------------------------

  describe('Sync Configs', () => {
    /** @description Should list sync configs for a knowledge base */
    it('getSyncConfigs calls correct endpoint', async () => {
      const { getSyncConfigs } = await importModule()
      await getSyncConfigs('kb-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1/sync-configs')
    })

    /** @description Should create a sync config with connection details */
    it('createSyncConfig sends creation payload', async () => {
      const { createSyncConfig } = await importModule()
      const data = {
        source_type: 'sharepoint' as const,
        connection_config: { site_url: 'https://sp.example.com' },
      }
      await createSyncConfig('kb-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-base/kb-1/sync-configs', data)
    })

    /** @description Should delete a sync config by knowledge base and config ID */
    it('deleteSyncConfig calls correct endpoint', async () => {
      const { deleteSyncConfig } = await importModule()
      await deleteSyncConfig('kb-1', 'cfg-1')
      expect(mockApi.delete).toHaveBeenCalledWith('/api/knowledge-base/kb-1/sync-configs/cfg-1')
    })

    /** @description Should test sync connection before saving */
    it('testSyncConnection posts test payload', async () => {
      const { testSyncConnection } = await importModule()
      const data = {
        source_type: 'confluence' as const,
        connection_config: { base_url: 'https://confluence.example.com' },
      }
      await testSyncConnection('kb-1', data)
      expect(mockApi.post).toHaveBeenCalledWith('/api/knowledge-base/kb-1/sync-configs/test', data)
    })

    /** @description Should trigger a manual sync run */
    it('triggerSync posts to trigger endpoint', async () => {
      const { triggerSync } = await importModule()
      await triggerSync('kb-1', 'cfg-1')
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/knowledge-base/kb-1/sync-configs/cfg-1/trigger',
      )
    })
  })

  // --------------------------------------------------------------------------
  // Entity Permissions
  // --------------------------------------------------------------------------

  describe('Entity Permissions', () => {
    /** @description Should list all entity permissions for a knowledge base */
    it('getEntityPermissions calls correct endpoint', async () => {
      const { getEntityPermissions } = await importModule()
      await getEntityPermissions('kb-1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/knowledge-base/kb-1/entity-permissions')
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
      await setEntityPermission('kb-1', data)
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/knowledge-base/kb-1/entity-permissions',
        data,
      )
    })

    /** @description Should remove an entity permission by ID */
    it('removeEntityPermission calls delete with correct endpoint', async () => {
      const { removeEntityPermission } = await importModule()
      await removeEntityPermission('kb-1', 'eperm-1')
      expect(mockApi.delete).toHaveBeenCalledWith(
        '/api/knowledge-base/kb-1/entity-permissions/eperm-1',
      )
    })
  })
})
