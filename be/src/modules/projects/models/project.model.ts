/**
 * @fileoverview Project model for CRUD operations on the projects table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Project } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the projects table,
 *   which is the top-level organizational entity for datasets, chats, and searches
 * @extends BaseModel<Project>
 */
export class ProjectModel extends BaseModel<Project> {
  protected tableName = 'projects'
  protected knex = db

  /**
   * @description Find all projects created by a specific user, ordered newest first
   * @param {string} userId - UUID of the creator
   * @returns {Promise<Project[]>} Array of projects created by the user
   */
  async findByCreator(userId: string): Promise<Project[]> {
    return this.knex(this.tableName)
      .where('created_by', userId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all projects with active status, ordered newest first
   * @returns {Promise<Project[]>} Array of active projects
   */
  async findActive(): Promise<Project[]> {
    return this.knex(this.tableName)
      .where('status', 'active')
      .orderBy('created_at', 'desc')
  }
}
