/**
 * @fileoverview ProjectDataset model for CRUD on project_datasets table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectDataset } from '@/shared/models/types.js'

/**
 * ProjectDatasetModel provides CRUD operations for the project_datasets junction table.
 * @extends BaseModel<ProjectDataset>
 */
export class ProjectDatasetModel extends BaseModel<ProjectDataset> {
  protected tableName = 'project_datasets'
  protected knex = db

  /**
   * Find all dataset links for a given project.
   * @param projectId - UUID of the project
   * @returns Array of project-dataset link records
   */
  async findByProjectId(projectId: string): Promise<ProjectDataset[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }

  /**
   * Find auto-created dataset links for a project (for cascade delete).
   * @param projectId - UUID of the project
   * @returns Array of auto-created project-dataset link records
   */
  async findAutoCreated(projectId: string): Promise<ProjectDataset[]> {
    return this.knex(this.tableName)
      .where({ project_id: projectId, auto_created: true })
  }
}
