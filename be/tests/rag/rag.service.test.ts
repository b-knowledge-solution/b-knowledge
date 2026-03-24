/**
 * @fileoverview Tests for RagService (dataset CRUD and document metadata).
 *
 * Covers getAvailableDatasets access control, CRUD operations,
 * and audit logging integration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDatasetModel,
  mockDocumentModel,
  mockAuditLog,
  mockGetUserTeams,
} = vi.hoisted(() => ({
  mockDatasetModel: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  mockDocumentModel: {
    findByDatasetId: vi.fn(),
    findById: vi.fn(),
  },
  mockAuditLog: vi.fn(),
  mockGetUserTeams: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    dataset: mockDatasetModel,
    document: mockDocumentModel,
  },
}))

vi.mock('../../src/modules/audit/services/audit.service.js', () => ({
  auditService: { log: mockAuditLog },
  AuditAction: { CREATE_SOURCE: 'CREATE_SOURCE', UPDATE_SOURCE: 'UPDATE_SOURCE', DELETE_SOURCE: 'DELETE_SOURCE' },
  AuditResourceType: { DATASET: 'DATASET' },
}))

vi.mock('../../src/modules/teams/services/team.service.js', () => ({
  teamService: { getUserTeams: mockGetUserTeams },
}))

// Mock knex DB to prevent real PostgreSQL connections — use a Proxy for full chain support
vi.mock('../../src/shared/db/knex.js', () => {
  function makeChain(): any {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: any) => Promise.resolve(resolve([]))
        }
        if (prop === 'catch') {
          return () => makeChain()
        }
        if (prop === 'first') {
          return () => Promise.resolve(undefined)
        }
        if (prop === 'update') {
          return () => Promise.resolve(0)
        }
        // All other chainable methods return a new chain
        return () => makeChain()
      },
    })
  }
  return { db: () => makeChain() }
})

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { RagService } from '../../src/modules/rag/services/rag.service'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RagService', () => {
  let service: RagService

  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    service = new RagService()
  })

  // -----------------------------------------------------------------------
  // getAvailableDatasets
  // -----------------------------------------------------------------------

  describe('getAvailableDatasets', () => {
    const publicDataset = { id: 'd1', name: 'Public', status: 'active', access_control: JSON.stringify({ public: true }) }
    const privateDataset = { id: 'd2', name: 'Private', status: 'active', access_control: JSON.stringify({ public: false, user_ids: ['u1'] }) }
    const teamDataset = { id: 'd3', name: 'Team', status: 'active', access_control: JSON.stringify({ public: false, team_ids: ['t1'] }) }

    it('returns only public datasets for anonymous user', async () => {
      mockDatasetModel.findAll.mockResolvedValue([publicDataset, privateDataset])

      const result = await service.getAvailableDatasets()

      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('d1')
    })

    it('returns all datasets for admin', async () => {
      mockDatasetModel.findAll.mockResolvedValue([publicDataset, privateDataset, teamDataset])

      const result = await service.getAvailableDatasets({ id: 'admin1', role: 'admin' } as any)

      expect(result).toHaveLength(3)
    })

    it('returns datasets the user has access to (user_ids match)', async () => {
      mockDatasetModel.findAll.mockResolvedValue([publicDataset, privateDataset, teamDataset])
      mockGetUserTeams.mockResolvedValue([])

      const result = await service.getAvailableDatasets({ id: 'u1', role: 'user' } as any)

      // Should include public + privateDataset (user_ids includes u1)
      expect(result.map((d: any) => d.id)).toContain('d1')
      expect(result.map((d: any) => d.id)).toContain('d2')
    })

    it('returns datasets the user has access to via team', async () => {
      mockDatasetModel.findAll.mockResolvedValue([teamDataset])
      mockGetUserTeams.mockResolvedValue([{ id: 't1' }])

      const result = await service.getAvailableDatasets({ id: 'u2', role: 'user' } as any)

      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('d3')
    })
  })

  // -----------------------------------------------------------------------
  // createDataset
  // -----------------------------------------------------------------------

  describe('createDataset', () => {
    it('creates dataset and logs audit when user provided', async () => {
      const created = { id: 'new1', name: 'Test DS' }
      mockDatasetModel.create.mockResolvedValue(created)

      const user = { id: 'u1', email: 'u@e.com', ip: '127.0.0.1' }
      const result = await service.createDataset({ name: 'Test DS' }, user)

      expect(result).toEqual(created)
      expect(mockAuditLog).toHaveBeenCalledTimes(1)
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', action: 'CREATE_SOURCE' })
      )
    })

    it('creates dataset without audit when no user', async () => {
      const created = { id: 'new2', name: 'Anon DS' }
      mockDatasetModel.create.mockResolvedValue(created)

      await service.createDataset({ name: 'Anon DS' })

      expect(mockAuditLog).not.toHaveBeenCalled()
    })

    it('throws on creation failure', async () => {
      mockDatasetModel.create.mockRejectedValue(new Error('duplicate'))

      await expect(service.createDataset({ name: 'Dup' })).rejects.toThrow('duplicate')
    })
  })

  // -----------------------------------------------------------------------
  // updateDataset
  // -----------------------------------------------------------------------

  describe('updateDataset', () => {
    it('updates dataset fields selectively', async () => {
      const updated = { id: 'd1', name: 'Updated' }
      mockDatasetModel.update.mockResolvedValue(updated)

      const result = await service.updateDataset('d1', { name: 'Updated' })

      expect(result).toEqual(updated)
      expect(mockDatasetModel.update).toHaveBeenCalledWith('d1', { name: 'Updated' })
    })

    it('logs audit when user provided', async () => {
      mockDatasetModel.update.mockResolvedValue({ id: 'd1' })

      await service.updateDataset('d1', { name: 'X' }, { id: 'u1', email: 'u@e.com', ip: '::1' })

      expect(mockAuditLog).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // deleteDataset
  // -----------------------------------------------------------------------

  describe('deleteDataset', () => {
    it('soft-deletes by setting status to deleted', async () => {
      mockDatasetModel.update.mockResolvedValue({})

      await service.deleteDataset('d1')

      expect(mockDatasetModel.update).toHaveBeenCalledWith('d1', { status: 'deleted' })
    })

    it('logs audit when user provided', async () => {
      mockDatasetModel.update.mockResolvedValue({})

      await service.deleteDataset('d1', { id: 'u1', email: 'u@e.com', ip: '::1' })

      expect(mockAuditLog).toHaveBeenCalledTimes(1)
    })
  })

  // -----------------------------------------------------------------------
  // getDocuments
  // -----------------------------------------------------------------------

  describe('getDocuments', () => {
    it('delegates to model findByDatasetId', async () => {
      const docs = [{ id: 'doc1' }]
      mockDocumentModel.findByDatasetId.mockResolvedValue(docs)

      const result = await service.getDocuments('ds1')

      expect(result).toEqual(docs)
      expect(mockDocumentModel.findByDatasetId).toHaveBeenCalledWith('ds1')
    })
  })
})
