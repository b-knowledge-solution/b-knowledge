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
      mockCategoryDelete.mockResolvedValue(undefined)
      await service.deleteCategory('cat-1')
      expect(mockCategoryDelete).toHaveBeenCalledWith('cat-1')
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
