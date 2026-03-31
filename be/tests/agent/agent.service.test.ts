/**
 * @fileoverview Unit tests for AgentService.
 *
 * Tests CRUD, versioning (version-as-row), duplication, export,
 * tenant isolation, and DSL immutability on published agents.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAgentModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getKnex: vi.fn(),
}))

const mockAgentTemplateModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agent: mockAgentModel,
    agentTemplate: mockAgentTemplateModel,
  },
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { agentService } from '../../src/modules/agents/services/agent.service.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * @description Build a mock agent record with sensible defaults
 */
function buildAgent(overrides: Partial<any> = {}): any {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    description: null,
    avatar: null,
    mode: 'agent',
    status: 'draft',
    dsl: { nodes: {}, edges: [] },
    dsl_version: 1,
    tenant_id: 'tenant-1',
    project_id: null,
    parent_id: null,
    version_number: 0,
    version_label: null,
    created_by: 'user-1',
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    ...overrides,
  }
}

/**
 * @description Create a chainable Knex-like builder that resolves to `result`
 */
function makeBuilder(result: unknown) {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    whereNull: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    clone: vi.fn().mockReturnThis(),
    count: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(result),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    max: vi.fn().mockReturnThis(),
    delete: vi.fn().mockResolvedValue(1),
    then: (onFulfilled: any) => Promise.resolve(result).then(onFulfilled),
  }
  return builder
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('creates an agent with default DSL and draft status', async () => {
      const created = buildAgent()
      mockAgentModel.create.mockResolvedValue(created)

      const result = await agentService.create(
        { name: 'Test Agent', mode: 'agent' },
        'tenant-1',
        'user-1',
      )

      expect(result).toBe(created)
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Agent',
          mode: 'agent',
          status: 'draft',
          dsl: {},
          dsl_version: 1,
          tenant_id: 'tenant-1',
          parent_id: null,
          version_number: 0,
          created_by: 'user-1',
        }),
      )
    })

    it('copies DSL from template when template_id is provided', async () => {
      const templateDsl = { nodes: { n1: { type: 'begin' } }, edges: [] }
      mockAgentTemplateModel.findById.mockResolvedValue({ id: 'tmpl-1', dsl: templateDsl })
      mockAgentModel.create.mockResolvedValue(buildAgent({ dsl: templateDsl }))

      await agentService.create(
        { name: 'From Template', mode: 'agent', template_id: 'tmpl-1' },
        'tenant-1',
        'user-1',
      )

      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ dsl: templateDsl }),
      )
    })

    it('creates with empty DSL when template is not found', async () => {
      mockAgentTemplateModel.findById.mockResolvedValue(undefined)
      mockAgentModel.create.mockResolvedValue(buildAgent())

      await agentService.create(
        { name: 'No Template', mode: 'agent', template_id: 'tmpl-missing' },
        'tenant-1',
        'user-1',
      )

      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ dsl: {} }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // getById
  // -----------------------------------------------------------------------

  describe('getById', () => {
    it('returns agent when found and tenant matches', async () => {
      const agent = buildAgent()
      mockAgentModel.findById.mockResolvedValue(agent)

      const result = await agentService.getById('agent-1', 'tenant-1')
      expect(result).toBe(agent)
    })

    it('throws 404 when agent not found', async () => {
      mockAgentModel.findById.mockResolvedValue(undefined)

      await expect(agentService.getById('missing', 'tenant-1')).rejects.toThrow('Agent not found')
    })

    it('throws 404 when tenant does not match', async () => {
      mockAgentModel.findById.mockResolvedValue(buildAgent({ tenant_id: 'other-tenant' }))

      await expect(agentService.getById('agent-1', 'tenant-1')).rejects.toThrow('Agent not found')
    })
  })

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns paginated results with total count', async () => {
      const agents = [buildAgent({ id: 'a1' }), buildAgent({ id: 'a2' })]

      // getKnex returns a builder that supports chained filtering
      const countBuilder = makeBuilder({ cnt: 2 })
      const dataBuilder = makeBuilder(agents)

      // Clone returns different builders for count vs data queries
      const mainBuilder: any = {
        where: vi.fn().mockReturnThis(),
        whereNull: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        clone: vi.fn()
          .mockReturnValueOnce(countBuilder)
          .mockReturnValueOnce(dataBuilder),
      }
      mockAgentModel.getKnex.mockReturnValue(mainBuilder)

      const result = await agentService.list('tenant-1', { page: 1, page_size: 20 })

      expect(result).toEqual({ data: agents, total: 2, page: 1, page_size: 20 })
    })

    it('returns empty data when no agents exist', async () => {
      const countBuilder = makeBuilder({ cnt: 0 })
      const dataBuilder = makeBuilder([])

      const mainBuilder: any = {
        where: vi.fn().mockReturnThis(),
        whereNull: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        clone: vi.fn()
          .mockReturnValueOnce(countBuilder)
          .mockReturnValueOnce(dataBuilder),
      }
      mockAgentModel.getKnex.mockReturnValue(mainBuilder)

      const result = await agentService.list('tenant-1', { page: 1, page_size: 20 })

      expect(result.data).toEqual([])
      expect(result.total).toBe(0)
    })
  })

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('updates a draft agent successfully', async () => {
      const agent = buildAgent({ status: 'draft' })
      const updated = buildAgent({ name: 'Updated' })
      mockAgentModel.findById.mockResolvedValue(agent)
      mockAgentModel.update.mockResolvedValue(updated)

      const result = await agentService.update('agent-1', { name: 'Updated' }, 'tenant-1')

      expect(result).toBe(updated)
      expect(mockAgentModel.update).toHaveBeenCalledWith('agent-1', { name: 'Updated' })
    })

    it('allows DSL update on draft agents', async () => {
      const agent = buildAgent({ status: 'draft' })
      mockAgentModel.findById.mockResolvedValue(agent)
      mockAgentModel.update.mockResolvedValue(buildAgent())

      await agentService.update('agent-1', { dsl: { nodes: {}, edges: [] } }, 'tenant-1')

      expect(mockAgentModel.update).toHaveBeenCalledWith('agent-1', { dsl: { nodes: {}, edges: [] } })
    })

    it('throws 409 when updating DSL on a published agent', async () => {
      const agent = buildAgent({ status: 'published' })
      mockAgentModel.findById.mockResolvedValue(agent)

      await expect(
        agentService.update('agent-1', { dsl: { nodes: {} } }, 'tenant-1'),
      ).rejects.toThrow('Cannot update DSL on a published agent')
    })

    it('allows non-DSL updates on published agents', async () => {
      const agent = buildAgent({ status: 'published' })
      mockAgentModel.findById.mockResolvedValue(agent)
      mockAgentModel.update.mockResolvedValue(buildAgent({ name: 'Renamed' }))

      const result = await agentService.update('agent-1', { name: 'Renamed' }, 'tenant-1')

      expect(result.name).toBe('Renamed')
    })
  })

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('deletes the agent and its version rows', async () => {
      const agent = buildAgent()
      mockAgentModel.findById.mockResolvedValue(agent)

      const deleteBuilder = makeBuilder(undefined)
      mockAgentModel.getKnex.mockReturnValue(deleteBuilder)
      mockAgentModel.delete.mockResolvedValue(undefined)

      await agentService.delete('agent-1', 'tenant-1')

      // Deletes version rows first (parent_id = id)
      expect(deleteBuilder.where).toHaveBeenCalledWith('parent_id', 'agent-1')
      expect(deleteBuilder.delete).toHaveBeenCalled()
      // Then deletes the parent agent
      expect(mockAgentModel.delete).toHaveBeenCalledWith('agent-1')
    })

    it('throws 404 when agent not found', async () => {
      mockAgentModel.findById.mockResolvedValue(undefined)

      await expect(agentService.delete('missing', 'tenant-1')).rejects.toThrow('Agent not found')
    })
  })

  // -----------------------------------------------------------------------
  // duplicate
  // -----------------------------------------------------------------------

  describe('duplicate', () => {
    it('creates a copy with "(copy)" suffix and draft status', async () => {
      const source = buildAgent({ name: 'Original', status: 'published', dsl: { nodes: {} } })
      const clone = buildAgent({ id: 'agent-2', name: 'Original (copy)', status: 'draft' })
      mockAgentModel.findById.mockResolvedValue(source)
      mockAgentModel.create.mockResolvedValue(clone)

      const result = await agentService.duplicate('agent-1', 'tenant-1', 'user-1')

      expect(result.name).toBe('Original (copy)')
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Original (copy)',
          status: 'draft',
          parent_id: null,
          version_number: 0,
        }),
      )
    })

    it('parses string DSL when duplicating', async () => {
      const dslObj = { nodes: { n1: {} }, edges: [] }
      const source = buildAgent({ dsl: JSON.stringify(dslObj) })
      mockAgentModel.findById.mockResolvedValue(source)
      mockAgentModel.create.mockResolvedValue(buildAgent())

      await agentService.duplicate('agent-1', 'tenant-1', 'user-1')

      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ dsl: dslObj }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // saveVersion (version-as-row)
  // -----------------------------------------------------------------------

  describe('saveVersion', () => {
    it('creates a version row with incremented version_number', async () => {
      const parent = buildAgent({ name: 'Agent', dsl: { nodes: {} } })
      mockAgentModel.findById.mockResolvedValue(parent)

      // Mock max version query
      const versionBuilder = makeBuilder({ max_version: 2 })
      mockAgentModel.getKnex.mockReturnValue(versionBuilder)

      const versionRow = buildAgent({ id: 'ver-1', parent_id: 'agent-1', version_number: 3 })
      mockAgentModel.create.mockResolvedValue(versionRow)

      const result = await agentService.saveVersion('agent-1', 'tenant-1', 'user-1', 'v3', 'Bug fix')

      expect(result).toBe(versionRow)
      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parent_id: 'agent-1',
          version_number: 3,
          version_label: 'v3',
          description: 'Bug fix',
        }),
      )
    })

    it('auto-generates change_summary when not provided', async () => {
      const parent = buildAgent()
      mockAgentModel.findById.mockResolvedValue(parent)

      const versionBuilder = makeBuilder({ max_version: 0 })
      mockAgentModel.getKnex.mockReturnValue(versionBuilder)
      mockAgentModel.create.mockResolvedValue(buildAgent())

      await agentService.saveVersion('agent-1', 'tenant-1', 'user-1')

      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Version 1 saved by user',
          version_number: 1,
        }),
      )
    })

    it('starts version_number at 1 when no versions exist', async () => {
      const parent = buildAgent()
      mockAgentModel.findById.mockResolvedValue(parent)

      // max_version is null when no rows exist
      const versionBuilder = makeBuilder({ max_version: null })
      mockAgentModel.getKnex.mockReturnValue(versionBuilder)
      mockAgentModel.create.mockResolvedValue(buildAgent())

      await agentService.saveVersion('agent-1', 'tenant-1', 'user-1')

      expect(mockAgentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ version_number: 1 }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // listVersions
  // -----------------------------------------------------------------------

  describe('listVersions', () => {
    it('returns version rows ordered by version_number desc', async () => {
      const parent = buildAgent()
      mockAgentModel.findById.mockResolvedValue(parent)

      const versions = [
        buildAgent({ version_number: 2 }),
        buildAgent({ version_number: 1 }),
      ]
      const builder = makeBuilder(versions)
      mockAgentModel.getKnex.mockReturnValue(builder)

      const result = await agentService.listVersions('agent-1', 'tenant-1')

      expect(result).toEqual(versions)
      expect(builder.where).toHaveBeenCalledWith('parent_id', 'agent-1')
      expect(builder.orderBy).toHaveBeenCalledWith('version_number', 'desc')
    })
  })

  // -----------------------------------------------------------------------
  // restoreVersion
  // -----------------------------------------------------------------------

  describe('restoreVersion', () => {
    it('restores a version DSL to the parent and sets status to draft', async () => {
      const parent = buildAgent({ status: 'published' })
      const version = buildAgent({
        id: 'ver-1',
        parent_id: 'agent-1',
        dsl: { nodes: { begin: {} } },
        dsl_version: 2,
      })

      mockAgentModel.findById
        .mockResolvedValueOnce(parent)   // getById call
        .mockResolvedValueOnce(version)  // findById for version

      const restored = buildAgent({ dsl: version.dsl, status: 'draft' })
      mockAgentModel.update.mockResolvedValue(restored)

      const result = await agentService.restoreVersion('agent-1', 'ver-1', 'tenant-1')

      expect(result.status).toBe('draft')
      expect(mockAgentModel.update).toHaveBeenCalledWith('agent-1', expect.objectContaining({
        dsl: version.dsl,
        status: 'draft',
      }))
    })

    it('throws 404 when version does not belong to parent', async () => {
      const parent = buildAgent()
      const version = buildAgent({ id: 'ver-1', parent_id: 'other-agent' })

      mockAgentModel.findById
        .mockResolvedValueOnce(parent)
        .mockResolvedValueOnce(version)

      await expect(
        agentService.restoreVersion('agent-1', 'ver-1', 'tenant-1'),
      ).rejects.toThrow('Version not found for this agent')
    })
  })

  // -----------------------------------------------------------------------
  // deleteVersion
  // -----------------------------------------------------------------------

  describe('deleteVersion', () => {
    it('deletes a version row', async () => {
      const version = buildAgent({ id: 'ver-1', parent_id: 'agent-1', tenant_id: 'tenant-1' })
      mockAgentModel.findById.mockResolvedValue(version)
      mockAgentModel.delete.mockResolvedValue(undefined)

      await agentService.deleteVersion('ver-1', 'tenant-1')

      expect(mockAgentModel.delete).toHaveBeenCalledWith('ver-1')
    })

    it('throws 404 when version not found', async () => {
      mockAgentModel.findById.mockResolvedValue(undefined)

      await expect(agentService.deleteVersion('missing', 'tenant-1')).rejects.toThrow('Version not found')
    })

    it('throws 400 when trying to delete a parent agent via version endpoint', async () => {
      const parent = buildAgent({ parent_id: null })
      mockAgentModel.findById.mockResolvedValue(parent)

      await expect(agentService.deleteVersion('agent-1', 'tenant-1')).rejects.toThrow(
        'Cannot delete a parent agent via version endpoint',
      )
    })

    it('throws 404 when tenant does not match', async () => {
      const version = buildAgent({ tenant_id: 'other-tenant', parent_id: 'agent-1' })
      mockAgentModel.findById.mockResolvedValue(version)

      await expect(agentService.deleteVersion('ver-1', 'tenant-1')).rejects.toThrow('Version not found')
    })
  })

  // -----------------------------------------------------------------------
  // exportJson
  // -----------------------------------------------------------------------

  describe('exportJson', () => {
    it('returns the full agent record including DSL', async () => {
      const agent = buildAgent({ dsl: { nodes: { n1: {} } } })
      mockAgentModel.findById.mockResolvedValue(agent)

      const result = await agentService.exportJson('agent-1', 'tenant-1')

      expect(result).toBe(agent)
      expect(result.dsl).toEqual({ nodes: { n1: {} } })
    })

    it('throws 404 when agent not found', async () => {
      mockAgentModel.findById.mockResolvedValue(undefined)

      await expect(agentService.exportJson('missing', 'tenant-1')).rejects.toThrow('Agent not found')
    })
  })
})
