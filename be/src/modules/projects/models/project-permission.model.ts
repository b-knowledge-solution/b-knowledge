/**
 * @fileoverview ProjectPermission model for CRUD on project_permissions table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectPermission } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the project_permissions table,
 *   which stores tab-level access grants (documents, chat, settings) for users and teams
 * @extends BaseModel<ProjectPermission>
 */
export class ProjectPermissionModel extends BaseModel<ProjectPermission> {
  protected tableName = 'project_permissions'
  protected knex = db

  /**
   * @description Find all permission entries for a given project, ordered newest first
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectPermission[]>} Array of permission records
   */
  async findByProjectId(projectId: string): Promise<ProjectPermission[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find all permissions granted to a specific grantee across all projects
   * @param {string} granteeType - 'user' or 'team'
   * @param {string} granteeId - UUID of the grantee
   * @returns {Promise<ProjectPermission[]>} Array of permission records
   */
  async findByGrantee(granteeType: string, granteeId: string): Promise<ProjectPermission[]> {
    return this.knex(this.tableName)
      .where({ grantee_type: granteeType, grantee_id: granteeId })
  }
}
