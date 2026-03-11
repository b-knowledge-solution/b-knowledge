/**
 * @fileoverview ProjectSyncConfig model for CRUD on project_sync_configs table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectSyncConfig } from '@/shared/models/types.js'

/**
 * ProjectSyncConfigModel provides CRUD operations for the project_sync_configs table.
 * @extends BaseModel<ProjectSyncConfig>
 */
export class ProjectSyncConfigModel extends BaseModel<ProjectSyncConfig> {
  protected tableName = 'project_sync_configs'
  protected knex = db

  /**
   * Find all sync configs for a given project.
   * @param projectId - UUID of the project
   * @returns Array of sync config records
   */
  async findByProjectId(projectId: string): Promise<ProjectSyncConfig[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }
}
