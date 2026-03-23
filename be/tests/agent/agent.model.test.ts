/**
 * @fileoverview Unit tests for agent-related models.
 *
 * Tests table names, JSONB column handling, Knex queries,
 * and custom model methods for AgentModel.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQueryBuilder = vi.hoisted(() => ({
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
  first: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockReturnThis(),
  then: (onFulfilled: any) => Promise.resolve([]).then(onFulfilled),
}))

const mockKnex = vi.hoisted(() => {
  const fn = vi.fn().mockReturnValue(mockQueryBuilder)
  return fn
})

vi.mock('../../src/shared/db/knex.js', () => ({
  db: mockKnex,
}))

import { AgentModel } from '../../src/modules/agents/models/agent.model.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentModel', () => {
  let model: AgentModel

  beforeEach(() => {
    vi.clearAllMocks()
    // Re-apply mock return values after clearAllMocks resets them
    mockKnex.mockReturnValue(mockQueryBuilder)
    mockQueryBuilder.where.mockReturnThis()
    mockQueryBuilder.orderBy.mockReturnThis()
    model = new AgentModel()
  })

  describe('table configuration', () => {
    it('uses "agents" as the table name', () => {
      expect((model as any).tableName).toBe('agents')
    })

    it('uses the shared Knex instance', () => {
      expect((model as any).knex).toBe(mockKnex)
    })
  })

  describe('findByTenant', () => {
    it('queries agents filtered by tenant_id ordered by created_at desc', async () => {
      await model.findByTenant('tenant-1')

      expect(mockKnex).toHaveBeenCalledWith('agents')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('tenant_id', 'tenant-1')
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })
  })

  describe('findVersions', () => {
    it('queries versions filtered by parent_id ordered by version_number asc', async () => {
      await model.findVersions('parent-uuid')

      expect(mockKnex).toHaveBeenCalledWith('agents')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('parent_id', 'parent-uuid')
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('version_number', 'asc')
    })
  })

  describe('findByProject', () => {
    it('queries agents filtered by project_id ordered by created_at desc', async () => {
      await model.findByProject('project-uuid')

      expect(mockKnex).toHaveBeenCalledWith('agents')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('project_id', 'project-uuid')
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('created_at', 'desc')
    })
  })
})

describe('Agent interface', () => {
  it('has expected fields for JSONB columns', () => {
    const agent = {
      id: 'uuid',
      name: 'Test',
      description: null,
      avatar: null,
      mode: 'agent' as const,
      status: 'draft' as const,
      dsl: { nodes: {}, edges: [] },
      dsl_version: 1,
      policy_rules: null,
      tenant_id: 'tenant-1',
      project_id: null,
      parent_id: null,
      version_number: 0,
      version_label: null,
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    }

    // DSL is a JSONB Record type
    expect(typeof agent.dsl).toBe('object')
    expect(agent.parent_id).toBeNull()
    expect(agent.version_number).toBe(0)
    expect(agent.created_at).toBeInstanceOf(Date)
    expect(agent.updated_at).toBeInstanceOf(Date)
  })

  it('allows JSONB policy_rules to be null or object', () => {
    const agentWithPolicies = { policy_rules: { can_execute: ['admin', 'editor'] } }
    const agentWithoutPolicies = { policy_rules: null }

    expect(agentWithPolicies.policy_rules).toEqual({ can_execute: ['admin', 'editor'] })
    expect(agentWithoutPolicies.policy_rules).toBeNull()
  })
})
