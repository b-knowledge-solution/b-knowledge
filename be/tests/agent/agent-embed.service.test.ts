/**
 * @fileoverview Unit tests for AgentEmbedService.
 *
 * Tests embed token generation, token validation, widget config retrieval,
 * token listing, and revocation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAgentModel = vi.hoisted(() => ({
  findById: vi.fn(),
}))

const mockExecutorService = vi.hoisted(() => ({
  startRun: vi.fn(),
  streamRun: vi.fn(),
}))

const mockTokenServiceInstance = vi.hoisted(() => ({
  createToken: vi.fn(),
  validateToken: vi.fn(),
  listTokens: vi.fn(),
  revokeToken: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agent: mockAgentModel,
  },
}))

vi.mock('../../src/shared/services/embed-token.service.js', () => ({
  EmbedTokenService: vi.fn().mockImplementation(() => mockTokenServiceInstance),
}))

vi.mock('../../src/modules/agents/services/agent-executor.service.js', () => ({
  agentExecutorService: mockExecutorService,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { agentEmbedService } from '../../src/modules/agents/services/agent-embed.service.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentEmbedService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // generateEmbedToken
  // -----------------------------------------------------------------------

  describe('generateEmbedToken', () => {
    it('generates a token for a valid agent', async () => {
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        name: 'My Agent',
        tenant_id: 'tenant-1',
      })
      mockTokenServiceInstance.createToken.mockResolvedValue({
        id: 'token-id-1',
        token: 'embed-token-value',
      })

      const result = await agentEmbedService.generateEmbedToken(
        'agent-1', 'tenant-1', 'user-1', 'My Token',
      )

      expect(result).toEqual({ token: 'embed-token-value', id: 'token-id-1' })
      expect(mockTokenServiceInstance.createToken).toHaveBeenCalledWith(
        'agent-1', 'My Token', 'user-1',
      )
    })

    it('uses auto-generated name when name is not provided', async () => {
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        name: 'My Agent',
        tenant_id: 'tenant-1',
      })
      mockTokenServiceInstance.createToken.mockResolvedValue({
        id: 'token-id-1',
        token: 'token-val',
      })

      await agentEmbedService.generateEmbedToken('agent-1', 'tenant-1', 'user-1')

      expect(mockTokenServiceInstance.createToken).toHaveBeenCalledWith(
        'agent-1', 'Embed token for My Agent', 'user-1',
      )
    })

    it('throws 404 when agent not found', async () => {
      mockAgentModel.findById.mockResolvedValue(null)

      await expect(
        agentEmbedService.generateEmbedToken('missing', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Agent not found')
    })

    it('throws 404 when tenant does not match', async () => {
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        tenant_id: 'other-tenant',
      })

      await expect(
        agentEmbedService.generateEmbedToken('agent-1', 'tenant-1', 'user-1'),
      ).rejects.toThrow('Agent not found')
    })
  })

  // -----------------------------------------------------------------------
  // runFromEmbed
  // -----------------------------------------------------------------------

  describe('runFromEmbed', () => {
    it('validates token, starts run, and streams output', async () => {
      mockTokenServiceInstance.validateToken.mockResolvedValue({
        agent_id: 'agent-1',
        token: 'valid-token',
      })
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        tenant_id: 'tenant-1',
      })
      mockExecutorService.startRun.mockResolvedValue('run-1')
      mockExecutorService.streamRun.mockResolvedValue(undefined)

      const res = {} as any

      await agentEmbedService.runFromEmbed('agent-1', 'Hello', 'valid-token', res)

      expect(mockExecutorService.startRun).toHaveBeenCalledWith(
        'agent-1', 'Hello', 'tenant-1', '', 'embed',
      )
      expect(mockExecutorService.streamRun).toHaveBeenCalledWith('run-1', res)
    })

    it('throws 401 when token is invalid', async () => {
      mockTokenServiceInstance.validateToken.mockResolvedValue(null)

      await expect(
        agentEmbedService.runFromEmbed('agent-1', 'Hello', 'bad-token', {} as any),
      ).rejects.toThrow('Invalid or expired embed token')
    })

    it('throws 401 when token agent_id does not match', async () => {
      mockTokenServiceInstance.validateToken.mockResolvedValue({
        agent_id: 'other-agent',
        token: 'valid-token',
      })

      await expect(
        agentEmbedService.runFromEmbed('agent-1', 'Hello', 'valid-token', {} as any),
      ).rejects.toThrow('Invalid or expired embed token')
    })
  })

  // -----------------------------------------------------------------------
  // getAgentConfig
  // -----------------------------------------------------------------------

  describe('getAgentConfig', () => {
    it('returns agent config for valid token', async () => {
      mockTokenServiceInstance.validateToken.mockResolvedValue({
        agent_id: 'agent-1',
      })
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        name: 'My Agent',
        avatar: 'https://example.com/avatar.png',
        description: 'A test agent',
      })

      const result = await agentEmbedService.getAgentConfig('agent-1', 'valid-token')

      expect(result).toEqual({
        name: 'My Agent',
        avatar: 'https://example.com/avatar.png',
        description: 'A test agent',
      })
    })

    it('returns null avatar and description when not set', async () => {
      mockTokenServiceInstance.validateToken.mockResolvedValue({
        agent_id: 'agent-1',
      })
      mockAgentModel.findById.mockResolvedValue({
        id: 'agent-1',
        name: 'My Agent',
      })

      const result = await agentEmbedService.getAgentConfig('agent-1', 'valid-token')

      expect(result.avatar).toBeNull()
      expect(result.description).toBeNull()
    })

    it('throws 401 when token is invalid', async () => {
      mockTokenServiceInstance.validateToken.mockResolvedValue(null)

      await expect(
        agentEmbedService.getAgentConfig('agent-1', 'bad-token'),
      ).rejects.toThrow('Invalid or expired embed token')
    })

    it('throws 404 when agent not found after token validation', async () => {
      mockTokenServiceInstance.validateToken.mockResolvedValue({
        agent_id: 'agent-1',
      })
      mockAgentModel.findById.mockResolvedValue(null)

      await expect(
        agentEmbedService.getAgentConfig('agent-1', 'valid-token'),
      ).rejects.toThrow('Agent not found')
    })
  })

  // -----------------------------------------------------------------------
  // listTokens
  // -----------------------------------------------------------------------

  describe('listTokens', () => {
    it('returns token list from the token service', async () => {
      const tokens = [{ id: 't1', name: 'Token 1' }]
      mockTokenServiceInstance.listTokens.mockResolvedValue(tokens)

      const result = await agentEmbedService.listTokens('agent-1')

      expect(result).toBe(tokens)
      expect(mockTokenServiceInstance.listTokens).toHaveBeenCalledWith('agent-1')
    })
  })

  // -----------------------------------------------------------------------
  // revokeToken
  // -----------------------------------------------------------------------

  describe('revokeToken', () => {
    it('delegates revocation to the token service', async () => {
      mockTokenServiceInstance.revokeToken.mockResolvedValue(undefined)

      await agentEmbedService.revokeToken('token-id-1')

      expect(mockTokenServiceInstance.revokeToken).toHaveBeenCalledWith('token-id-1')
    })
  })
})
