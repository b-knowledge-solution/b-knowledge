/**
 * @fileoverview Unit tests for AgentToolCredentialService.
 *
 * Tests encrypted credential CRUD, agent-specific lookup with tenant fallback,
 * and tenant-scoped access control.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCredentialModel = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  findByAgent: vi.fn(),
  findTenantDefault: vi.fn(),
  findByTenant: vi.fn(),
}))

const mockCryptoService = vi.hoisted(() => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}))

vi.mock('../../src/shared/models/factory.js', () => ({
  ModelFactory: {
    agentToolCredential: mockCredentialModel,
  },
}))

vi.mock('../../src/shared/services/crypto.service.js', () => ({
  cryptoService: mockCryptoService,
}))

vi.mock('../../src/shared/services/logger.service.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/shared/utils/uuid.js', () => {
  const { z } = require('zod')
  const re = /^[0-9a-f]{32}$/
  return {
    getUuid: vi.fn().mockReturnValue('aabbccdd11223344eeff556677889900'),
    hexId: z.string().regex(re, 'Invalid ID format (expected 32-char hex)'),
    hexIdWith: (msg: string) => z.string().regex(re, msg),
  }
})

import { agentToolCredentialService } from '../../src/modules/agents/services/agent-tool-credential.service.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentToolCredentialService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------

  describe('create', () => {
    it('encrypts credentials and creates a record', async () => {
      mockCryptoService.encrypt.mockReturnValue('encrypted-payload')
      const created = {
        id: 'aabbccdd11223344eeff556677889900',
        tenant_id: 'tenant-1',
        tool_type: 'tavily',
        name: 'My Tavily Key',
        encrypted_credentials: 'encrypted-payload',
      }
      mockCredentialModel.create.mockResolvedValue(created)

      const result = await agentToolCredentialService.create(
        'tenant-1',
        {
          tool_type: 'tavily',
          name: 'My Tavily Key',
          credentials: { api_key: 'tvly-abc123' },
        },
        'user-1',
      )

      expect(result).toBe(created)
      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(
        JSON.stringify({ api_key: 'tvly-abc123' }),
      )
      expect(mockCredentialModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'aabbccdd11223344eeff556677889900',
          tenant_id: 'tenant-1',
          tool_type: 'tavily',
          name: 'My Tavily Key',
          encrypted_credentials: 'encrypted-payload',
          created_by: 'user-1',
        }),
      )
    })

    it('sets agent_id to null when not provided', async () => {
      mockCryptoService.encrypt.mockReturnValue('enc')
      mockCredentialModel.create.mockResolvedValue({})

      await agentToolCredentialService.create(
        'tenant-1',
        { tool_type: 'github', name: 'GH', credentials: { token: 'x' } },
        'user-1',
      )

      expect(mockCredentialModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ agent_id: null }),
      )
    })

    it('sets agent_id when provided', async () => {
      mockCryptoService.encrypt.mockReturnValue('enc')
      mockCredentialModel.create.mockResolvedValue({})

      await agentToolCredentialService.create(
        'tenant-1',
        { tool_type: 'github', name: 'GH', credentials: { token: 'x' }, agent_id: 'agent-1' },
        'user-1',
      )

      expect(mockCredentialModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ agent_id: 'agent-1' }),
      )
    })
  })

  // -----------------------------------------------------------------------
  // getDecrypted
  // -----------------------------------------------------------------------

  describe('getDecrypted', () => {
    it('decrypts and returns credential JSON', async () => {
      mockCredentialModel.findById.mockResolvedValue({
        id: 'cred-1',
        tenant_id: 'tenant-1',
        encrypted_credentials: 'encrypted-data',
      })
      mockCryptoService.decrypt.mockReturnValue('{"api_key":"tvly-abc123"}')

      const result = await agentToolCredentialService.getDecrypted('cred-1', 'tenant-1')

      expect(result).toEqual({ api_key: 'tvly-abc123' })
      expect(mockCryptoService.decrypt).toHaveBeenCalledWith('encrypted-data')
    })

    it('throws when credential not found', async () => {
      mockCredentialModel.findById.mockResolvedValue(null)

      await expect(
        agentToolCredentialService.getDecrypted('missing', 'tenant-1'),
      ).rejects.toThrow('Tool credential not found')
    })

    it('throws when tenant does not match', async () => {
      mockCredentialModel.findById.mockResolvedValue({
        id: 'cred-1',
        tenant_id: 'other-tenant',
      })

      await expect(
        agentToolCredentialService.getDecrypted('cred-1', 'tenant-1'),
      ).rejects.toThrow('Tool credential not found')
    })
  })

  // -----------------------------------------------------------------------
  // getForAgent (agent-specific → tenant fallback)
  // -----------------------------------------------------------------------

  describe('getForAgent', () => {
    it('returns agent-specific credential when found', async () => {
      mockCredentialModel.findByAgent.mockResolvedValue([
        { tool_type: 'tavily', encrypted_credentials: 'agent-enc' },
      ])
      mockCryptoService.decrypt.mockReturnValue('{"api_key":"agent-key"}')

      const result = await agentToolCredentialService.getForAgent('agent-1', 'tavily', 'tenant-1')

      expect(result).toEqual({ api_key: 'agent-key' })
      expect(mockCredentialModel.findTenantDefault).not.toHaveBeenCalled()
    })

    it('falls back to tenant-level credential when no agent-specific match', async () => {
      // No agent-specific credential for this tool type
      mockCredentialModel.findByAgent.mockResolvedValue([
        { tool_type: 'github', encrypted_credentials: 'gh-enc' },
      ])
      mockCredentialModel.findTenantDefault.mockResolvedValue({
        encrypted_credentials: 'tenant-enc',
      })
      mockCryptoService.decrypt.mockReturnValue('{"api_key":"tenant-key"}')

      const result = await agentToolCredentialService.getForAgent('agent-1', 'tavily', 'tenant-1')

      expect(result).toEqual({ api_key: 'tenant-key' })
      expect(mockCredentialModel.findTenantDefault).toHaveBeenCalledWith('tenant-1', 'tavily')
    })

    it('throws when no credential found at any level', async () => {
      mockCredentialModel.findByAgent.mockResolvedValue([])
      mockCredentialModel.findTenantDefault.mockResolvedValue(null)

      await expect(
        agentToolCredentialService.getForAgent('agent-1', 'tavily', 'tenant-1'),
      ).rejects.toThrow("No credential found for tool type 'tavily'")
    })
  })

  // -----------------------------------------------------------------------
  // list
  // -----------------------------------------------------------------------

  describe('list', () => {
    it('returns all credentials for the tenant', async () => {
      const creds = [
        { id: 'c1', tool_type: 'tavily' },
        { id: 'c2', tool_type: 'github' },
      ]
      mockCredentialModel.findByTenant.mockResolvedValue(creds)

      const result = await agentToolCredentialService.list('tenant-1')

      expect(result).toBe(creds)
      expect(mockCredentialModel.findByTenant).toHaveBeenCalledWith('tenant-1')
    })
  })

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------

  describe('update', () => {
    it('updates name without re-encrypting', async () => {
      mockCredentialModel.findById.mockResolvedValue({
        id: 'cred-1',
        tenant_id: 'tenant-1',
      })
      mockCredentialModel.update.mockResolvedValue(undefined)

      await agentToolCredentialService.update('cred-1', 'tenant-1', { name: 'New Name' })

      expect(mockCredentialModel.update).toHaveBeenCalledWith('cred-1', { name: 'New Name' })
      expect(mockCryptoService.encrypt).not.toHaveBeenCalled()
    })

    it('re-encrypts when credentials are updated', async () => {
      mockCredentialModel.findById.mockResolvedValue({
        id: 'cred-1',
        tenant_id: 'tenant-1',
      })
      mockCryptoService.encrypt.mockReturnValue('re-encrypted')
      mockCredentialModel.update.mockResolvedValue(undefined)

      await agentToolCredentialService.update('cred-1', 'tenant-1', {
        credentials: { api_key: 'new-key' },
      })

      expect(mockCryptoService.encrypt).toHaveBeenCalledWith(JSON.stringify({ api_key: 'new-key' }))
      expect(mockCredentialModel.update).toHaveBeenCalledWith('cred-1', {
        encrypted_credentials: 're-encrypted',
      })
    })

    it('throws when credential not found', async () => {
      mockCredentialModel.findById.mockResolvedValue(null)

      await expect(
        agentToolCredentialService.update('missing', 'tenant-1', { name: 'X' }),
      ).rejects.toThrow('Tool credential not found')
    })

    it('throws when tenant does not match', async () => {
      mockCredentialModel.findById.mockResolvedValue({
        id: 'cred-1',
        tenant_id: 'other-tenant',
      })

      await expect(
        agentToolCredentialService.update('cred-1', 'tenant-1', { name: 'X' }),
      ).rejects.toThrow('Tool credential not found')
    })
  })

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------

  describe('delete', () => {
    it('deletes a credential owned by the tenant', async () => {
      mockCredentialModel.findById.mockResolvedValue({
        id: 'cred-1',
        tenant_id: 'tenant-1',
      })
      mockCredentialModel.delete.mockResolvedValue(undefined)

      await agentToolCredentialService.delete('cred-1', 'tenant-1')

      expect(mockCredentialModel.delete).toHaveBeenCalledWith('cred-1')
    })

    it('throws when credential not found', async () => {
      mockCredentialModel.findById.mockResolvedValue(null)

      await expect(
        agentToolCredentialService.delete('missing', 'tenant-1'),
      ).rejects.toThrow('Tool credential not found')
    })

    it('throws when tenant does not match', async () => {
      mockCredentialModel.findById.mockResolvedValue({
        id: 'cred-1',
        tenant_id: 'other-tenant',
      })

      await expect(
        agentToolCredentialService.delete('cred-1', 'tenant-1'),
      ).rejects.toThrow('Tool credential not found')
    })
  })
})
