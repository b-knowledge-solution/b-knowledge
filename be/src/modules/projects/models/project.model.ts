/**
 * @fileoverview Project model for CRUD operations on the projects table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Project } from '@/shared/models/types.js'

/**
 * ProjectModel provides CRUD operations for the projects table.
 * @extends BaseModel<Project>
 */
export class ProjectModel extends BaseModel<Project> {
  protected tableName = 'projects'
  protected knex = db

  /**
   * Find all projects created by a specific user.
   * @param userId - UUID of the creator
   * @returns Array of projects created by the user
   */
  async findByCreator(userId: string): Promise<Project[]> {
    return this.knex(this.tableName)
      .where('created_by', userId)
      .orderBy('created_at', 'desc')
  }

  /**
   * Find all active projects.
   * @returns Array of active projects
   */
  async findActive(): Promise<Project[]> {
    return this.knex(this.tableName)
      .where('status', 'active')
      .orderBy('created_at', 'desc')
  }
}
