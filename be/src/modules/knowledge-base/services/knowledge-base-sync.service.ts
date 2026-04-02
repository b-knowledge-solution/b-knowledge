/**
 * @fileoverview Service for knowledge base sync configuration management.
 * @module services/knowledge-base-sync
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { cryptoService } from '@/shared/services/crypto.service.js'
import { KnowledgeBaseSyncConfig, UserContext } from '@/shared/models/types.js'

/**
 * @description Service handling CRUD for external data source sync configurations,
 *   including encrypted connection config management
 */
export class KnowledgeBaseSyncService {
  /**
   * @description List all sync configurations for a knowledge base (connection_config remains encrypted)
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseSyncConfig[]>} Array of sync config records
   */
  async listSyncConfigs(knowledgeBaseId: string): Promise<KnowledgeBaseSyncConfig[]> {
    return ModelFactory.knowledgeBaseSyncConfig.findByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * @description Retrieve a single sync config by UUID
   * @param {string} configId - UUID of the sync config
   * @returns {Promise<KnowledgeBaseSyncConfig | undefined>} Sync config record or undefined if not found
   */
  async getSyncConfigById(configId: string): Promise<KnowledgeBaseSyncConfig | undefined> {
    return ModelFactory.knowledgeBaseSyncConfig.findById(configId)
  }

  /**
   * @description Create a new sync config, encrypting the connection_config before storage
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {any} data - Sync config creation data including source_type, connection_config
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBaseSyncConfig>} Created sync config record
   */
  async createSyncConfig(knowledgeBaseId: string, data: any, user: UserContext): Promise<KnowledgeBaseSyncConfig> {
    // Encrypt connection config before storage
    const encryptedConfig = cryptoService.encrypt(data.connection_config)

    return ModelFactory.knowledgeBaseSyncConfig.create({
      knowledge_base_id: knowledgeBaseId,
      source_type: data.source_type,
      connection_config: encryptedConfig,
      sync_schedule: data.sync_schedule || null,
      filter_rules: JSON.stringify(data.filter_rules || {}),
      status: 'active',
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * @description Update a sync config with partial data, re-encrypting connection_config if changed
   * @param {string} configId - UUID of the sync config
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBaseSyncConfig | undefined>} Updated sync config or undefined if not found
   */
  async updateSyncConfig(configId: string, data: any, user: UserContext): Promise<KnowledgeBaseSyncConfig | undefined> {
    const updateData: any = { updated_by: user.id }
    // Encrypt connection config if being updated
    if (data.connection_config !== undefined) {
      updateData.connection_config = cryptoService.encrypt(data.connection_config)
    }
    if (data.sync_schedule !== undefined) updateData.sync_schedule = data.sync_schedule
    if (data.filter_rules !== undefined) updateData.filter_rules = JSON.stringify(data.filter_rules)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.knowledgeBaseSyncConfig.update(configId, updateData)
  }

  /**
   * @description Delete a sync config by its UUID
   * @param {string} configId - UUID of the sync config
   * @returns {Promise<void>}
   */
  async deleteSyncConfig(configId: string): Promise<void> {
    await ModelFactory.knowledgeBaseSyncConfig.delete(configId)
  }

  /**
   * @description Test a connection to an external data source (placeholder implementation)
   * @param {any} data - Connection config data to test
   * @returns {Promise<{ success: boolean; message: string }>} Test result with success flag and message
   */
  async testConnection(data: any): Promise<{ success: boolean; message: string }> {
    // Placeholder: actual implementation depends on connector type
    log.info('Test connection requested', { source_type: data.source_type })
    return {
      success: true,
      message: 'Connection test is not yet implemented for this source type.',
    }
  }
}

/** Singleton instance */
export const knowledgeBaseSyncService = new KnowledgeBaseSyncService()
