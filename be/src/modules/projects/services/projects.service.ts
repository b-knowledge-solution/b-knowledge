/**
 * @fileoverview Core project service handling CRUD, auto-create dataset, and RBAC.
 * @module services/projects
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/services/audit.service.js'
import { teamService } from '@/modules/teams/services/team.service.js'
import { Project, ProjectPermission, ProjectDataset, UserContext } from '@/shared/models/types.js'

/**
 * ProjectsService handles core project CRUD, auto-create dataset on project creation,
 * and RBAC-based project listing.
 */
export class ProjectsService {
  /**
   * Get all projects accessible to the given user based on RBAC rules.
   * Admins see all projects. Other users see public projects and those
   * they have explicit permissions for (directly or via team).
   * @param user - Authenticated user context
   * @returns Array of accessible projects
   */
  async getAccessibleProjects(user: UserContext): Promise<Project[]> {
    // Admins see all active projects
    if (user.role === 'admin' || user.role === 'superadmin') {
      return ModelFactory.project.findActive()
    }

    // Fetch all active projects
    const allProjects = await ModelFactory.project.findActive()

    // Get user's team IDs for team-based permission checks
    const userTeams = await teamService.getUserTeams(user.id)
    const teamIds = userTeams.map((t: any) => t.id)

    // Get all permissions for this user (direct + team)
    const userPerms = await ModelFactory.projectPermission.findByGrantee('user', user.id)
    const userPermProjectIds = new Set(userPerms.map(p => p.project_id))

    // Get team permissions
    const teamPermProjectIds = new Set<string>()
    for (const teamId of teamIds) {
      const teamPerms = await ModelFactory.projectPermission.findByGrantee('team', teamId)
      teamPerms.forEach(p => teamPermProjectIds.add(p.project_id))
    }

    // Filter: show public projects, projects created by user, or those with permissions
    return allProjects.filter(p => {
      if (!p.is_private) return true
      if (p.created_by === user.id) return true
      if (userPermProjectIds.has(p.id)) return true
      if (teamPermProjectIds.has(p.id)) return true
      return false
    })
  }

  /**
   * Get a single project by ID.
   * @param id - UUID of the project
   * @returns Project record or undefined
   */
  async getProjectById(id: string): Promise<Project | undefined> {
    return ModelFactory.project.findById(id)
  }

  /**
   * Create a new project and auto-create a linked dataset.
   * @param data - Project creation data
   * @param user - Authenticated user context
   * @returns The created project
   */
  async createProject(data: any, user: UserContext): Promise<Project> {
    try {
      // Create the project record
      const project = await ModelFactory.project.create({
        name: data.name,
        description: data.description || null,
        avatar: data.avatar || null,
        ragflow_server_id: data.ragflow_server_id || null,
        default_embedding_model: data.default_embedding_model || null,
        default_chunk_method: data.default_chunk_method || null,
        default_parser_config: JSON.stringify(data.default_parser_config || {}),
        status: 'active',
        is_private: data.is_private ?? false,
        created_by: user.id,
        updated_by: user.id,
      })

      // Auto-create a dataset for this project
      const timestamp = Date.now()
      const datasetName = `${data.name}_${timestamp}`
      try {
        const dataset = await ModelFactory.dataset.create({
          name: datasetName,
          description: `Auto-created dataset for project: ${data.name}`,
          language: 'English',
          embedding_model: data.default_embedding_model || null,
          parser_id: data.default_chunk_method || 'naive',
          parser_config: JSON.stringify(data.default_parser_config || {}),
          access_control: JSON.stringify({ public: !data.is_private }),
          status: 'active',
          created_by: user.id,
          updated_by: user.id,
        })

        // Link the dataset to the project
        await ModelFactory.projectDataset.create({
          project_id: project.id,
          dataset_id: dataset.id,
          auto_created: true,
        })
      } catch (dsError) {
        // Non-blocking: project is still created even if dataset creation fails
        log.warn('Failed to auto-create dataset for project', { error: String(dsError), projectId: project.id })
      }

      // Audit log the project creation
      await auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: AuditAction.CREATE_SOURCE,
        resourceType: AuditResourceType.DATASET,
        resourceId: project.id,
        details: { name: project.name, type: 'project' },
        ipAddress: user.ip,
      })

      return project
    } catch (error) {
      log.error('Failed to create project', { error: String(error) })
      throw error
    }
  }

  /**
   * Update an existing project.
   * @param id - UUID of the project
   * @param data - Partial update data
   * @param user - Authenticated user context
   * @returns Updated project or undefined
   */
  async updateProject(id: string, data: any, user: UserContext): Promise<Project | undefined> {
    try {
      // Build update payload, only including provided fields
      const updateData: any = { updated_by: user.id }
      if (data.name !== undefined) updateData.name = data.name
      if (data.description !== undefined) updateData.description = data.description
      if (data.avatar !== undefined) updateData.avatar = data.avatar
      if (data.ragflow_server_id !== undefined) updateData.ragflow_server_id = data.ragflow_server_id
      if (data.default_embedding_model !== undefined) updateData.default_embedding_model = data.default_embedding_model
      if (data.default_chunk_method !== undefined) updateData.default_chunk_method = data.default_chunk_method
      if (data.default_parser_config !== undefined) updateData.default_parser_config = JSON.stringify(data.default_parser_config)
      if (data.status !== undefined) updateData.status = data.status
      if (data.is_private !== undefined) updateData.is_private = data.is_private

      const project = await ModelFactory.project.update(id, updateData)

      // Audit log
      if (project) {
        await auditService.log({
          userId: user.id,
          userEmail: user.email,
          action: AuditAction.UPDATE_SOURCE,
          resourceType: AuditResourceType.DATASET,
          resourceId: id,
          details: { changes: data, type: 'project' },
          ipAddress: user.ip,
        })
      }

      return project
    } catch (error) {
      log.error('Failed to update project', { error: String(error) })
      throw error
    }
  }

  /**
   * Delete a project and cascade-delete auto-created datasets.
   * @param id - UUID of the project
   * @param user - Authenticated user context
   */
  async deleteProject(id: string, user: UserContext): Promise<void> {
    try {
      // Find and delete auto-created datasets
      const autoLinks = await ModelFactory.projectDataset.findAutoCreated(id)
      for (const link of autoLinks) {
        // Soft-delete the auto-created dataset
        await ModelFactory.dataset.update(link.dataset_id, { status: 'deleted' })
      }

      // Delete the project (cascades to permissions, categories, chats, searches, etc.)
      await ModelFactory.project.delete(id)

      // Audit log
      await auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: AuditAction.DELETE_SOURCE,
        resourceType: AuditResourceType.DATASET,
        resourceId: id,
        details: { type: 'project' },
        ipAddress: user.ip,
      })
    } catch (error) {
      log.error('Failed to delete project', { error: String(error) })
      throw error
    }
  }

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------

  /**
   * Get all permissions for a project.
   * @param projectId - UUID of the project
   * @returns Array of permission records
   */
  async getPermissions(projectId: string): Promise<ProjectPermission[]> {
    return ModelFactory.projectPermission.findByProjectId(projectId)
  }

  /**
   * Set (upsert) a permission for a project.
   * @param projectId - UUID of the project
   * @param data - Permission data
   * @param user - Authenticated user context
   * @returns Created or updated permission
   */
  async setPermission(projectId: string, data: any, user: UserContext): Promise<ProjectPermission> {
    // Check if permission already exists
    const existing = await ModelFactory.projectPermission.getKnex()
      .where({
        project_id: projectId,
        grantee_type: data.grantee_type,
        grantee_id: data.grantee_id,
      })
      .first()

    if (existing) {
      // Update existing permission
      const updated = await ModelFactory.projectPermission.update(existing.id, {
        tab_documents: data.tab_documents ?? existing.tab_documents,
        tab_chat: data.tab_chat ?? existing.tab_chat,
        tab_settings: data.tab_settings ?? existing.tab_settings,
        updated_by: user.id,
      })
      return updated!
    }

    // Create new permission
    return ModelFactory.projectPermission.create({
      project_id: projectId,
      grantee_type: data.grantee_type,
      grantee_id: data.grantee_id,
      tab_documents: data.tab_documents ?? 'none',
      tab_chat: data.tab_chat ?? 'none',
      tab_settings: data.tab_settings ?? 'none',
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * Delete a permission by ID.
   * @param permId - UUID of the permission
   */
  async deletePermission(permId: string): Promise<void> {
    await ModelFactory.projectPermission.delete(permId)
  }

  // -------------------------------------------------------------------------
  // Project Datasets
  // -------------------------------------------------------------------------

  /**
   * Get all datasets linked to a project.
   * @param projectId - UUID of the project
   * @returns Array of project-dataset links
   */
  async getProjectDatasets(projectId: string): Promise<ProjectDataset[]> {
    return ModelFactory.projectDataset.findByProjectId(projectId)
  }

  /**
   * Link an existing dataset or create a new one for a project.
   * @param projectId - UUID of the project
   * @param data - Link or creation data
   * @param user - Authenticated user context
   * @returns Created project-dataset link
   */
  async linkDataset(projectId: string, data: any, user: UserContext): Promise<ProjectDataset> {
    let datasetId = data.dataset_id

    // If creating a new dataset
    if (data.create_new && data.dataset_name) {
      const dataset = await ModelFactory.dataset.create({
        name: data.dataset_name,
        description: `Dataset for project`,
        status: 'active',
        created_by: user.id,
        updated_by: user.id,
      })
      datasetId = dataset.id
    }

    // Create the link
    return ModelFactory.projectDataset.create({
      project_id: projectId,
      dataset_id: datasetId,
      auto_created: !!data.create_new,
    })
  }

  /**
   * Unlink a dataset from a project.
   * @param projectId - UUID of the project
   * @param datasetId - UUID of the dataset
   */
  async unlinkDataset(projectId: string, datasetId: string): Promise<void> {
    await ModelFactory.projectDataset.delete({
      project_id: projectId,
      dataset_id: datasetId,
    } as any)
  }

  // -------------------------------------------------------------------------
  // Entity Permissions
  // -------------------------------------------------------------------------

  /**
   * Get all entity permissions for a project.
   * @param projectId - UUID of the project
   * @returns Array of entity permission records
   */
  async getEntityPermissions(projectId: string): Promise<any[]> {
    return ModelFactory.projectEntityPermission.findByProjectId(projectId)
  }

  /**
   * Create an entity permission.
   * @param projectId - UUID of the project
   * @param data - Entity permission data
   * @param user - Authenticated user context
   * @returns Created entity permission
   */
  async createEntityPermission(projectId: string, data: any, user: UserContext): Promise<any> {
    return ModelFactory.projectEntityPermission.create({
      project_id: projectId,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      grantee_type: data.grantee_type,
      grantee_id: data.grantee_id,
      permission_level: data.permission_level ?? 'view',
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * Delete an entity permission by ID.
   * @param permId - UUID of the entity permission
   */
  async deleteEntityPermission(permId: string): Promise<void> {
    await ModelFactory.projectEntityPermission.delete(permId)
  }
}

/** Singleton instance */
export const projectsService = new ProjectsService()
