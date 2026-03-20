/**
 * @fileoverview Unit tests for ProjectSearchService.
 * @description Covers CRUD operations for project search app configurations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSearchFindByProjectId = vi.fn()
const mockSearchFindById = vi.fn()
const mockSearchCreate = vi.fn()
const mockSearchUpdate = vi.fn()
const mockSearchDelete = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    projectSearch: {
      findByProjectId: (...args: any[]) => mockSearchFindByProjectId(...args),
      findById: (...args: any[]) => mockSearchFindById(...args),
      create: (...args: any[]) => mockSearchCreate(...args),
      update: (...args: any[]) => mockSearchUpdate(...args),
      delete: (...args: any[]) => mockSearchDelete(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/models/types.js', () => ({}))

// Import after mocks
import { ProjectSearchService } from '../../src/modules/projects/services/project-search.service'

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

describe('ProjectSearchService', () => {
  let service: ProjectSearchService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ProjectSearchService()
  })

  // -------------------------------------------------------------------------
  // listSearches
  // -------------------------------------------------------------------------

  describe('listSearches', () => {
    /** @description Should list all search configs for a project */
    it('should return search configurations for a project', async () => {
      const searches = [{ id: 's1', name: 'Knowledge Search' }]
      mockSearchFindByProjectId.mockResolvedValue(searches)

      const result = await service.listSearches('p1')

      expect(mockSearchFindByProjectId).toHaveBeenCalledWith('p1')
      expect(result).toEqual(searches)
    })

    /** @description Should return empty array when no searches exist */
    it('should return empty array for project with no searches', async () => {
      mockSearchFindByProjectId.mockResolvedValue([])
      expect(await service.listSearches('p1')).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // getSearchById
  // -------------------------------------------------------------------------

  describe('getSearchById', () => {
    /** @description Should return a search config by ID */
    it('should return search by ID', async () => {
      const search = { id: 's1', name: 'Search' }
      mockSearchFindById.mockResolvedValue(search)

      expect(await service.getSearchById('s1')).toEqual(search)
    })

    /** @description Should return undefined when not found */
    it('should return undefined for non-existent search', async () => {
      mockSearchFindById.mockResolvedValue(undefined)
      expect(await service.getSearchById('missing')).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // createSearch
  // -------------------------------------------------------------------------

  describe('createSearch', () => {
    /** @description Should create search with JSON-serialized config fields */
    it('should create search with serialized fields', async () => {
      const created = { id: 's1', name: 'New Search' }
      mockSearchCreate.mockResolvedValue(created)

      const result = await service.createSearch('p1', {
        name: 'New Search',
        description: 'A search app',
        dataset_ids: ['ds-1'],
        search_config: { top_k: 10 },
      }, createUser())

      // Verify JSON serialization of array/object fields
      expect(mockSearchCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          name: 'New Search',
          description: 'A search app',
          dataset_ids: JSON.stringify(['ds-1']),
          ragflow_dataset_ids: JSON.stringify([]),
          search_config: JSON.stringify({ top_k: 10 }),
          status: 'active',
          created_by: 'user-1',
          updated_by: 'user-1',
        }),
      )
      expect(result).toEqual(created)
    })

    /** @description Should default optional fields to empty/null */
    it('should use defaults for optional config fields', async () => {
      mockSearchCreate.mockResolvedValue({ id: 's1' })

      await service.createSearch('p1', { name: 'Minimal' }, createUser())

      expect(mockSearchCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: null,
          dataset_ids: JSON.stringify([]),
          ragflow_dataset_ids: JSON.stringify([]),
          search_config: JSON.stringify({}),
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // updateSearch
  // -------------------------------------------------------------------------

  describe('updateSearch', () => {
    /** @description Should update only provided fields */
    it('should update provided fields with JSON serialization', async () => {
      mockSearchUpdate.mockResolvedValue({ id: 's1', name: 'Updated' })

      const result = await service.updateSearch('s1', {
        name: 'Updated',
        search_config: { top_k: 20 },
      }, createUser())

      expect(mockSearchUpdate).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({
          name: 'Updated',
          search_config: JSON.stringify({ top_k: 20 }),
          updated_by: 'user-1',
        }),
      )
      expect(result).toEqual({ id: 's1', name: 'Updated' })
    })

    /** @description Should not include undefined fields */
    it('should skip undefined fields in update', async () => {
      mockSearchUpdate.mockResolvedValue({ id: 's1' })

      await service.updateSearch('s1', { status: 'inactive' }, createUser())

      const payload = mockSearchUpdate.mock.calls[0][1]
      expect(payload).toEqual({ updated_by: 'user-1', status: 'inactive' })
      expect(payload).not.toHaveProperty('name')
      expect(payload).not.toHaveProperty('search_config')
    })

    /** @description Should return undefined when search not found */
    it('should return undefined for non-existent search', async () => {
      mockSearchUpdate.mockResolvedValue(undefined)

      expect(await service.updateSearch('missing', { name: 'x' }, createUser())).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // deleteSearch
  // -------------------------------------------------------------------------

  describe('deleteSearch', () => {
    /** @description Should delete a search config by ID */
    it('should delete search', async () => {
      mockSearchDelete.mockResolvedValue(undefined)

      await service.deleteSearch('s1')

      expect(mockSearchDelete).toHaveBeenCalledWith('s1')
    })
  })
})
