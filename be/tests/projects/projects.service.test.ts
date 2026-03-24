/**
 * @fileoverview Unit tests for ProjectsService.
 * @description Covers project CRUD, RBAC-based listing, permissions, member management,
 *   dataset binding, and activity feed operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockProjectCreate = vi.fn()
const mockProjectFindById = vi.fn()
const mockProjectFindByTenant = vi.fn()
const mockProjectUpdate = vi.fn()
const mockProjectDelete = vi.fn()
const mockPermissionFindByProjectId = vi.fn()
const mockPermissionFindByGrantee = vi.fn()
const mockPermissionCreate = vi.fn()
const mockPermissionUpdate = vi.fn()
const mockPermissionDelete = vi.fn()
const mockPermissionGetKnex = vi.fn()
const mockDatasetCreate = vi.fn()
const mockDatasetUpdate = vi.fn()
const mockProjectDatasetCreate = vi.fn()
const mockProjectDatasetFindByProjectId = vi.fn()
const mockProjectDatasetFindAutoCreated = vi.fn()
const mockProjectDatasetDelete = vi.fn()
const mockEntityPermFindByProjectId = vi.fn()
const mockEntityPermCreate = vi.fn()
const mockEntityPermDelete = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    project: {
      create: (...args: any[]) => mockProjectCreate(...args),
      findById: (...args: any[]) => mockProjectFindById(...args),
      findByTenant: (...args: any[]) => mockProjectFindByTenant(...args),
      update: (...args: any[]) => mockProjectUpdate(...args),
      delete: (...args: any[]) => mockProjectDelete(...args),
    },
    projectPermission: {
      findByProjectId: (...args: any[]) => mockPermissionFindByProjectId(...args),
      findByGrantee: (...args: any[]) => mockPermissionFindByGrantee(...args),
      create: (...args: any[]) => mockPermissionCreate(...args),
      update: (...args: any[]) => mockPermissionUpdate(...args),
      delete: (...args: any[]) => mockPermissionDelete(...args),
      getKnex: (...args: any[]) => mockPermissionGetKnex(...args),
    },
    dataset: {
      create: (...args: any[]) => mockDatasetCreate(...args),
      update: (...args: any[]) => mockDatasetUpdate(...args),
    },
    projectDataset: {
      create: (...args: any[]) => mockProjectDatasetCreate(...args),
      findByProjectId: (...args: any[]) => mockProjectDatasetFindByProjectId(...args),
      findAutoCreated: (...args: any[]) => mockProjectDatasetFindAutoCreated(...args),
      delete: (...args: any[]) => mockProjectDatasetDelete(...args),
    },
    projectEntityPermission: {
      findByProjectId: (...args: any[]) => mockEntityPermFindByProjectId(...args),
      create: (...args: any[]) => mockEntityPermCreate(...args),
      delete: (...args: any[]) => mockEntityPermDelete(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const mockAuditLog = vi.fn()
vi.mock('@/modules/audit/services/audit.service.js', () => ({
  auditService: {
    log: (...args: any[]) => mockAuditLog(...args),
  },
  AuditAction: {
    CREATE_SOURCE: 'CREATE_SOURCE',
    UPDATE_SOURCE: 'UPDATE_SOURCE',
    DELETE_SOURCE: 'DELETE_SOURCE',
    SET_PERMISSION: 'SET_PERMISSION',
  },
  AuditResourceType: {
    DATASET: 'DATASET',
    PERMISSION: 'PERMISSION',
  },
}))

const mockGetUserTeams = vi.fn()
vi.mock('@/modules/teams/services/team.service.js', () => ({
  teamService: {
    getUserTeams: (...args: any[]) => mockGetUserTeams(...args),
  },
}))

// Mock Knex for raw query methods used in getProjectMembers, addMember, etc.
const mockDbKnex = vi.fn()
vi.mock('@/shared/db/knex.js', () => {
  // Create a chainable query builder
  const createBuilder = (result: any = []) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      distinct: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      onConflict: vi.fn().mockReturnThis(),
      ignore: vi.fn().mockResolvedValue(undefined),
      count: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(result),
      clone: vi.fn(),
      then: vi.fn((resolve: any) => resolve(result)),
    }
    builder.clone.mockReturnValue(builder)
    // Make builder thenable
    builder[Symbol.for('vitest:mock-promise')] = true
    return builder
  }

  const db = (...args: any[]) => mockDbKnex(...args)
  db.raw = vi.fn()
  return { db }
})

vi.mock('@/shared/models/types.js', () => ({}))

// Import after mocks
import { ProjectsService } from '../../src/modules/projects/services/projects.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Create a mock user context for testing */
function createUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    email: 'user@test.com',
    role: 'user',
    ip: '127.0.0.1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectsService', () => {
  let service: ProjectsService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ProjectsService()
    mockAuditLog.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // getAccessibleProjects
  // -------------------------------------------------------------------------

  describe('getAccessibleProjects', () => {
    /** @description Admins should see all projects in the tenant */
    it('should return all projects for admin users', async () => {
      const allProjects = [{ id: 'p1' }, { id: 'p2' }]
      mockProjectFindByTenant.mockResolvedValue(allProjects)

      const result = await service.getAccessibleProjects(
        createUser({ role: 'admin' }),
        'tenant-1',
      )

      // Admin bypasses RBAC filtering
      expect(mockProjectFindByTenant).toHaveBeenCalledWith('tenant-1')
      expect(result).toEqual(allProjects)
    })

    /** @description Superadmins should also see all projects */
    it('should return all projects for superadmin users', async () => {
      mockProjectFindByTenant.mockResolvedValue([{ id: 'p1' }])

      const result = await service.getAccessibleProjects(
        createUser({ role: 'superadmin' }),
        'tenant-1',
      )

      expect(result).toHaveLength(1)
    })

    /** @description Regular users should only see public, owned, or permitted projects */
    it('should filter projects for regular users based on RBAC', async () => {
      const allProjects = [
        { id: 'p-public', is_private: false, created_by: 'other' },
        { id: 'p-owned', is_private: true, created_by: 'user-1' },
        { id: 'p-permitted', is_private: true, created_by: 'other' },
        { id: 'p-team-permitted', is_private: true, created_by: 'other' },
        { id: 'p-hidden', is_private: true, created_by: 'other' },
      ]

      mockProjectFindByTenant.mockResolvedValue(allProjects)
      // User has no teams
      mockGetUserTeams.mockResolvedValue([{ id: 'team-1' }])
      // User has direct permission on p-permitted
      mockPermissionFindByGrantee
        .mockResolvedValueOnce([{ project_id: 'p-permitted' }]) // user perms
        .mockResolvedValueOnce([{ project_id: 'p-team-permitted' }]) // team perms

      const result = await service.getAccessibleProjects(createUser(), 'tenant-1')

      // Should include public, owned, user-permitted, and team-permitted; exclude hidden
      const ids = result.map((p: any) => p.id)
      expect(ids).toContain('p-public')
      expect(ids).toContain('p-owned')
      expect(ids).toContain('p-permitted')
      expect(ids).toContain('p-team-permitted')
      expect(ids).not.toContain('p-hidden')
    })

    /** @description User with no teams or permissions should only see public and owned projects */
    it('should show only public and owned projects when user has no permissions', async () => {
      const allProjects = [
        { id: 'p-public', is_private: false, created_by: 'other' },
        { id: 'p-private', is_private: true, created_by: 'other' },
      ]
      mockProjectFindByTenant.mockResolvedValue(allProjects)
      mockGetUserTeams.mockResolvedValue([])
      mockPermissionFindByGrantee.mockResolvedValue([])

      const result = await service.getAccessibleProjects(createUser(), 'tenant-1')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('p-public')
    })
  })

  // -------------------------------------------------------------------------
  // getProjectById
  // -------------------------------------------------------------------------

  describe('getProjectById', () => {
    /** @description Should return project when found */
    it('should return a project by ID', async () => {
      const mockProject = { id: 'p1', name: 'Test' }
      mockProjectFindById.mockResolvedValue(mockProject)

      const result = await service.getProjectById('p1')
      expect(result).toEqual(mockProject)
    })

    /** @description Should return undefined when not found */
    it('should return undefined for non-existent project', async () => {
      mockProjectFindById.mockResolvedValue(undefined)
      expect(await service.getProjectById('missing')).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // createProject
  // -------------------------------------------------------------------------

  describe('createProject', () => {
    /** @description Should create project, auto-create dataset, and log audit */
    it('should create project with auto-created dataset', async () => {
      const mockProject = { id: 'p1', name: 'New Project' }
      const mockDataset = { id: 'ds-1', name: 'New Project_123' }

      mockProjectCreate.mockResolvedValue(mockProject)
      mockDatasetCreate.mockResolvedValue(mockDataset)
      mockProjectDatasetCreate.mockResolvedValue({ project_id: 'p1', dataset_id: 'ds-1' })

      const result = await service.createProject(
        { name: 'New Project', is_private: true },
        createUser(),
        'tenant-1',
      )

      // Verify project creation with correct defaults
      expect(mockProjectCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Project',
          status: 'active',
          is_private: true,
          created_by: 'user-1',
        }),
      )

      // Verify auto-dataset creation
      expect(mockDatasetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: expect.stringContaining('New Project'),
          status: 'active',
        }),
      )

      // Verify dataset linked to project
      expect(mockProjectDatasetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          dataset_id: 'ds-1',
          auto_created: true,
        }),
      )

      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'CREATE_SOURCE',
          resourceId: 'p1',
          tenantId: 'tenant-1',
        }),
      )

      expect(result).toEqual(mockProject)
    })

    /** @description Should default is_private to false when not specified */
    it('should default is_private to false', async () => {
      mockProjectCreate.mockResolvedValue({ id: 'p1', name: 'Test' })
      mockDatasetCreate.mockResolvedValue({ id: 'ds-1' })
      mockProjectDatasetCreate.mockResolvedValue({})

      await service.createProject({ name: 'Test' }, createUser())

      expect(mockProjectCreate).toHaveBeenCalledWith(
        expect.objectContaining({ is_private: false }),
      )
    })

    /** @description Should still create project even if dataset creation fails */
    it('should create project even when dataset auto-creation fails', async () => {
      const mockProject = { id: 'p1', name: 'Partial' }
      mockProjectCreate.mockResolvedValue(mockProject)
      // Dataset creation fails
      mockDatasetCreate.mockRejectedValue(new Error('Dataset error'))

      const result = await service.createProject({ name: 'Partial' }, createUser())

      // Project should still be returned despite dataset failure
      expect(result).toEqual(mockProject)
    })

    /** @description Should propagate errors from project creation */
    it('should throw when project creation fails', async () => {
      mockProjectCreate.mockRejectedValue(new Error('DB error'))

      await expect(service.createProject({ name: 'Fail' }, createUser())).rejects.toThrow('DB error')
    })
  })

  // -------------------------------------------------------------------------
  // updateProject
  // -------------------------------------------------------------------------

  describe('updateProject', () => {
    /** @description Should update only provided fields and log audit */
    it('should update provided fields and log audit', async () => {
      const updated = { id: 'p1', name: 'Updated' }
      mockProjectUpdate.mockResolvedValue(updated)

      const result = await service.updateProject('p1', { name: 'Updated' }, createUser(), 'tenant-1')

      // Verify only name and updated_by are in the payload
      expect(mockProjectUpdate).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ name: 'Updated', updated_by: 'user-1' }),
      )
      expect(mockAuditLog).toHaveBeenCalled()
      expect(result).toEqual(updated)
    })

    /** @description Should stringify parser_config if provided */
    it('should stringify default_parser_config', async () => {
      mockProjectUpdate.mockResolvedValue({ id: 'p1' })

      await service.updateProject('p1', { default_parser_config: { chunk_size: 500 } }, createUser())

      expect(mockProjectUpdate).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          default_parser_config: JSON.stringify({ chunk_size: 500 }),
        }),
      )
    })

    /** @description Should not audit log when project not found */
    it('should skip audit when project not found', async () => {
      mockProjectUpdate.mockResolvedValue(undefined)

      const result = await service.updateProject('missing', { name: 'x' }, createUser())

      expect(result).toBeUndefined()
      expect(mockAuditLog).not.toHaveBeenCalled()
    })

    /** @description Should propagate errors */
    it('should throw when update fails', async () => {
      mockProjectUpdate.mockRejectedValue(new Error('Update error'))

      await expect(service.updateProject('p1', {}, createUser())).rejects.toThrow('Update error')
    })
  })

  // -------------------------------------------------------------------------
  // deleteProject
  // -------------------------------------------------------------------------

  describe('deleteProject', () => {
    /** @description Should soft-delete auto-created datasets and delete project */
    it('should soft-delete auto-created datasets then delete project', async () => {
      mockProjectDatasetFindAutoCreated.mockResolvedValue([
        { dataset_id: 'ds-1' },
        { dataset_id: 'ds-2' },
      ])
      mockDatasetUpdate.mockResolvedValue({})
      mockProjectDelete.mockResolvedValue(undefined)

      await service.deleteProject('p1', createUser(), 'tenant-1')

      // Verify each auto-created dataset is soft-deleted
      expect(mockDatasetUpdate).toHaveBeenCalledWith('ds-1', { status: 'deleted' })
      expect(mockDatasetUpdate).toHaveBeenCalledWith('ds-2', { status: 'deleted' })
      // Verify project deletion
      expect(mockProjectDelete).toHaveBeenCalledWith('p1')
      // Verify audit log
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DELETE_SOURCE',
          resourceId: 'p1',
        }),
      )
    })

    /** @description Should handle projects with no auto-created datasets */
    it('should handle projects with no auto-created datasets', async () => {
      mockProjectDatasetFindAutoCreated.mockResolvedValue([])
      mockProjectDelete.mockResolvedValue(undefined)

      await service.deleteProject('p1', createUser())

      // No dataset updates should be called
      expect(mockDatasetUpdate).not.toHaveBeenCalled()
      expect(mockProjectDelete).toHaveBeenCalledWith('p1')
    })

    /** @description Should propagate errors */
    it('should throw when deletion fails', async () => {
      mockProjectDatasetFindAutoCreated.mockRejectedValue(new Error('Delete error'))

      await expect(service.deleteProject('p1', createUser())).rejects.toThrow('Delete error')
    })
  })

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------

  describe('getPermissions', () => {
    /** @description Should return all permissions for a project */
    it('should return permissions for a project', async () => {
      const perms = [{ id: 'perm-1' }]
      mockPermissionFindByProjectId.mockResolvedValue(perms)

      const result = await service.getPermissions('p1')
      expect(result).toEqual(perms)
    })
  })

  describe('setPermission', () => {
    /** @description Should update existing permission when one exists */
    it('should update existing permission', async () => {
      const existing = { id: 'perm-1', tab_documents: 'view', tab_chat: 'view', tab_settings: 'none' }
      // Mock the Knex chain for finding existing permission
      const chainBuilder = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(existing),
      }
      mockPermissionGetKnex.mockReturnValue(chainBuilder)

      const updated = { id: 'perm-1', tab_documents: 'manage' }
      mockPermissionUpdate.mockResolvedValue(updated)

      const result = await service.setPermission('p1', {
        grantee_type: 'user',
        grantee_id: 'u-2',
        tab_documents: 'manage',
      }, createUser())

      expect(mockPermissionUpdate).toHaveBeenCalledWith(
        'perm-1',
        expect.objectContaining({ tab_documents: 'manage', updated_by: 'user-1' }),
      )
      expect(result).toEqual(updated)
    })

    /** @description Should create new permission when none exists */
    it('should create new permission when not existing', async () => {
      const chainBuilder = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      }
      mockPermissionGetKnex.mockReturnValue(chainBuilder)

      const created = { id: 'perm-new', tab_documents: 'view' }
      mockPermissionCreate.mockResolvedValue(created)

      const result = await service.setPermission('p1', {
        grantee_type: 'team',
        grantee_id: 'team-1',
      }, createUser())

      // Verify defaults are applied for missing tab permissions
      expect(mockPermissionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          grantee_type: 'team',
          tab_documents: 'none',
          tab_chat: 'none',
          tab_settings: 'none',
          created_by: 'user-1',
        }),
      )
      expect(result).toEqual(created)
    })
  })

  describe('deletePermission', () => {
    /** @description Should delete a permission by ID */
    it('should delete permission by ID', async () => {
      mockPermissionDelete.mockResolvedValue(undefined)
      await service.deletePermission('perm-1')
      expect(mockPermissionDelete).toHaveBeenCalledWith('perm-1')
    })
  })

  // -------------------------------------------------------------------------
  // Project Datasets
  // -------------------------------------------------------------------------

  describe('getProjectDatasets', () => {
    /** @description Should return datasets linked to a project */
    it('should return linked datasets', async () => {
      const links = [{ project_id: 'p1', dataset_id: 'ds-1' }]
      mockProjectDatasetFindByProjectId.mockResolvedValue(links)

      const result = await service.getProjectDatasets('p1')
      expect(result).toEqual(links)
    })
  })

  describe('linkDataset', () => {
    /** @description Should link an existing dataset */
    it('should link an existing dataset to a project', async () => {
      const link = { project_id: 'p1', dataset_id: 'ds-1' }
      mockProjectDatasetCreate.mockResolvedValue(link)

      const result = await service.linkDataset('p1', { dataset_id: 'ds-1' }, createUser())

      expect(mockProjectDatasetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          dataset_id: 'ds-1',
          auto_created: false,
        }),
      )
      expect(result).toEqual(link)
    })

    /** @description Should create a new dataset and link it when create_new is true */
    it('should create new dataset and link when create_new is true', async () => {
      const newDataset = { id: 'ds-new' }
      mockDatasetCreate.mockResolvedValue(newDataset)
      mockProjectDatasetCreate.mockResolvedValue({ project_id: 'p1', dataset_id: 'ds-new' })

      const result = await service.linkDataset(
        'p1',
        { create_new: true, dataset_name: 'My Dataset' },
        createUser(),
      )

      expect(mockDatasetCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Dataset', status: 'active' }),
      )
      expect(mockProjectDatasetCreate).toHaveBeenCalledWith(
        expect.objectContaining({ dataset_id: 'ds-new', auto_created: true }),
      )
    })
  })

  describe('unlinkDataset', () => {
    /** @description Should delete the project-dataset link */
    it('should delete project-dataset link', async () => {
      mockProjectDatasetDelete.mockResolvedValue(undefined)

      await service.unlinkDataset('p1', 'ds-1')

      expect(mockProjectDatasetDelete).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: 'p1', dataset_id: 'ds-1' }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Entity Permissions
  // -------------------------------------------------------------------------

  describe('getEntityPermissions', () => {
    /** @description Should return entity permissions for a project */
    it('should return entity permissions', async () => {
      const perms = [{ id: 'ep-1', entity_type: 'chat' }]
      mockEntityPermFindByProjectId.mockResolvedValue(perms)

      const result = await service.getEntityPermissions('p1')
      expect(result).toEqual(perms)
    })
  })

  describe('createEntityPermission', () => {
    /** @description Should create entity permission with default view level */
    it('should create entity permission with defaults', async () => {
      const created = { id: 'ep-1' }
      mockEntityPermCreate.mockResolvedValue(created)

      const result = await service.createEntityPermission('p1', {
        entity_type: 'chat',
        entity_id: 'chat-1',
        grantee_type: 'user',
        grantee_id: 'u-2',
      }, createUser())

      expect(mockEntityPermCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          entity_type: 'chat',
          permission_level: 'view',
          created_by: 'user-1',
        }),
      )
      expect(result).toEqual(created)
    })

    /** @description Should use provided permission level when specified */
    it('should use provided permission_level', async () => {
      mockEntityPermCreate.mockResolvedValue({ id: 'ep-1' })

      await service.createEntityPermission('p1', {
        entity_type: 'category',
        entity_id: 'cat-1',
        grantee_type: 'team',
        grantee_id: 'team-1',
        permission_level: 'edit',
      }, createUser())

      expect(mockEntityPermCreate).toHaveBeenCalledWith(
        expect.objectContaining({ permission_level: 'edit' }),
      )
    })
  })

  describe('deleteEntityPermission', () => {
    /** @description Should delete entity permission by ID */
    it('should delete entity permission', async () => {
      mockEntityPermDelete.mockResolvedValue(undefined)
      await service.deleteEntityPermission('ep-1')
      expect(mockEntityPermDelete).toHaveBeenCalledWith('ep-1')
    })
  })

  // -------------------------------------------------------------------------
  // Member Management
  // -------------------------------------------------------------------------

  describe('removeMember', () => {
    /** @description Should prevent removal of the project creator */
    it('should throw when trying to remove the project creator', async () => {
      mockProjectFindById.mockResolvedValue({ id: 'p1', created_by: 'user-to-remove' })

      await expect(
        service.removeMember('p1', 'user-to-remove', 'admin-1', 'tenant-1'),
      ).rejects.toThrow('Cannot remove the project creator')
    })

    /** @description Should allow removal of non-creator members */
    it('should remove a non-creator member and audit log', async () => {
      mockProjectFindById.mockResolvedValue({ id: 'p1', created_by: 'creator-id' })
      mockPermissionDelete.mockResolvedValue(undefined)

      await service.removeMember('p1', 'member-1', 'admin-1', 'tenant-1')

      expect(mockPermissionDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          grantee_type: 'user',
          grantee_id: 'member-1',
        }),
      )
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SET_PERMISSION',
          details: expect.objectContaining({ type: 'remove_member' }),
        }),
      )
    })
  })
})
