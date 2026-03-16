/**
 * @fileoverview ProjectEntityPermission model for CRUD on project_entity_permissions table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ProjectEntityPermission } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the project_entity_permissions table,
 *   which stores fine-grained permissions on individual entities (categories, chats, searches)
 * @extends BaseModel<ProjectEntityPermission>
 */
export class ProjectEntityPermissionModel extends BaseModel<ProjectEntityPermission> {
  protected tableName = 'project_entity_permissions'
  protected knex = db

  /**
   * @description Find all entity-level permissions for a given project, ordered newest first
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectEntityPermission[]>} Array of entity permission records
   */
  async findByProjectId(projectId: string): Promise<ProjectEntityPermission[]> {
    return this.knex(this.tableName)
      .where('project_id', projectId)
      .orderBy('created_at', 'desc')
  }

  /**
   * @description Find permissions for a specific entity within a project
   * @param {string} projectId - UUID of the project
   * @param {string} entityType - Entity type ('category', 'chat', 'search')
   * @param {string} entityId - UUID of the entity
   * @returns {Promise<ProjectEntityPermission[]>} Array of entity permission records
   */
  async findByEntity(projectId: string, entityType: string, entityId: string): Promise<ProjectEntityPermission[]> {
    return this.knex(this.tableName)
      .where({ project_id: projectId, entity_type: entityType, entity_id: entityId })
  }
}
