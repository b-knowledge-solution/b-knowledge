/**
 * @fileoverview Service for project sync configuration management.
 * @module services/project-sync
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { cryptoService } from '@/shared/services/crypto.service.js'
import { ProjectSyncConfig, UserContext } from '@/shared/models/types.js'

/**
 * ProjectSyncService handles CRUD for external data source sync configs.
 */
export class ProjectSyncService {
  /**
   * List all sync configs for a project.
   * @param projectId - UUID of the project
   * @returns Array of sync config records (connection_config is NOT decrypted)
   */
  async listSyncConfigs(projectId: string): Promise<ProjectSyncConfig[]> {
    return ModelFactory.projectSyncConfig.findByProjectId(projectId)
  }

  /**
   * Get a single sync config by ID with decrypted connection_config.
   * @param configId - UUID of the sync config
   * @returns Sync config record or undefined
   */
  async getSyncConfigById(configId: string): Promise<ProjectSyncConfig | undefined> {
    return ModelFactory.projectSyncConfig.findById(configId)
  }

  /**
   * Create a new sync config with encrypted connection_config.
   * @param projectId - UUID of the project
   * @param data - Sync config creation data
   * @param user - Authenticated user context
   * @returns Created sync config
   */
  async createSyncConfig(projectId: string, data: any, user: UserContext): Promise<ProjectSyncConfig> {
    // Encrypt connection config before storage
    const encryptedConfig = cryptoService.encrypt(data.connection_config)

    return ModelFactory.projectSyncConfig.create({
      project_id: projectId,
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
   * Update a sync config. Encrypts connection_config if provided.
   * @param configId - UUID of the sync config
   * @param data - Partial update data
   * @param user - Authenticated user context
   * @returns Updated sync config or undefined
   */
  async updateSyncConfig(configId: string, data: any, user: UserContext): Promise<ProjectSyncConfig | undefined> {
    const updateData: any = { updated_by: user.id }
    // Encrypt connection config if being updated
    if (data.connection_config !== undefined) {
      updateData.connection_config = cryptoService.encrypt(data.connection_config)
    }
    if (data.sync_schedule !== undefined) updateData.sync_schedule = data.sync_schedule
    if (data.filter_rules !== undefined) updateData.filter_rules = JSON.stringify(data.filter_rules)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.projectSyncConfig.update(configId, updateData)
  }

  /**
   * Delete a sync config by ID.
   * @param configId - UUID of the sync config
   */
  async deleteSyncConfig(configId: string): Promise<void> {
    await ModelFactory.projectSyncConfig.delete(configId)
  }

  /**
   * Test a connection to an external data source.
   * Placeholder implementation - will be expanded with actual connector logic.
   * @param data - Connection config data to test
   * @returns Object with success flag and message
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
export const projectSyncService = new ProjectSyncService()
