/**
 * @fileoverview ProjectSearch model for CRUD on project_searches table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectSearch } from '@/shared/models/types.js'

/**
 * ProjectSearchModel provides CRUD operations for the project_searches table.
 * @extends BaseModel<ProjectSearch>
 */
export class ProjectSearchModel extends BaseModel<ProjectSearch> {
  protected tableName = 'project_searches'
  protected knex = db

  /**
   * Find all search configs for a given project.
   * @param projectId - UUID of the project
   * @returns Array of project search records
   */
  async findByProjectId(projectId: string): Promise<ProjectSearch[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }
}
