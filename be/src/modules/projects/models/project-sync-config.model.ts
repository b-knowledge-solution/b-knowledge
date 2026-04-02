/**
 * @fileoverview ProjectSyncConfig model for CRUD on project_sync_configs table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectSyncConfig } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the project_sync_configs table,
 *   which stores external data source sync configurations linked to projects
 * @extends BaseModel<ProjectSyncConfig>
 */
export class ProjectSyncConfigModel extends BaseModel<ProjectSyncConfig> {
  protected tableName = 'project_sync_configs'
  protected knex = db

  /**
   * @description Find all sync configurations for a given project, ordered newest first
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectSyncConfig[]>} Array of sync config records
   */
  async findByProjectId(projectId: string): Promise<ProjectSyncConfig[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }
}
