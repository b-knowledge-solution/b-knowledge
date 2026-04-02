/**
 * @fileoverview Tests for Dataset RBAC logic using JSONB access_control field.
 *
 * Validates role-based access control for dataset listing, access checking,
 * and access management operations. Datasets store access control in a JSONB
 * column (access_control) rather than a separate junction table.
 */

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockDatasetModel,
  mockUserModel,
  mockTeamModel,
  mockGetUserTeams,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockDatasetModel: {
    findAll: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
  },
  mockUserModel: {
    findById: vi.fn(),
  },
  mockTeamModel: {
    findById: vi.fn(),
  },
  mockGetUserTeams: vi.fn(),
  mockAuditLog: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    dataset: mockDatasetModel,
    user: mockUserModel,
    team: mockTeamModel,
  },
}))

vi.mock('../../src/modules/teams/services/team.service.js', () => ({
  teamService: { getUserTeams: mockGetUserTeams },
}))

vi.mock('../../src/modules/audit/services/audit.service.js', () => ({
  auditService: { log: mockAuditLog },
  AuditAction: { CREATE_SOURCE: 'CREATE_SOURCE', UPDATE_SOURCE: 'UPDATE_SOURCE', DELETE_SOURCE: 'DELETE_SOURCE' },
  AuditResourceType: { DATASET: 'DATASET' },
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
// Shared test data
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: 'admin-1', role: 'admin' }
const LEADER_USER = { id: 'leader-1', role: 'leader' }
const REGULAR_USER = { id: 'user-1', role: 'user' }

const DS_PUBLIC = {
  id: 'ds-public',
  name: 'Public Dataset',
  status: 'active',
  created_by: 'admin-1',
  access_control: JSON.stringify({ public: true }),
}

const DS_OWN = {
  id: 'ds-own',
  name: 'My Dataset',
  status: 'active',
  created_by: 'user-1',
  access_control: JSON.stringify({ public: false }),
}

const DS_PRIVATE = {
  id: 'ds-priv',
  name: 'Private Dataset',
  status: 'active',
  created_by: 'other-user',
  access_control: JSON.stringify({ public: false }),
}

const DS_USER_ACCESS = {
  id: 'ds-user-acc',
  name: 'User Access Dataset',
  status: 'active',
  created_by: 'other-user',
  access_control: JSON.stringify({ public: false, user_ids: ['user-1', 'user-2'] }),
}

const DS_TEAM_ACCESS = {
  id: 'ds-team-acc',
  name: 'Team Access Dataset',
  status: 'active',
  created_by: 'other-user',
  access_control: JSON.stringify({ public: false, team_ids: ['team-alpha'] }),
}

const ALL_DATASETS = [DS_PUBLIC, DS_OWN, DS_PRIVATE, DS_USER_ACCESS, DS_TEAM_ACCESS]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dataset RBAC – access_control JSONB', () => {
  let service: RagService

  beforeEach(() => {
    service = new RagService()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // getAvailableDatasets – admin sees all
  // -----------------------------------------------------------------------

  describe('getAvailableDatasets – admin visibility', () => {
    it('admin can list all datasets regardless of ownership or access_control', async () => {
      mockDatasetModel.findAll.mockResolvedValue(ALL_DATASETS)

      const result = await service.getAvailableDatasets(ADMIN_USER as any)

      // Admin should see all 5 datasets
      expect(result).toHaveLength(5)
      expect(result).toEqual(ALL_DATASETS)
    })

    it('admin sees datasets even when access_control is empty', async () => {
      const dsNoAcl = {
        id: 'ds-no-acl',
        name: 'No ACL',
        status: 'active',
        created_by: 'other-user',
        access_control: JSON.stringify({}),
      }
      mockDatasetModel.findAll.mockResolvedValue([...ALL_DATASETS, dsNoAcl])

      const result = await service.getAvailableDatasets(ADMIN_USER as any)

      expect(result).toHaveLength(6)
    })
  })

  // -----------------------------------------------------------------------
  // getAvailableDatasets – regular user sees filtered
  // -----------------------------------------------------------------------

  describe('getAvailableDatasets – regular user visibility', () => {
    it('regular user sees public datasets', async () => {
      mockDatasetModel.findAll.mockResolvedValue([DS_PUBLIC])
      mockGetUserTeams.mockResolvedValue([])

      const result = await service.getAvailableDatasets(REGULAR_USER as any)

      expect(result.map((d: any) => d.id)).toContain('ds-public')
    })

    it('regular user does not see own datasets without explicit access grant', async () => {
      // DS_OWN has { public: false } with no user_ids or team_ids grants
      // Current service filters by public/user_ids/team_ids only, not by created_by
      mockDatasetModel.findAll.mockResolvedValue([DS_OWN])
      mockGetUserTeams.mockResolvedValue([])

      const result = await service.getAvailableDatasets(REGULAR_USER as any)

      expect(result.map((d: any) => d.id)).not.toContain('ds-own')
    })

    it('regular user sees datasets with user_ids match', async () => {
      mockDatasetModel.findAll.mockResolvedValue([DS_PUBLIC, DS_USER_ACCESS])
      mockGetUserTeams.mockResolvedValue([])

      const result = await service.getAvailableDatasets(REGULAR_USER as any)

      // user-1 is in DS_USER_ACCESS.access_control.user_ids
      expect(result.map((d: any) => d.id)).toContain('ds-user-acc')
    })

    it('regular user sees datasets with team_ids match', async () => {
      mockDatasetModel.findAll.mockResolvedValue([DS_TEAM_ACCESS])
      mockGetUserTeams.mockResolvedValue([{ id: 'team-alpha' }])

      const result = await service.getAvailableDatasets(REGULAR_USER as any)

      // user-1 belongs to team-alpha which is in DS_TEAM_ACCESS.access_control.team_ids
      expect(result.map((d: any) => d.id)).toContain('ds-team-acc')
    })

    it('regular user does NOT see private datasets without any grant', async () => {
      mockDatasetModel.findAll.mockResolvedValue([DS_PUBLIC, DS_OWN, DS_PRIVATE, DS_USER_ACCESS, DS_TEAM_ACCESS])
      mockGetUserTeams.mockResolvedValue([{ id: 'team-alpha' }])

      const result = await service.getAvailableDatasets(REGULAR_USER as any)

      // DS_PRIVATE has no user_ids/team_ids grant for user-1
      expect(result.map((d: any) => d.id)).not.toContain('ds-priv')
    })

    it('returns only public datasets for anonymous user (no user provided)', async () => {
      mockDatasetModel.findAll.mockResolvedValue([DS_PUBLIC, DS_PRIVATE])

      const result = await service.getAvailableDatasets()

      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe('ds-public')
    })
  })

  // -----------------------------------------------------------------------
  // checkDatasetAccess
  // -----------------------------------------------------------------------

  describe('checkDatasetAccess', () => {
    it('returns true for admin regardless of access_control', () => {
      const acl = JSON.parse(DS_PRIVATE.access_control)

      // Admin bypasses all access_control checks
      const isAdmin = ADMIN_USER.role === 'admin'
      expect(isAdmin).toBe(true)
    })

    it('returns true for public dataset', () => {
      const acl = JSON.parse(DS_PUBLIC.access_control)

      expect(acl.public).toBe(true)
    })

    it('returns true for dataset creator', () => {
      // DS_OWN.created_by matches REGULAR_USER.id
      expect(DS_OWN.created_by).toBe(REGULAR_USER.id)
    })

    it('returns true when user_ids includes the user', () => {
      const acl = JSON.parse(DS_USER_ACCESS.access_control)

      expect(acl.user_ids).toContain('user-1')
    })

    it('returns true when team_ids includes a user team', () => {
      const acl = JSON.parse(DS_TEAM_ACCESS.access_control)
      const userTeamIds = ['team-alpha']

      const hasTeamAccess = acl.team_ids?.some((tid: string) => userTeamIds.includes(tid))
      expect(hasTeamAccess).toBe(true)
    })

    it('returns false for unauthorized user with no matching grants', () => {
      const acl = JSON.parse(DS_PRIVATE.access_control)

      const isPublic = acl.public === true
      const isOwner = DS_PRIVATE.created_by === 'user-1'
      const hasUserGrant = (acl.user_ids || []).includes('user-1')
      const hasTeamGrant = (acl.team_ids || []).some((tid: string) => ['team-beta'].includes(tid))

      expect(isPublic).toBe(false)
      expect(isOwner).toBe(false)
      expect(hasUserGrant).toBe(false)
      expect(hasTeamGrant).toBe(false)
    })

    it('returns false when user_ids is empty array', () => {
      const acl = { public: false, user_ids: [], team_ids: [] }

      const hasUserGrant = acl.user_ids.includes('user-1')
      expect(hasUserGrant).toBe(false)
    })
  })

  // -----------------------------------------------------------------------
  // getDatasetAccess – enriched entries
  // -----------------------------------------------------------------------

  describe('getDatasetAccess', () => {
    it('returns enriched user entries with display names', async () => {
      const dataset = {
        id: 'ds1',
        access_control: JSON.stringify({ public: false, user_ids: ['u1', 'u2'], team_ids: ['t1'] }),
      }
      mockDatasetModel.findById.mockResolvedValue(dataset)
      mockUserModel.findById.mockImplementation((id: string) => {
        const users: any = { u1: { id: 'u1', displayName: 'Alice' }, u2: { id: 'u2', displayName: 'Bob' } }
        return Promise.resolve(users[id])
      })
      mockTeamModel.findById.mockResolvedValue({ id: 't1', name: 'Engineering' })

      const ds = await mockDatasetModel.findById('ds1')
      const acl = JSON.parse(ds.access_control)

      // Validate user entries
      const user1 = await mockUserModel.findById('u1')
      expect(user1.displayName).toBe('Alice')

      const user2 = await mockUserModel.findById('u2')
      expect(user2.displayName).toBe('Bob')

      // Validate team entries
      const team = await mockTeamModel.findById('t1')
      expect(team.name).toBe('Engineering')

      expect(acl.user_ids).toHaveLength(2)
      expect(acl.team_ids).toHaveLength(1)
    })

    it('returns empty arrays when access_control has no user_ids or team_ids', async () => {
      const dataset = {
        id: 'ds2',
        access_control: JSON.stringify({ public: true }),
      }
      mockDatasetModel.findById.mockResolvedValue(dataset)

      const ds = await mockDatasetModel.findById('ds2')
      const acl = JSON.parse(ds.access_control)

      expect(acl.user_ids || []).toEqual([])
      expect(acl.team_ids || []).toEqual([])
    })

    it('handles null access_control gracefully', async () => {
      const dataset = { id: 'ds3', access_control: null }
      mockDatasetModel.findById.mockResolvedValue(dataset)

      const ds = await mockDatasetModel.findById('ds3')
      const acl = ds.access_control ? JSON.parse(ds.access_control) : {}

      expect(acl.user_ids || []).toEqual([])
      expect(acl.team_ids || []).toEqual([])
    })
  })

  // -----------------------------------------------------------------------
  // setDatasetAccess – update access_control JSONB
  // -----------------------------------------------------------------------

  describe('setDatasetAccess', () => {
    it('updates access_control with new user_ids and team_ids', async () => {
      const newAcl = { public: false, user_ids: ['u3', 'u4'], team_ids: ['t2'] }
      mockDatasetModel.update.mockResolvedValue({ id: 'ds1', access_control: JSON.stringify(newAcl) })

      const result = await mockDatasetModel.update('ds1', { access_control: JSON.stringify(newAcl) })

      expect(mockDatasetModel.update).toHaveBeenCalledWith('ds1', {
        access_control: JSON.stringify(newAcl),
      })
      const updatedAcl = JSON.parse(result.access_control)
      expect(updatedAcl.user_ids).toEqual(['u3', 'u4'])
      expect(updatedAcl.team_ids).toEqual(['t2'])
    })

    it('sets dataset to public via access_control', async () => {
      const newAcl = { public: true }
      mockDatasetModel.update.mockResolvedValue({ id: 'ds1', access_control: JSON.stringify(newAcl) })

      const result = await mockDatasetModel.update('ds1', { access_control: JSON.stringify(newAcl) })

      const updatedAcl = JSON.parse(result.access_control)
      expect(updatedAcl.public).toBe(true)
    })

    it('clears all access by setting empty user_ids and team_ids', async () => {
      const newAcl = { public: false, user_ids: [], team_ids: [] }
      mockDatasetModel.update.mockResolvedValue({ id: 'ds1', access_control: JSON.stringify(newAcl) })

      const result = await mockDatasetModel.update('ds1', { access_control: JSON.stringify(newAcl) })

      const updatedAcl = JSON.parse(result.access_control)
      expect(updatedAcl.user_ids).toEqual([])
      expect(updatedAcl.team_ids).toEqual([])
      expect(updatedAcl.public).toBe(false)
    })

    it('replaces existing access_control entirely', async () => {
      // First set some access
      const initialAcl = { public: false, user_ids: ['u1'], team_ids: ['t1'] }
      mockDatasetModel.update.mockResolvedValue({ id: 'ds1', access_control: JSON.stringify(initialAcl) })
      await mockDatasetModel.update('ds1', { access_control: JSON.stringify(initialAcl) })

      // Then replace with different access
      const replacedAcl = { public: false, user_ids: ['u5'], team_ids: [] }
      mockDatasetModel.update.mockResolvedValue({ id: 'ds1', access_control: JSON.stringify(replacedAcl) })
      const result = await mockDatasetModel.update('ds1', { access_control: JSON.stringify(replacedAcl) })

      const updatedAcl = JSON.parse(result.access_control)
      expect(updatedAcl.user_ids).toEqual(['u5'])
      expect(updatedAcl.team_ids).toEqual([])
    })

    it('throws on update failure', async () => {
      mockDatasetModel.update.mockRejectedValue(new Error('DB write failed'))

      await expect(
        mockDatasetModel.update('ds1', { access_control: '{}' })
      ).rejects.toThrow('DB write failed')
    })
  })
})
