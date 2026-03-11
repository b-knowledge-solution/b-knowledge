/**
 * @fileoverview ProjectChat model for CRUD on project_chats table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectChat } from '@/shared/models/types.js'

/**
 * ProjectChatModel provides CRUD operations for the project_chats table.
 * @extends BaseModel<ProjectChat>
 */
export class ProjectChatModel extends BaseModel<ProjectChat> {
  protected tableName = 'project_chats'
  protected knex = db

  /**
   * Find all chat configs for a given project.
   * @param projectId - UUID of the project
   * @returns Array of project chat records
   */
  async findByProjectId(projectId: string): Promise<ProjectChat[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }
}
