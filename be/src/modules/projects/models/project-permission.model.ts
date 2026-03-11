/**
 * @fileoverview ProjectPermission model for CRUD on project_permissions table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectPermission } from '@/shared/models/types.js'

/**
 * ProjectPermissionModel provides CRUD operations for the project_permissions table.
 * @extends BaseModel<ProjectPermission>
 */
export class ProjectPermissionModel extends BaseModel<ProjectPermission> {
  protected tableName = 'project_permissions'
  protected knex = db

  /**
   * Find all permissions for a given project.
   * @param projectId - UUID of the project
   * @returns Array of permission records
   */
  async findByProjectId(projectId: string): Promise<ProjectPermission[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }

  /**
   * Find permissions granted to a specific grantee across all projects.
   * @param granteeType - 'user' or 'team'
   * @param granteeId - UUID of the grantee
   * @returns Array of permission records
   */
  async findByGrantee(granteeType: string, granteeId: string): Promise<ProjectPermission[]> {
    return this.knex(this.tableName)
      .where({ grantee_type: granteeType, grantee_id: granteeId })
  }
}
