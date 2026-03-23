/**
 * @fileoverview Encrypted tool credential management service.
 *
 * Handles CRUD for external tool credentials (API keys, tokens, etc.).
 * Credentials are encrypted at rest via the shared CryptoService and
 * decrypted only when needed for tool execution.
 *
 * @module modules/agents/services/agent-tool-credential
 */
import { cryptoService } from '@/shared/services/crypto.service.js'
import { getUuid } from '@/shared/utils/uuid.js'
import { ModelFactory } from '@/shared/models/factory.js'
import type { AgentToolCredential } from '../models/agent-tool-credential.model.js'
import { logger } from '@/shared/services/logger.service.js'

/** @description Input data for creating a new tool credential */
export interface CreateCredentialData {
  /** Tool identifier (e.g., 'tavily', 'github') */
  tool_type: string
  /** Human-readable credential name */
  name: string
  /** Plaintext credentials to encrypt (e.g., { api_key: '...' }) */
  credentials: Record<string, string>
  /** Optional agent ID for agent-specific override; null for tenant default */
  agent_id?: string
}

/** @description Input data for updating an existing tool credential */
export interface UpdateCredentialData {
  /** Updated credential name */
  name?: string
  /** New plaintext credentials to re-encrypt */
  credentials?: Record<string, string>
}

/**
 * @description Singleton service for tool credential CRUD with encryption at rest.
 *   Credentials are encrypted before storage and decrypted only during tool execution.
 */
class AgentToolCredentialService {
  /**
   * @description Create a new tool credential, encrypting the credential payload.
   * @param {string} tenantId - Multi-tenant isolation identifier
   * @param {CreateCredentialData} data - Tool type, name, plaintext credentials
   * @param {string} userId - UUID of the creating user
   * @returns {Promise<AgentToolCredential>} Created credential record (encrypted)
   */
  async create(tenantId: string, data: CreateCredentialData, userId: string): Promise<AgentToolCredential> {
    // Encrypt the plaintext credentials JSON before storage
    const encrypted = cryptoService.encrypt(JSON.stringify(data.credentials))

    const record = {
      id: getUuid(),
      tenant_id: tenantId,
      agent_id: data.agent_id ?? null,
      tool_type: data.tool_type,
      name: data.name,
      encrypted_credentials: encrypted,
      created_by: userId,
    }

    const created = await ModelFactory.agentToolCredential.create(record)
    logger.info(`Tool credential created: id=${created.id}, tool=${data.tool_type}, tenant=${tenantId}`)
    return created
  }

  /**
   * @description Fetch and decrypt a credential by ID. Never returns the raw encrypted value.
   * @param {string} id - Credential UUID
   * @param {string} tenantId - Tenant scope for access control
   * @returns {Promise<Record<string, string>>} Decrypted credentials map
   * @throws {Error} If credential not found or tenant mismatch
   */
  async getDecrypted(id: string, tenantId: string): Promise<Record<string, string>> {
    const record = await ModelFactory.agentToolCredential.findById(id)

    // Verify the credential exists and belongs to the requesting tenant
    if (!record || record.tenant_id !== tenantId) {
      throw new Error('Tool credential not found')
    }

    // Decrypt the stored payload back to plaintext JSON
    const decrypted = cryptoService.decrypt(record.encrypted_credentials)
    return JSON.parse(decrypted) as Record<string, string>
  }

  /**
   * @description Find credentials for a specific agent and tool type.
   *   Checks agent-specific override first, falls back to tenant-level default.
   * @param {string} agentId - UUID of the agent
   * @param {string} toolType - Tool identifier (e.g., 'tavily')
   * @param {string} tenantId - Tenant scope
   * @returns {Promise<Record<string, string>>} Decrypted credentials map
   * @throws {Error} If no credential found for the tool type
   */
  async getForAgent(agentId: string, toolType: string, tenantId: string): Promise<Record<string, string>> {
    // Check for agent-specific credential first
    const agentCreds = await ModelFactory.agentToolCredential.findByAgent(agentId)
    const agentMatch = agentCreds.find((c) => c.tool_type === toolType)

    if (agentMatch) {
      const decrypted = cryptoService.decrypt(agentMatch.encrypted_credentials)
      return JSON.parse(decrypted) as Record<string, string>
    }

    // Fall back to tenant-level default credential
    const tenantDefault = await ModelFactory.agentToolCredential.findTenantDefault(tenantId, toolType)
    if (!tenantDefault) {
      throw new Error(`No credential found for tool type '${toolType}'`)
    }

    const decrypted = cryptoService.decrypt(tenantDefault.encrypted_credentials)
    return JSON.parse(decrypted) as Record<string, string>
  }

  /**
   * @description List all credentials for a tenant (without decrypted values).
   *   Returns credential metadata only — encrypted_credentials field is omitted.
   * @param {string} tenantId - Tenant scope
   * @returns {Promise<AgentToolCredential[]>} Array of credential records
   */
  async list(tenantId: string): Promise<AgentToolCredential[]> {
    return ModelFactory.agentToolCredential.findByTenant(tenantId)
  }

  /**
   * @description Update an existing credential. Re-encrypts if credentials are changed.
   * @param {string} id - Credential UUID
   * @param {string} tenantId - Tenant scope for access control
   * @param {UpdateCredentialData} data - Fields to update
   * @throws {Error} If credential not found or tenant mismatch
   */
  async update(id: string, tenantId: string, data: UpdateCredentialData): Promise<void> {
    const record = await ModelFactory.agentToolCredential.findById(id)

    // Verify ownership before allowing update
    if (!record || record.tenant_id !== tenantId) {
      throw new Error('Tool credential not found')
    }

    const updates: Partial<AgentToolCredential> = {}

    // Update name if provided
    if (data.name !== undefined) {
      updates.name = data.name
    }

    // Re-encrypt credentials if new values provided
    if (data.credentials !== undefined) {
      updates.encrypted_credentials = cryptoService.encrypt(JSON.stringify(data.credentials))
    }

    await ModelFactory.agentToolCredential.update(id, updates)
    logger.info(`Tool credential updated: id=${id}`)
  }

  /**
   * @description Delete a credential by ID within the tenant scope.
   * @param {string} id - Credential UUID
   * @param {string} tenantId - Tenant scope for access control
   * @throws {Error} If credential not found or tenant mismatch
   */
  async delete(id: string, tenantId: string): Promise<void> {
    const record = await ModelFactory.agentToolCredential.findById(id)

    // Verify ownership before allowing deletion
    if (!record || record.tenant_id !== tenantId) {
      throw new Error('Tool credential not found')
    }

    await ModelFactory.agentToolCredential.delete(id)
    logger.info(`Tool credential deleted: id=${id}`)
  }
}

/** @description Singleton tool credential service instance */
export const agentToolCredentialService = new AgentToolCredentialService()
