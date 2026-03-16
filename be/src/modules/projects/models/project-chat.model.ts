/**
 * @fileoverview ProjectChat model for CRUD on project_chats table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectChat } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the project_chats table,
 *   which stores chat assistant configurations linked to projects
 * @extends BaseModel<ProjectChat>
 */
export class ProjectChatModel extends BaseModel<ProjectChat> {
  protected tableName = 'project_chats'
  protected knex = db

  /**
   * @description Find all chat assistant configurations for a given project, ordered newest first
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectChat[]>} Array of project chat records
   */
  async findByProjectId(projectId: string): Promise<ProjectChat[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }
}
