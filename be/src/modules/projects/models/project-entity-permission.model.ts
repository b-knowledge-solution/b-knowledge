/**
 * @fileoverview ProjectEntityPermission model for CRUD on project_entity_permissions table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectEntityPermission } from '@/shared/models/types.js'

/**
 * ProjectEntityPermissionModel provides CRUD for project_entity_permissions.
 * @extends BaseModel<ProjectEntityPermission>
 */
export class ProjectEntityPermissionModel extends BaseModel<ProjectEntityPermission> {
  protected tableName = 'project_entity_permissions'
  protected knex = db

  /**
   * Find all entity permissions for a given project.
   * @param projectId - UUID of the project
   * @returns Array of entity permission records
   */
  async findByProjectId(projectId: string): Promise<ProjectEntityPermission[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }

  /**
   * Find permissions for a specific entity within a project.
   * @param projectId - UUID of the project
   * @param entityType - Entity type ('category', 'chat', 'search')
   * @param entityId - UUID of the entity
   * @returns Array of entity permission records
   */
  async findByEntity(projectId: string, entityType: string, entityId: string): Promise<ProjectEntityPermission[]> {
    return this.knex(this.tableName)
      .where({ project_id: projectId, entity_type: entityType, entity_id: entityId })
  }
}
