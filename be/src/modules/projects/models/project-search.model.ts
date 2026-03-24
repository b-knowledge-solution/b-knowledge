/**
 * @fileoverview ProjectSearch model for CRUD on project_searches table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectSearch } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the project_searches table,
 *   which stores search app configurations linked to projects
 * @extends BaseModel<ProjectSearch>
 */
export class ProjectSearchModel extends BaseModel<ProjectSearch> {
  protected tableName = 'project_searches'
  protected knex = db

  /**
   * @description Find all search app configurations for a given project, ordered newest first
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectSearch[]>} Array of project search records
   */
  async findByProjectId(projectId: string): Promise<ProjectSearch[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }
}
