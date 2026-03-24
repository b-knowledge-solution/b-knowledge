/**
 * @fileoverview Unit tests for ProjectCategoryService.
 * @description Covers category CRUD, version CRUD, and version file listing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCategoryFindByProjectId = vi.fn()
const mockCategoryFindById = vi.fn()
const mockCategoryCreate = vi.fn()
const mockCategoryUpdate = vi.fn()
const mockCategoryDelete = vi.fn()
const mockVersionFindByCategoryId = vi.fn()
const mockVersionFindById = vi.fn()
const mockVersionCreate = vi.fn()
const mockVersionUpdate = vi.fn()
const mockVersionDelete = vi.fn()
const mockVersionFileFindByVersionId = vi.fn()
const mockProjectFindById = vi.fn()
const mockDatasetCreate = vi.fn()
const mockDatasetUpdate = vi.fn()
const mockProjectDatasetCreate = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    documentCategory: {
      findByProjectId: (...args: any[]) => mockCategoryFindByProjectId(...args),
      findById: (...args: any[]) => mockCategoryFindById(...args),
      create: (...args: any[]) => mockCategoryCreate(...args),
      update: (...args: any[]) => mockCategoryUpdate(...args),
      delete: (...args: any[]) => mockCategoryDelete(...args),
    },
    documentCategoryVersion: {
      findByCategoryId: (...args: any[]) => mockVersionFindByCategoryId(...args),
      findById: (...args: any[]) => mockVersionFindById(...args),
      create: (...args: any[]) => mockVersionCreate(...args),
      update: (...args: any[]) => mockVersionUpdate(...args),
      delete: (...args: any[]) => mockVersionDelete(...args),
    },
    documentCategoryVersionFile: {
      findByVersionId: (...args: any[]) => mockVersionFileFindByVersionId(...args),
    },
    project: {
      findById: (...args: any[]) => mockProjectFindById(...args),
    },
    dataset: {
      create: (...args: any[]) => mockDatasetCreate(...args),
      update: (...args: any[]) => mockDatasetUpdate(...args),
    },
    projectDataset: {
      create: (...args: any[]) => mockProjectDatasetCreate(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/models/types.js', () => ({}))

// Import after mocks
import { ProjectCategoryService } from '../../src/modules/projects/services/project-category.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Create a mock user context */
function createUser(overrides: Partial<any> = {}) {
  return { id: 'user-1', email: 'u@test.com', role: 'user', ...overrides }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectCategoryService', () => {
  let service: ProjectCategoryService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ProjectCategoryService()
  })

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  describe('listCategories', () => {
    /** @description Should list all categories for a project */
    it('should return categories for a project', async () => {
      const cats = [{ id: 'cat-1', name: 'Docs' }]
      mockCategoryFindByProjectId.mockResolvedValue(cats)

      const result = await service.listCategories('p1')

      expect(mockCategoryFindByProjectId).toHaveBeenCalledWith('p1')
      expect(result).toEqual(cats)
    })
  })

  describe('getCategoryById', () => {
    /** @description Should return category by ID */
    it('should return a category by ID', async () => {
      mockCategoryFindById.mockResolvedValue({ id: 'cat-1' })
      expect(await service.getCategoryById('cat-1')).toEqual({ id: 'cat-1' })
    })

    /** @description Should return undefined when not found */
    it('should return undefined for non-existent category', async () => {
      mockCategoryFindById.mockResolvedValue(undefined)
      expect(await service.getCategoryById('missing')).toBeUndefined()
    })
  })

  describe('createCategory', () => {
    /** @description Should create a category with serialized dataset_config */
    it('should create category with serialized config and defaults', async () => {
      const created = { id: 'cat-1', name: 'New Category' }
      mockCategoryCreate.mockResolvedValue(created)

      const result = await service.createCategory('p1', {
        name: 'New Category',
        dataset_config: { parser: 'naive' },
      }, createUser())

      // Verify dataset_config is JSON-stringified
      expect(mockCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          name: 'New Category',
          sort_order: 0,
          dataset_config: JSON.stringify({ parser: 'naive' }),
          created_by: 'user-1',
        }),
      )
      expect(result).toEqual(created)
    })

    /** @description Should default sort_order to 0 and description to null */
    it('should use default values for optional fields', async () => {
      mockCategoryCreate.mockResolvedValue({ id: 'cat-1' })

      await service.createCategory('p1', { name: 'Minimal' }, createUser())

      expect(mockCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          sort_order: 0,
          dataset_config: JSON.stringify({}),
        }),
      )
    })
  })

  describe('updateCategory', () => {
    /** @description Should update only provided fields */
    it('should update provided fields and set updated_by', async () => {
      mockCategoryUpdate.mockResolvedValue({ id: 'cat-1', name: 'Updated' })

      const result = await service.updateCategory('cat-1', { name: 'Updated' }, createUser())

      expect(mockCategoryUpdate).toHaveBeenCalledWith(
        'cat-1',
        expect.objectContaining({ name: 'Updated', updated_by: 'user-1' }),
      )
      expect(result).toEqual({ id: 'cat-1', name: 'Updated' })
    })

    /** @description Should stringify dataset_config if provided */
    it('should stringify dataset_config on update', async () => {
      mockCategoryUpdate.mockResolvedValue({ id: 'cat-1' })

      await service.updateCategory('cat-1', { dataset_config: { size: 100 } }, createUser())

      expect(mockCategoryUpdate).toHaveBeenCalledWith(
        'cat-1',
        expect.objectContaining({ dataset_config: JSON.stringify({ size: 100 }) }),
      )
    })

    /** @description Should not include undefined fields */
    it('should skip undefined fields', async () => {
      mockCategoryUpdate.mockResolvedValue({ id: 'cat-1' })

      await service.updateCategory('cat-1', {}, createUser())

      const payload = mockCategoryUpdate.mock.calls[0][1]
      expect(payload).toEqual({ updated_by: 'user-1' })
      expect(payload).not.toHaveProperty('name')
    })
  })

  describe('deleteCategory', () => {
    /** @description Should delete a category by ID */
    it('should delete category', async () => {
      mockCategoryFindById.mockResolvedValue({ id: 'cat-1', dataset_id: null })
      mockCategoryDelete.mockResolvedValue(undefined)
      await service.deleteCategory('cat-1')
      expect(mockCategoryDelete).toHaveBeenCalledWith('cat-1')
    })
  })

  // -------------------------------------------------------------------------
  // Type-discriminated category creation and deletion
  // -------------------------------------------------------------------------

  describe('type-discriminated category creation', () => {
    const mockProject = {
      id: 'p1',
      name: 'TestProject',
      default_embedding_model: 'text-embedding-ada-002',
      default_chunk_method: 'recursive',
      is_private: false,
    }

    /** @description Documents type should NOT auto-create a dataset */
    it('should create documents category without auto-creating dataset', async () => {
      const created = { id: 'cat-1', name: 'My Docs', category_type: 'documents' }
      mockCategoryCreate.mockResolvedValue(created)

      const result = await service.createCategory('p1', {
        name: 'My Docs',
        category_type: 'documents',
      }, createUser())

      // Category is created with category_type in payload
      expect(mockCategoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          category_type: 'documents',
          name: 'My Docs',
        }),
      )
      // Dataset creation is NOT called for documents type
      expect(mockDatasetCreate).not.toHaveBeenCalled()
      expect(result).toEqual(created)
    })

    /** @description Standard type should auto-create a dataset with project's default parser */
    it('should create standard category and auto-create dataset with default parser', async () => {
      const created = { id: 'cat-2', name: 'Standards', category_type: 'standard' }
      mockCategoryCreate.mockResolvedValue(created)
      mockProjectFindById.mockResolvedValue(mockProject)
      mockDatasetCreate.mockResolvedValue({ id: 'ds-1' })

      const result = await service.createCategory('p1', {
        name: 'Standards',
        category_type: 'standard',
      }, createUser())

      // Dataset is created with project's default_chunk_method as parser_id
      expect(mockDatasetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestProject_Standards',
          parser_id: 'recursive',
          embedding_model: 'text-embedding-ada-002',
        }),
      )
      // Category is updated with the dataset_id
      expect(mockCategoryUpdate).toHaveBeenCalledWith('cat-2', { dataset_id: 'ds-1' })
      // Returned category includes dataset_id
      expect(result.dataset_id).toBe('ds-1')
    })

    /** @description Code type should auto-create a dataset with parser_id='code' */
    it('should create code category and auto-create dataset with code parser', async () => {
      const created = { id: 'cat-3', name: 'Source', category_type: 'code' }
      mockCategoryCreate.mockResolvedValue(created)
      mockProjectFindById.mockResolvedValue(mockProject)
      mockDatasetCreate.mockResolvedValue({ id: 'ds-2' })

      const result = await service.createCategory('p1', {
        name: 'Source',
        category_type: 'code',
      }, createUser())

      // Dataset is created with parser_id='code' regardless of project default
      expect(mockDatasetCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TestProject_Source',
          parser_id: 'code',
          embedding_model: 'text-embedding-ada-002',
        }),
      )
      // Category is updated with dataset_id
      expect(mockCategoryUpdate).toHaveBeenCalledWith('cat-3', { dataset_id: 'ds-2' })
      expect(result.dataset_id).toBe('ds-2')
    })

    /** @description Standard type should link dataset to project via projectDataset with auto_created=true */
    it('should link auto-created dataset to project for standard type', async () => {
      const created = { id: 'cat-4', name: 'Linked', category_type: 'standard' }
      mockCategoryCreate.mockResolvedValue(created)
      mockProjectFindById.mockResolvedValue(mockProject)
      mockDatasetCreate.mockResolvedValue({ id: 'ds-3' })

      await service.createCategory('p1', {
        name: 'Linked',
        category_type: 'standard',
      }, createUser())

      // projectDataset.create is called with auto_created=true
      expect(mockProjectDatasetCreate).toHaveBeenCalledWith({
        project_id: 'p1',
        dataset_id: 'ds-3',
        auto_created: true,
      })
    })
  })

  describe('type-discriminated category deletion', () => {
    /** @description Deleting standard/code category with dataset_id should soft-delete the dataset */
    it('should soft-delete linked dataset when deleting standard/code category', async () => {
      mockCategoryFindById.mockResolvedValue({
        id: 'cat-5',
        category_type: 'standard',
        dataset_id: 'ds-5',
      })
      mockCategoryDelete.mockResolvedValue(undefined)

      await service.deleteCategory('cat-5')

      // Dataset is soft-deleted by setting status to inactive
      expect(mockDatasetUpdate).toHaveBeenCalledWith('ds-5', { status: 'inactive' })
      // Category is still deleted
      expect(mockCategoryDelete).toHaveBeenCalledWith('cat-5')
    })

    /** @description Deleting documents category should NOT attempt dataset cleanup */
    it('should not attempt dataset cleanup for documents category', async () => {
      mockCategoryFindById.mockResolvedValue({
        id: 'cat-6',
        category_type: 'documents',
        dataset_id: null,
      })
      mockCategoryDelete.mockResolvedValue(undefined)

      await service.deleteCategory('cat-6')

      // No dataset update since documents type has no linked dataset
      expect(mockDatasetUpdate).not.toHaveBeenCalled()
      // Category is deleted normally
      expect(mockCategoryDelete).toHaveBeenCalledWith('cat-6')
    })
  })

  // -------------------------------------------------------------------------
  // Versions
  // -------------------------------------------------------------------------

  describe('listVersions', () => {
    /** @description Should list versions for a category */
    it('should return versions for a category', async () => {
      const versions = [{ id: 'v1', version_label: 'v1.0' }]
      mockVersionFindByCategoryId.mockResolvedValue(versions)

      const result = await service.listVersions('cat-1')
      expect(result).toEqual(versions)
    })
  })

  describe('getVersionById', () => {
    /** @description Should return a version by ID */
    it('should return version by ID', async () => {
      mockVersionFindById.mockResolvedValue({ id: 'v1' })
      expect(await service.getVersionById('v1')).toEqual({ id: 'v1' })
    })
  })

  describe('createVersion', () => {
    /** @description Should create a version with serialized metadata */
    it('should create version with active status and serialized metadata', async () => {
      const created = { id: 'v1', version_label: 'v1.0' }
      // Set up required mocks for category and project lookup
      mockCategoryFindById.mockResolvedValue({ id: 'cat-1', project_id: 'p1' })
      mockProjectFindById.mockResolvedValue({ id: 'p1', name: 'TestProject', default_embedding_model: 'ada-002', default_chunk_method: 'naive', is_private: false })
      mockDatasetCreate.mockResolvedValue({ id: 'ds-v1' })
      mockVersionCreate.mockResolvedValue(created)

      const result = await service.createVersion('cat-1', {
        version_label: 'v1.0',
        metadata: { notes: 'Initial release' },
      }, createUser())

      expect(mockVersionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: 'cat-1',
          version_label: 'v1.0',
          status: 'active',
          metadata: JSON.stringify({ notes: 'Initial release' }),
          created_by: 'user-1',
        }),
      )
      expect(result).toEqual(created)
    })
  })

  describe('updateVersion', () => {
    /** @description Should update version fields selectively */
    it('should update only provided version fields', async () => {
      mockVersionUpdate.mockResolvedValue({ id: 'v1' })

      await service.updateVersion('v1', {
        version_label: 'v2.0',
        ragflow_dataset_id: 'rf-1',
      }, createUser())

      expect(mockVersionUpdate).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({
          version_label: 'v2.0',
          ragflow_dataset_id: 'rf-1',
          updated_by: 'user-1',
        }),
      )
    })

    /** @description Should stringify metadata on update */
    it('should stringify metadata if provided', async () => {
      mockVersionUpdate.mockResolvedValue({ id: 'v1' })

      await service.updateVersion('v1', { metadata: { key: 'val' } }, createUser())

      expect(mockVersionUpdate).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ metadata: JSON.stringify({ key: 'val' }) }),
      )
    })
  })

  describe('deleteVersion', () => {
    /** @description Should delete a version by ID */
    it('should delete version', async () => {
      mockVersionDelete.mockResolvedValue(undefined)
      await service.deleteVersion('v1')
      expect(mockVersionDelete).toHaveBeenCalledWith('v1')
    })
  })

  // -------------------------------------------------------------------------
  // Version Files
  // -------------------------------------------------------------------------

  describe('listVersionFiles', () => {
    /** @description Should list all files for a version */
    it('should return files for a version', async () => {
      const files = [{ id: 'f1', name: 'doc.pdf' }]
      mockVersionFileFindByVersionId.mockResolvedValue(files)

      const result = await service.listVersionFiles('v1')
      expect(result).toEqual(files)
    })
  })
})
