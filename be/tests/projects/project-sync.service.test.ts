/**
 * @fileoverview Unit tests for ProjectSyncService.
 * @description Covers CRUD operations for project sync configurations
 *   including encryption of connection config and test connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSyncConfigFindByProjectId = vi.fn()
const mockSyncConfigFindById = vi.fn()
const mockSyncConfigCreate = vi.fn()
const mockSyncConfigUpdate = vi.fn()
const mockSyncConfigDelete = vi.fn()

vi.mock('@/shared/models/factory.js', () => ({
  ModelFactory: {
    projectSyncConfig: {
      findByProjectId: (...args: any[]) => mockSyncConfigFindByProjectId(...args),
      findById: (...args: any[]) => mockSyncConfigFindById(...args),
      create: (...args: any[]) => mockSyncConfigCreate(...args),
      update: (...args: any[]) => mockSyncConfigUpdate(...args),
      delete: (...args: any[]) => mockSyncConfigDelete(...args),
    },
  },
}))

vi.mock('@/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEncrypt = vi.fn()
vi.mock('@/shared/services/crypto.service.js', () => ({
  cryptoService: {
    encrypt: (...args: any[]) => mockEncrypt(...args),
  },
}))

vi.mock('@/shared/models/types.js', () => ({}))

// Import after mocks
import { ProjectSyncService } from '../../src/modules/projects/services/project-sync.service'

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

describe('ProjectSyncService', () => {
  let service: ProjectSyncService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new ProjectSyncService()
    // Default encrypt mock returns a predictable value
    mockEncrypt.mockReturnValue('encrypted-value')
  })

  // -------------------------------------------------------------------------
  // listSyncConfigs
  // -------------------------------------------------------------------------

  describe('listSyncConfigs', () => {
    /** @description Should list all sync configs for a project */
    it('should return sync configs for a project', async () => {
      const configs = [{ id: 'sc-1', source_type: 'github' }]
      mockSyncConfigFindByProjectId.mockResolvedValue(configs)

      const result = await service.listSyncConfigs('p1')

      expect(mockSyncConfigFindByProjectId).toHaveBeenCalledWith('p1')
      expect(result).toEqual(configs)
    })

    /** @description Should return empty array when no configs exist */
    it('should return empty array for project with no sync configs', async () => {
      mockSyncConfigFindByProjectId.mockResolvedValue([])
      expect(await service.listSyncConfigs('p1')).toEqual([])
    })
  })

  // -------------------------------------------------------------------------
  // getSyncConfigById
  // -------------------------------------------------------------------------

  describe('getSyncConfigById', () => {
    /** @description Should return a sync config by ID */
    it('should return sync config by ID', async () => {
      mockSyncConfigFindById.mockResolvedValue({ id: 'sc-1' })
      expect(await service.getSyncConfigById('sc-1')).toEqual({ id: 'sc-1' })
    })

    /** @description Should return undefined when not found */
    it('should return undefined for non-existent config', async () => {
      mockSyncConfigFindById.mockResolvedValue(undefined)
      expect(await service.getSyncConfigById('missing')).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // createSyncConfig
  // -------------------------------------------------------------------------

  describe('createSyncConfig', () => {
    /** @description Should encrypt connection_config before storage */
    it('should encrypt connection config and create record', async () => {
      const created = { id: 'sc-1', source_type: 'github' }
      mockSyncConfigCreate.mockResolvedValue(created)

      const result = await service.createSyncConfig('p1', {
        source_type: 'github',
        connection_config: 'raw-secret-token',
        sync_schedule: '0 0 * * *',
        filter_rules: { include: ['*.md'] },
      }, createUser())

      // Verify connection_config was encrypted
      expect(mockEncrypt).toHaveBeenCalledWith('raw-secret-token')

      expect(mockSyncConfigCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          source_type: 'github',
          connection_config: 'encrypted-value',
          sync_schedule: '0 0 * * *',
          filter_rules: JSON.stringify({ include: ['*.md'] }),
          status: 'active',
          created_by: 'user-1',
          updated_by: 'user-1',
        }),
      )
      expect(result).toEqual(created)
    })

    /** @description Should default optional fields */
    it('should use default values for optional fields', async () => {
      mockSyncConfigCreate.mockResolvedValue({ id: 'sc-1' })

      await service.createSyncConfig('p1', {
        source_type: 'jira',
        connection_config: 'secret',
      }, createUser())

      expect(mockSyncConfigCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sync_schedule: null,
          filter_rules: JSON.stringify({}),
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // updateSyncConfig
  // -------------------------------------------------------------------------

  describe('updateSyncConfig', () => {
    /** @description Should re-encrypt connection_config when updated */
    it('should encrypt connection_config when updated', async () => {
      mockSyncConfigUpdate.mockResolvedValue({ id: 'sc-1' })

      await service.updateSyncConfig('sc-1', {
        connection_config: 'new-secret',
      }, createUser())

      // Verify encryption was called with the new config
      expect(mockEncrypt).toHaveBeenCalledWith('new-secret')
      expect(mockSyncConfigUpdate).toHaveBeenCalledWith(
        'sc-1',
        expect.objectContaining({
          connection_config: 'encrypted-value',
          updated_by: 'user-1',
        }),
      )
    })

    /** @description Should not encrypt when connection_config is not being updated */
    it('should skip encryption when connection_config not provided', async () => {
      mockSyncConfigUpdate.mockResolvedValue({ id: 'sc-1' })

      await service.updateSyncConfig('sc-1', { status: 'paused' }, createUser())

      // Verify encrypt was NOT called
      expect(mockEncrypt).not.toHaveBeenCalled()
      expect(mockSyncConfigUpdate).toHaveBeenCalledWith(
        'sc-1',
        expect.objectContaining({ status: 'paused', updated_by: 'user-1' }),
      )
    })

    /** @description Should stringify filter_rules when provided */
    it('should stringify filter_rules on update', async () => {
      mockSyncConfigUpdate.mockResolvedValue({ id: 'sc-1' })

      await service.updateSyncConfig('sc-1', {
        filter_rules: { exclude: ['*.tmp'] },
      }, createUser())

      expect(mockSyncConfigUpdate).toHaveBeenCalledWith(
        'sc-1',
        expect.objectContaining({
          filter_rules: JSON.stringify({ exclude: ['*.tmp'] }),
        }),
      )
    })

    /** @description Should return undefined when config not found */
    it('should return undefined for non-existent config', async () => {
      mockSyncConfigUpdate.mockResolvedValue(undefined)
      expect(await service.updateSyncConfig('missing', {}, createUser())).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // deleteSyncConfig
  // -------------------------------------------------------------------------

  describe('deleteSyncConfig', () => {
    /** @description Should delete a sync config by ID */
    it('should delete sync config', async () => {
      mockSyncConfigDelete.mockResolvedValue(undefined)

      await service.deleteSyncConfig('sc-1')

      expect(mockSyncConfigDelete).toHaveBeenCalledWith('sc-1')
    })
  })

  // -------------------------------------------------------------------------
  // testConnection
  // -------------------------------------------------------------------------

  describe('testConnection', () => {
    /** @description Should return success placeholder response */
    it('should return success response with not-yet-implemented message', async () => {
      const result = await service.testConnection({ source_type: 'github' })

      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('not yet implemented'),
      })
    })
  })
})
