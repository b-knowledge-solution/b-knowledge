/**
 * @fileoverview Unit tests for the Phase 6 grant-dataset resolution helper.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockModelFactory = vi.hoisted(() => ({
  resourceGrant: {
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

import { ResourceType } from '../../../src/shared/constants/resource-grants.js'
import { resolveGrantedDatasetsForUser } from '../../../src/shared/services/ability.service.js'

describe('AbilityService', () => {
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
