/**
 * @fileoverview Unit tests for AgentController.
 *
 * Tests HTTP status codes, request delegation to services, error forwarding,
 * and tenant/user extraction for all agent endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from '../setup.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAgentService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  duplicate: vi.fn(),
  saveVersion: vi.fn(),
  listVersions: vi.fn(),
  restoreVersion: vi.fn(),
  deleteVersion: vi.fn(),
  exportJson: vi.fn(),
}))

const mockExecutorService = vi.hoisted(() => ({
  startRun: vi.fn(),
  streamRun: vi.fn(),
  cancelRun: vi.fn(),
}))

const mockAgentRunModel = vi.hoisted(() => ({
  findByAgent: vi.fn(),
}))

const mockAgentTemplateModel = vi.hoisted(() => ({
  findByTenant: vi.fn(),
}))

vi.mock('../../src/modules/agents/services/agent.service.js', () => ({
  agentService: mockAgentService,
}))

vi.mock('../../src/modules/agents/services/agent-executor.service.js', () => ({
  agentExecutorService: mockExecutorService,
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agentRun: mockAgentRunModel,
    agentTemplate: mockAgentTemplateModel,
  },
}))

vi.mock('../../src/shared/middleware/tenant.middleware.js', () => ({
  getTenantId: (req: any) => req._tenantId ?? 'tenant-1',
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { agentController } from '../../src/modules/agents/controllers/agent.controller.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgent(overrides: Partial<any> = {}): any {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    mode: 'agent',
    status: 'draft',
    dsl: {},
    tenant_id: 'tenant-1',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // listAgents
  // -----------------------------------------------------------------------

  describe('listAgents', () => {
    it('returns 200 with paginated list', async () => {
      const data = { data: [buildAgent()], total: 1, page: 1, page_size: 20 }
      mockAgentService.list.mockResolvedValue(data)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        query: { page: 1, page_size: 20 },
      })
      const res = createMockResponse()

      await agentController.listAgents(req, res)

      expect(res.json).toHaveBeenCalledWith(data)
    })

    it('returns 500 on service error', async () => {
      mockAgentService.list.mockRejectedValue(new Error('DB error'))

      const req = createMockRequest({ _tenantId: 'tenant-1', query: {} })
      const res = createMockResponse()

      await agentController.listAgents(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // getAgent
  // -----------------------------------------------------------------------

  describe('getAgent', () => {
    it('returns 200 with agent data', async () => {
      const agent = buildAgent()
      mockAgentService.getById.mockResolvedValue(agent)

      const req = createMockRequest({ _tenantId: 'tenant-1', params: { id: 'agent-1' } })
      const res = createMockResponse()

      await agentController.getAgent(req, res)

      expect(res.json).toHaveBeenCalledWith(agent)
    })

    it('returns 404 when agent not found', async () => {
      const err = Object.assign(new Error('Agent not found'), { statusCode: 404 })
      mockAgentService.getById.mockRejectedValue(err)

      const req = createMockRequest({ _tenantId: 'tenant-1', params: { id: 'missing' } })
      const res = createMockResponse()

      await agentController.getAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  // -----------------------------------------------------------------------
  // createAgent
  // -----------------------------------------------------------------------

  describe('createAgent', () => {
    it('returns 201 with created agent', async () => {
      const agent = buildAgent()
      mockAgentService.create.mockResolvedValue(agent)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { name: 'New Agent' },
      })
      const res = createMockResponse()

      await agentController.createAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(agent)
    })

    it('returns 500 on service error', async () => {
      mockAgentService.create.mockRejectedValue(new Error('Creation failed'))

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        user: { id: 'user-1' },
        body: { name: 'Test' },
      })
      const res = createMockResponse()

      await agentController.createAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  // -----------------------------------------------------------------------
  // updateAgent
  // -----------------------------------------------------------------------

  describe('updateAgent', () => {
    it('returns 200 with updated agent', async () => {
      const updated = buildAgent({ name: 'Updated' })
      mockAgentService.update.mockResolvedValue(updated)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        params: { id: 'agent-1' },
        body: { name: 'Updated' },
      })
      const res = createMockResponse()

      await agentController.updateAgent(req, res)

      expect(res.json).toHaveBeenCalledWith(updated)
    })

    it('forwards 409 when DSL update rejected on published agent', async () => {
      const err = Object.assign(new Error('Cannot update DSL'), { statusCode: 409 })
      mockAgentService.update.mockRejectedValue(err)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        params: { id: 'agent-1' },
        body: { dsl: {} },
      })
      const res = createMockResponse()

      await agentController.updateAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(409)
    })
  })

  // -----------------------------------------------------------------------
  // deleteAgent
  // -----------------------------------------------------------------------

  describe('deleteAgent', () => {
    it('returns 204 on successful deletion', async () => {
      mockAgentService.delete.mockResolvedValue(undefined)

      const req = createMockRequest({ _tenantId: 'tenant-1', params: { id: 'agent-1' } })
      const res = createMockResponse()

      await agentController.deleteAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
      expect(res.send).toHaveBeenCalled()
    })

    it('forwards 404 when agent not found', async () => {
      const err = Object.assign(new Error('Agent not found'), { statusCode: 404 })
      mockAgentService.delete.mockRejectedValue(err)

      const req = createMockRequest({ _tenantId: 'tenant-1', params: { id: 'missing' } })
      const res = createMockResponse()

      await agentController.deleteAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })

  // -----------------------------------------------------------------------
  // duplicateAgent
  // -----------------------------------------------------------------------

  describe('duplicateAgent', () => {
    it('returns 201 with cloned agent', async () => {
      const clone = buildAgent({ id: 'agent-2', name: 'Test Agent (copy)' })
      mockAgentService.duplicate.mockResolvedValue(clone)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        user: { id: 'user-1' },
        params: { id: 'agent-1' },
      })
      const res = createMockResponse()

      await agentController.duplicateAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(clone)
    })
  })

  // -----------------------------------------------------------------------
  // saveVersion
  // -----------------------------------------------------------------------

  describe('saveVersion', () => {
    it('returns 201 with created version row', async () => {
      const version = buildAgent({ parent_id: 'agent-1', version_number: 1 })
      mockAgentService.saveVersion.mockResolvedValue(version)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        user: { id: 'user-1' },
        params: { id: 'agent-1' },
        body: { version_label: 'v1', change_summary: 'Initial' },
      })
      const res = createMockResponse()

      await agentController.saveVersion(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(mockAgentService.saveVersion).toHaveBeenCalledWith(
        'agent-1', 'tenant-1', 'user-1', 'v1', 'Initial',
      )
    })
  })

  // -----------------------------------------------------------------------
  // listVersions
  // -----------------------------------------------------------------------

  describe('listVersions', () => {
    it('returns 200 with version array', async () => {
      const versions = [buildAgent({ version_number: 2 }), buildAgent({ version_number: 1 })]
      mockAgentService.listVersions.mockResolvedValue(versions)

      const req = createMockRequest({ _tenantId: 'tenant-1', params: { id: 'agent-1' } })
      const res = createMockResponse()

      await agentController.listVersions(req, res)

      expect(res.json).toHaveBeenCalledWith(versions)
    })
  })

  // -----------------------------------------------------------------------
  // restoreVersion
  // -----------------------------------------------------------------------

  describe('restoreVersion', () => {
    it('returns 200 with restored agent', async () => {
      const restored = buildAgent({ status: 'draft' })
      mockAgentService.restoreVersion.mockResolvedValue(restored)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        params: { id: 'agent-1', versionId: 'ver-1' },
      })
      const res = createMockResponse()

      await agentController.restoreVersion(req, res)

      expect(res.json).toHaveBeenCalledWith(restored)
    })
  })

  // -----------------------------------------------------------------------
  // deleteVersion
  // -----------------------------------------------------------------------

  describe('deleteVersion', () => {
    it('returns 204 on successful version deletion', async () => {
      mockAgentService.deleteVersion.mockResolvedValue(undefined)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        params: { id: 'agent-1', versionId: 'ver-1' },
      })
      const res = createMockResponse()

      await agentController.deleteVersion(req, res)

      expect(res.status).toHaveBeenCalledWith(204)
    })
  })

  // -----------------------------------------------------------------------
  // exportAgent
  // -----------------------------------------------------------------------

  describe('exportAgent', () => {
    it('returns JSON with Content-Disposition header', async () => {
      const agent = buildAgent({ name: 'My Agent' })
      mockAgentService.exportJson.mockResolvedValue(agent)

      const req = createMockRequest({ _tenantId: 'tenant-1', params: { id: 'agent-1' } })
      const res = createMockResponse()
      res.setHeader = vi.fn()

      await agentController.exportAgent(req, res)

      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="My_Agent.json"',
      )
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json')
      expect(res.json).toHaveBeenCalledWith(agent)
    })

    it('sanitizes special characters in filename', async () => {
      const agent = buildAgent({ name: 'Agent/With\\Special Chars!' })
      mockAgentService.exportJson.mockResolvedValue(agent)

      const req = createMockRequest({ _tenantId: 'tenant-1', params: { id: 'agent-1' } })
      const res = createMockResponse()
      res.setHeader = vi.fn()

      await agentController.exportAgent(req, res)

      // Special characters replaced with underscores
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('Agent_With_Special_Chars_'),
      )
    })
  })

  // -----------------------------------------------------------------------
  // listTemplates
  // -----------------------------------------------------------------------

  describe('listTemplates', () => {
    it('returns 200 with templates array', async () => {
      const templates = [{ id: 't1', name: 'Template 1' }]
      mockAgentTemplateModel.findByTenant.mockResolvedValue(templates)

      const req = createMockRequest({ _tenantId: 'tenant-1' })
      const res = createMockResponse()

      await agentController.listTemplates(req, res)

      expect(res.json).toHaveBeenCalledWith(templates)
    })
  })

  // -----------------------------------------------------------------------
  // runAgent
  // -----------------------------------------------------------------------

  describe('runAgent', () => {
    it('returns 201 with run_id', async () => {
      mockExecutorService.startRun.mockResolvedValue('run-uuid-1')

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        user: { id: 'user-1' },
        params: { id: 'agent-1' },
        body: { input: 'Hello' },
      })
      const res = createMockResponse()

      await agentController.runAgent(req, res)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({ run_id: 'run-uuid-1' })
    })
  })

  // -----------------------------------------------------------------------
  // cancelRun
  // -----------------------------------------------------------------------

  describe('cancelRun', () => {
    it('returns 200 with cancellation message', async () => {
      mockExecutorService.cancelRun.mockResolvedValue(undefined)

      const req = createMockRequest({
        _tenantId: 'tenant-1',
        params: { id: 'agent-1', runId: 'run-1' },
      })
      const res = createMockResponse()

      await agentController.cancelRun(req, res)

      expect(res.json).toHaveBeenCalledWith({ message: 'Run cancelled' })
    })
  })

  // -----------------------------------------------------------------------
  // listRuns
  // -----------------------------------------------------------------------

  describe('listRuns', () => {
    it('returns 200 with runs array', async () => {
      const runs = [{ id: 'run-1', status: 'completed' }]
      mockAgentRunModel.findByAgent.mockResolvedValue(runs)

      const req = createMockRequest({ params: { id: 'agent-1' } })
      const res = createMockResponse()

      await agentController.listRuns(req, res)

      expect(res.json).toHaveBeenCalledWith(runs)
    })
  })
})
