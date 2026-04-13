/**
 * @fileoverview Unit tests for the Phase 6 grant-dataset resolution helper.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subject as asSubject } from '@casl/ability'

const mockModelFactory = vi.hoisted(() => ({
  rolePermission: {
    findByRoleWithSubjects: vi.fn(),
  },
  resourceGrant: {
    findActiveForUser: vi.fn(),
  },
  userPermissionOverride: {
    findActiveForUser: vi.fn(),
  },
  documentCategory: {
    findDatasetIdsByKnowledgeBaseIds: vi.fn(),
    findDatasetIdsByCategoryIds: vi.fn(),
  },
}))

const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../../src/shared/models/factory.js', () => ({
  ModelFactory: mockModelFactory,
}))

vi.mock('../../../src/shared/services/logger.service.js', () => ({
  log: mockLog,
}))

vi.mock('../../../src/shared/permissions/index.js', () => ({
  getAllPermissions: () => [
    { key: 'users.create', action: 'create', subject: 'User' },
    { key: 'knowledge_base.view', action: 'read', subject: 'KnowledgeBase' },
    { key: 'knowledge_base.delete', action: 'delete', subject: 'KnowledgeBase' },
  ],
}))

import { ResourceType } from '../../../src/shared/constants/resource-grants.js'
import { UserRole } from '../../../src/shared/constants/index.js'
import {
  __forTesting,
  resolveGrantedDatasetsForUser,
} from '../../../src/shared/services/ability.service.js'

describe('AbilityService', () => {
  describe('buildAbilityForV2', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockModelFactory.rolePermission.findByRoleWithSubjects.mockResolvedValue([])
      mockModelFactory.resourceGrant.findActiveForUser.mockResolvedValue([])
      mockModelFactory.userPermissionOverride.findActiveForUser.mockResolvedValue([])
    })

    it('expired grant rows filtered out by findActiveForUser do not produce CASL rules on the next rebuild', async () => {
      const ability = await __forTesting.buildAbilityForV2({
        id: 'user-expired-grant',
        role: UserRole.USER,
        current_org_id: 'tenant-1',
        is_superuser: false,
      })

      expect(mockModelFactory.resourceGrant.findActiveForUser).toHaveBeenCalledWith(
        'user-expired-grant',
        'tenant-1',
        [],
      )
      expect(
        ability.can(
          'read',
          asSubject('KnowledgeBase', {
            tenant_id: 'tenant-1',
            id: 'kb-expired',
          }) as any,
        ),
      ).toBe(false)
    })

    it('expired override rows filtered out by findActiveForUser do not produce allow or deny rules on the next rebuild', async () => {
      mockModelFactory.rolePermission.findByRoleWithSubjects.mockResolvedValue([
        { action: 'create', subject: 'User' },
        { action: 'delete', subject: 'KnowledgeBase' },
      ])

      const ability = await __forTesting.buildAbilityForV2({
        id: 'admin-expired-override',
        role: UserRole.ADMIN,
        current_org_id: 'tenant-1',
        is_superuser: false,
      })

      expect(mockModelFactory.userPermissionOverride.findActiveForUser).toHaveBeenCalledWith(
        'admin-expired-override',
        'tenant-1',
      )
      // The expired deny row is absent from the active read path, so the
      // role grant remains intact on the next rebuild.
      expect(
        ability.can(
          'delete',
          asSubject('KnowledgeBase', {
            tenant_id: 'tenant-1',
            id: 'kb-live',
          }) as any,
        ),
      ).toBe(true)
      // The expired allow row is absent too, so no synthetic User create rule appears.
      expect(
        ability.can(
          'create',
          asSubject('User', {
            tenant_id: 'tenant-1',
          }) as any,
        ),
      ).toBe(true)
    })

    it('future-dated active grant and override rows still produce the expected rules', async () => {
      mockModelFactory.resourceGrant.findActiveForUser.mockResolvedValue([
        {
          resource_type: ResourceType.KNOWLEDGE_BASE,
          resource_id: 'kb-future',
          actions: ['read'],
        },
      ])
      mockModelFactory.userPermissionOverride.findActiveForUser.mockResolvedValue([
        {
          permission_key: 'users.create',
          effect: 'allow',
        },
      ])

      const ability = await __forTesting.buildAbilityForV2({
        id: 'user-live-expiry',
        role: UserRole.USER,
        current_org_id: 'tenant-1',
        is_superuser: false,
      })

      expect(
        ability.can(
          'read',
          asSubject('KnowledgeBase', {
            tenant_id: 'tenant-1',
            id: 'kb-future',
          }) as any,
        ),
      ).toBe(true)
      expect(
        ability.can(
          'create',
          asSubject('User', {
            tenant_id: 'tenant-1',
          }) as any,
        ),
      ).toBe(true)
    })
  })

  describe('resolveGrantedDatasetsForUser', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('returns [] when user has zero active grants (D-06 parity)', async () => {
      mockModelFactory.resourceGrant.findActiveForUser.mockResolvedValue([])

      const result = await resolveGrantedDatasetsForUser('u1', 't1')

      expect(result).toEqual([])
      expect(mockModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds).not.toHaveBeenCalled()
      expect(mockModelFactory.documentCategory.findDatasetIdsByCategoryIds).not.toHaveBeenCalled()
    })

    it('returns KB grant datasets when only KB grants exist', async () => {
      mockModelFactory.resourceGrant.findActiveForUser.mockResolvedValue([
        { resource_type: ResourceType.KNOWLEDGE_BASE, resource_id: 'kb-1' },
      ])
      mockModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds.mockResolvedValue([
        'ds-a',
        'ds-b',
      ])
      mockModelFactory.documentCategory.findDatasetIdsByCategoryIds.mockResolvedValue([])

      const result = await resolveGrantedDatasetsForUser('u1', 't1')

      expect(result.sort()).toEqual(['ds-a', 'ds-b'])
      expect(mockModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds).toHaveBeenCalledWith([
        'kb-1',
      ])
      expect(mockModelFactory.documentCategory.findDatasetIdsByCategoryIds).toHaveBeenCalledWith([])
    })

    it('returns category grant datasets when only category grants exist', async () => {
      mockModelFactory.resourceGrant.findActiveForUser.mockResolvedValue([
        { resource_type: ResourceType.DOCUMENT_CATEGORY, resource_id: 'cat-1' },
      ])
      mockModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds.mockResolvedValue([])
      mockModelFactory.documentCategory.findDatasetIdsByCategoryIds.mockResolvedValue(['ds-x'])

      const result = await resolveGrantedDatasetsForUser('u1', 't1')

      expect(result).toEqual(['ds-x'])
      expect(mockModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds).toHaveBeenCalledWith([])
      expect(mockModelFactory.documentCategory.findDatasetIdsByCategoryIds).toHaveBeenCalledWith([
        'cat-1',
      ])
    })

    it('unions and dedupes mixed KB + category grants', async () => {
      mockModelFactory.resourceGrant.findActiveForUser.mockResolvedValue([
        { resource_type: ResourceType.KNOWLEDGE_BASE, resource_id: 'kb-1' },
        { resource_type: ResourceType.DOCUMENT_CATEGORY, resource_id: 'cat-1' },
      ])
      mockModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds.mockResolvedValue([
        'ds-a',
        'ds-b',
      ])
      mockModelFactory.documentCategory.findDatasetIdsByCategoryIds.mockResolvedValue([
        'ds-b',
        'ds-c',
      ])

      const result = await resolveGrantedDatasetsForUser('u1', 't1')

      expect(result.sort()).toEqual(['ds-a', 'ds-b', 'ds-c'])
    })

    it('truncates and warns when grant fan-out exceeds GRANT_DATASET_SOFT_CAP (R-D)', async () => {
      const huge = Array.from({ length: 10500 }, (_, index) => `ds-${index}`)
      mockModelFactory.resourceGrant.findActiveForUser.mockResolvedValue([
        { resource_type: ResourceType.KNOWLEDGE_BASE, resource_id: 'kb-1' },
      ])
      mockModelFactory.documentCategory.findDatasetIdsByKnowledgeBaseIds.mockResolvedValue(huge)
      mockModelFactory.documentCategory.findDatasetIdsByCategoryIds.mockResolvedValue([])

      const result = await resolveGrantedDatasetsForUser('u1', 't1')

      expect(result).toHaveLength(10000)
      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining('truncated'),
        expect.objectContaining({ total: 10500, cap: 10000 }),
      )
    })

    it('documents that buildOpenSearchAbacFilters is deleted (A-2c)', () => {
      const source = readFileSync(
        resolve(import.meta.dirname, '../../../src/shared/services/ability.service.ts'),
        'utf-8',
      )

      expect(source).not.toContain('buildOpenSearchAbacFilters')
    })
  })
})
