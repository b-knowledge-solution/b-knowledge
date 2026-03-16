/**
 * @fileoverview ProjectDataset model for CRUD on project_datasets table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectDataset } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the project_datasets junction table,
 *   which links datasets to projects with an auto_created flag for cascade management
 * @extends BaseModel<ProjectDataset>
 */
export class ProjectDatasetModel extends BaseModel<ProjectDataset> {
  protected tableName = 'project_datasets'
  protected knex = db

  /**
   * @description Find all dataset links for a given project, ordered newest first
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectDataset[]>} Array of project-dataset link records
   */
  async findByProjectId(projectId: string): Promise<ProjectDataset[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find auto-created dataset links for a project, used during cascade deletion
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectDataset[]>} Array of auto-created project-dataset link records
   */
  async findAutoCreated(projectId: string): Promise<ProjectDataset[]> {
    return this.knex(this.tableName)
      .where({ project_id: projectId, auto_created: true })
  }
}
