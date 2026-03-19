/**
 * @fileoverview Core project service handling CRUD, auto-create dataset, and RBAC.
 * @module services/projects
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { db } from '@/shared/db/knex.js'
import { log } from '@/shared/services/logger.service.js'
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/services/audit.service.js'
import { teamService } from '@/modules/teams/services/team.service.js'
import { Project, ProjectPermission, ProjectDataset, UserContext } from '@/shared/models/types.js'

/**
 * @description Core project service handling CRUD operations, auto-dataset creation on project setup,
 *   RBAC-based project listing, permission management, and entity-level access control
 */
export class ProjectsService {
  /**
   * @description Get all projects accessible to the given user based on RBAC rules and tenant isolation.
   *   Admins see all projects within the tenant. Other users see public projects and those
   *   they have explicit permissions for (directly or via team membership).
   * @param {UserContext} user - Authenticated user context
   * @param {string} tenantId - Tenant ID for org-scoped filtering (required for multi-tenant isolation)
   * @returns {Promise<Project[]>} Array of accessible projects
   */
  async getAccessibleProjects(user: UserContext, tenantId: string): Promise<Project[]> {
    // Admins see all active projects within the tenant scope
    if (user.role === 'admin' || user.role === 'superadmin') {
      return ModelFactory.project.findByTenant(tenantId)
    }

    // Fetch all active projects scoped to this tenant
    const allProjects = await ModelFactory.project.findByTenant(tenantId)

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
   * @description Retrieve a single project by its UUID
   * @param {string} id - UUID of the project
   * @returns {Promise<Project | undefined>} Project record or undefined if not found
   */
  async getProjectById(id: string): Promise<Project | undefined> {
    return ModelFactory.project.findById(id)
  }

  /**
   * @description Create a new project and auto-create a linked dataset for document ingestion
   * @param {any} data - Project creation data including name, embedding model defaults
   * @param {UserContext} user - Authenticated user context
   * @param {string} [tenantId] - Tenant ID for org-scoped audit logging
   * @returns {Promise<Project>} The created project
   * @throws {Error} If project creation fails
   */
  async createProject(data: any, user: UserContext, tenantId?: string): Promise<Project> {
    try {
      // Create the project record
      const project = await ModelFactory.project.create({
        name: data.name,
        description: data.description || null,
        avatar: data.avatar || null,
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

      // Audit log the project creation with tenant context
      await auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: AuditAction.CREATE_SOURCE,
        resourceType: AuditResourceType.DATASET,
        resourceId: project.id,
        details: { name: project.name, type: 'project' },
        ipAddress: user.ip,
        tenantId,
      })

      return project
    } catch (error) {
      log.error('Failed to create project', { error: String(error) })
      throw error
    }
  }

  /**
   * @description Update an existing project with partial data and log the change to audit
   * @param {string} id - UUID of the project
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @param {string} [tenantId] - Tenant ID for org-scoped audit logging
   * @returns {Promise<Project | undefined>} Updated project or undefined if not found
   * @throws {Error} If update fails
   */
  async updateProject(id: string, data: any, user: UserContext, tenantId?: string): Promise<Project | undefined> {
    try {
      // Build update payload, only including provided fields
      const updateData: any = { updated_by: user.id }
      if (data.name !== undefined) updateData.name = data.name
      if (data.description !== undefined) updateData.description = data.description
      if (data.avatar !== undefined) updateData.avatar = data.avatar
      if (data.default_embedding_model !== undefined) updateData.default_embedding_model = data.default_embedding_model
      if (data.default_chunk_method !== undefined) updateData.default_chunk_method = data.default_chunk_method
      if (data.default_parser_config !== undefined) updateData.default_parser_config = JSON.stringify(data.default_parser_config)
      if (data.status !== undefined) updateData.status = data.status
      if (data.is_private !== undefined) updateData.is_private = data.is_private

      const project = await ModelFactory.project.update(id, updateData)

      // Audit log with tenant context
      if (project) {
        await auditService.log({
          userId: user.id,
          userEmail: user.email,
          action: AuditAction.UPDATE_SOURCE,
          resourceType: AuditResourceType.DATASET,
          resourceId: id,
          details: { changes: data, type: 'project' },
          ipAddress: user.ip,
          tenantId,
        })
      }

      return project
    } catch (error) {
      log.error('Failed to update project', { error: String(error) })
      throw error
    }
  }

  /**
   * @description Delete a project and cascade-delete any auto-created datasets linked to it
   * @param {string} id - UUID of the project
   * @param {UserContext} user - Authenticated user context
   * @param {string} [tenantId] - Tenant ID for org-scoped audit logging
   * @returns {Promise<void>}
   * @throws {Error} If deletion fails
   */
  async deleteProject(id: string, user: UserContext, tenantId?: string): Promise<void> {
    try {
      // Find and delete auto-created datasets
      const autoLinks = await ModelFactory.projectDataset.findAutoCreated(id)
      for (const link of autoLinks) {
        // Soft-delete the auto-created dataset
        await ModelFactory.dataset.update(link.dataset_id, { status: 'deleted' })
      }

      // Delete the project (cascades to permissions, categories, chats, searches, etc.)
      await ModelFactory.project.delete(id)

      // Audit log with tenant context
      await auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: AuditAction.DELETE_SOURCE,
        resourceType: AuditResourceType.DATASET,
        resourceId: id,
        details: { type: 'project' },
        ipAddress: user.ip,
        tenantId,
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
   * @description Get all permission entries for a project
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectPermission[]>} Array of permission records
   */
  async getPermissions(projectId: string): Promise<ProjectPermission[]> {
    return ModelFactory.projectPermission.findByProjectId(projectId)
  }

  /**
   * @description Set (upsert) a permission for a project, updating if one already exists for the grantee
   * @param {string} projectId - UUID of the project
   * @param {any} data - Permission data including grantee_type, grantee_id, tab access levels
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<ProjectPermission>} Created or updated permission record
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
   * @description Delete a permission entry by its UUID
   * @param {string} permId - UUID of the permission
   * @returns {Promise<void>}
   */
  async deletePermission(permId: string): Promise<void> {
    await ModelFactory.projectPermission.delete(permId)
  }

  // -------------------------------------------------------------------------
  // Project Datasets
  // -------------------------------------------------------------------------

  /**
   * @description Get all datasets linked to a project
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectDataset[]>} Array of project-dataset link records
   */
  async getProjectDatasets(projectId: string): Promise<ProjectDataset[]> {
    return ModelFactory.projectDataset.findByProjectId(projectId)
  }

  /**
   * @description Link an existing dataset or create a new one and link it to a project
   * @param {string} projectId - UUID of the project
   * @param {any} data - Link data with dataset_id, or create_new + dataset_name for new dataset
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<ProjectDataset>} Created project-dataset link record
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
   * @description Remove the link between a dataset and a project
   * @param {string} projectId - UUID of the project
   * @param {string} datasetId - UUID of the dataset
   * @returns {Promise<void>}
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
   * @description Get all entity-level permissions for a project
   * @param {string} projectId - UUID of the project
   * @returns {Promise<any[]>} Array of entity permission records
   */
  async getEntityPermissions(projectId: string): Promise<any[]> {
    return ModelFactory.projectEntityPermission.findByProjectId(projectId)
  }

  /**
   * @description Create a fine-grained entity-level permission grant
   * @param {string} projectId - UUID of the project
   * @param {any} data - Entity permission data including entity_type, entity_id, grantee info
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<any>} Created entity permission record
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
   * @description Delete an entity-level permission by its UUID
   * @param {string} permId - UUID of the entity permission
   * @returns {Promise<void>}
   */
  async deleteEntityPermission(permId: string): Promise<void> {
    await ModelFactory.projectEntityPermission.delete(permId)
  }

  // -------------------------------------------------------------------------
  // Member Management (PROJ-03)
  // -------------------------------------------------------------------------

  /**
   * @description Get all user members of a project with their profile details.
   *   Queries project_permissions for grantee_type='user' and JOINs with users table.
   * @param {string} projectId - UUID of the project
   * @returns {Promise<Array<{ id: string; user_id: string; email: string; name: string; role: string; created_at: Date }>>}
   *   Array of member objects with user profile info
   */
  async getProjectMembers(projectId: string): Promise<Array<{
    id: string; user_id: string; email: string; name: string; role: string; created_at: Date
  }>> {
    // JOIN project_permissions with users to get member profile details in a single query
    return db('project_permissions as pp')
      .select(
        'pp.id',
        'pp.grantee_id as user_id',
        'u.email',
        db.raw("COALESCE(u.nickname, u.email) as name"),
        'u.role',
        'pp.created_at',
      )
      .innerJoin('users as u', 'u.id', 'pp.grantee_id')
      .where('pp.project_id', projectId)
      .andWhere('pp.grantee_type', 'user')
      .orderBy('pp.created_at', 'desc')
  }

  /**
   * @description Add a user as a member of a project with default view permissions.
   *   Validates that the user exists within the same tenant before granting access.
   * @param {string} projectId - UUID of the project
   * @param {string} userId - UUID of the user to add
   * @param {string} addedBy - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for org-scoped validation and audit logging
   * @returns {Promise<ProjectPermission>} The created permission record
   * @throws {Error} If user not found in the same tenant
   */
  async addMember(projectId: string, userId: string, addedBy: string, tenantId: string): Promise<ProjectPermission> {
    // Verify user exists within the same tenant for multi-tenant isolation
    const user = await db('users as u')
      .innerJoin('user_tenant as ut', 'ut.user_id', 'u.id')
      .where('u.id', userId)
      .andWhere('ut.tenant_id', tenantId)
      .first()

    if (!user) {
      throw new Error('User not found in this organization')
    }

    // Create permission with default view access on documents and chat tabs
    const permission = await ModelFactory.projectPermission.create({
      project_id: projectId,
      grantee_type: 'user',
      grantee_id: userId,
      tab_documents: 'view',
      tab_chat: 'view',
      tab_settings: 'none',
      created_by: addedBy,
    })

    // Audit log the member addition
    await auditService.log({
      userId: addedBy,
      userEmail: user.email || '',
      action: AuditAction.SET_PERMISSION,
      resourceType: AuditResourceType.PERMISSION,
      resourceId: projectId,
      details: { type: 'add_member', member_id: userId },
      tenantId,
    })

    return permission
  }

  /**
   * @description Remove a user from a project by deleting their permission entry.
   *   Rejects removal of the project creator to prevent orphaned projects.
   * @param {string} projectId - UUID of the project
   * @param {string} userId - UUID of the user to remove
   * @param {string} removedBy - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for audit logging
   * @returns {Promise<void>}
   * @throws {Error} If trying to remove the project creator
   */
  async removeMember(projectId: string, userId: string, removedBy: string, tenantId: string): Promise<void> {
    // Prevent removal of the project creator to avoid orphaned projects
    const project = await ModelFactory.project.findById(projectId)
    if (project && project.created_by === userId) {
      throw new Error('Cannot remove the project creator')
    }

    // Delete the permission entry for this user
    await ModelFactory.projectPermission.delete({
      project_id: projectId,
      grantee_type: 'user',
      grantee_id: userId,
    } as any)

    // Audit log the member removal
    await auditService.log({
      userId: removedBy,
      userEmail: '',
      action: AuditAction.SET_PERMISSION,
      resourceType: AuditResourceType.PERMISSION,
      resourceId: projectId,
      details: { type: 'remove_member', member_id: userId },
      tenantId,
    })
  }

  // -------------------------------------------------------------------------
  // Dataset Binding (PROJ-02)
  // -------------------------------------------------------------------------

  /**
   * @description Bind one or more datasets to a project using a single INSERT with ON CONFLICT DO NOTHING.
   *   Avoids N+1 inserts by batching all dataset IDs into one query.
   * @param {string} projectId - UUID of the project
   * @param {string[]} datasetIds - Array of dataset UUIDs to bind
   * @param {string} userId - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for audit logging
   * @returns {Promise<void>}
   */
  async bindDatasets(projectId: string, datasetIds: string[], userId: string, tenantId: string): Promise<void> {
    // Build batch rows for a single INSERT with conflict handling
    const rows = datasetIds.map(datasetId => ({
      project_id: projectId,
      dataset_id: datasetId,
      auto_created: false,
    }))

    // Single INSERT with ON CONFLICT DO NOTHING to skip duplicates (Pitfall 3: no N+1)
    await db('project_datasets')
      .insert(rows)
      .onConflict(['project_id', 'dataset_id'])
      .ignore()

    // Audit log the binding action
    await auditService.log({
      userId,
      userEmail: '',
      action: AuditAction.UPDATE_SOURCE,
      resourceType: AuditResourceType.DATASET,
      resourceId: projectId,
      details: { type: 'bind_datasets', dataset_ids: datasetIds },
      tenantId,
    })
  }

  /**
   * @description Unbind a single dataset from a project. Immediate access revocation.
   * @param {string} projectId - UUID of the project
   * @param {string} datasetId - UUID of the dataset to unbind
   * @param {string} userId - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for audit logging
   * @returns {Promise<void>}
   */
  async unbindDataset(projectId: string, datasetId: string, userId: string, tenantId: string): Promise<void> {
    // Delete the project-dataset link for immediate access revocation
    await ModelFactory.projectDataset.delete({
      project_id: projectId,
      dataset_id: datasetId,
    } as any)

    // Audit log the unbinding action
    await auditService.log({
      userId,
      userEmail: '',
      action: AuditAction.UPDATE_SOURCE,
      resourceType: AuditResourceType.DATASET,
      resourceId: projectId,
      details: { type: 'unbind_dataset', dataset_id: datasetId },
      tenantId,
    })
  }

  // -------------------------------------------------------------------------
  // Cross-Project Dataset Resolver (PROJ-04)
  // -------------------------------------------------------------------------

  /**
   * @description Resolve all unique dataset IDs accessible to a user across all their projects.
   *   Uses a single JOIN query to avoid N+1 (Pitfall 3). Returns deduplicated dataset IDs.
   * @param {string} userId - UUID of the user
   * @param {string} tenantId - Tenant ID for org-scoped filtering
   * @returns {Promise<string[]>} Deduplicated array of dataset UUIDs the user can access
   */
  async resolveProjectDatasets(userId: string, tenantId: string): Promise<string[]> {
    // Single query with JOIN to resolve all datasets from user's projects (no N+1)
    const rows = await db('project_datasets as pd')
      .select('pd.dataset_id')
      .distinct()
      .innerJoin('project_permissions as pp', 'pd.project_id', 'pp.project_id')
      .where('pp.grantee_type', 'user')
      .andWhere('pp.grantee_id', userId)
      .whereIn('pd.project_id', function () {
        // Sub-select: only projects within the user's tenant
        this.select('id').from('projects').where('tenant_id', tenantId)
      })

    return rows.map((r: any) => r.dataset_id)
  }

  // -------------------------------------------------------------------------
  // Activity Feed
  // -------------------------------------------------------------------------

  /**
   * @description Get paginated audit log entries scoped to a project and its bound datasets.
   *   Includes both direct project actions and actions on datasets linked to the project.
   * @param {string} projectId - UUID of the project
   * @param {string} tenantId - Tenant ID for org-scoped filtering
   * @param {number} limit - Maximum number of entries to return
   * @param {number} offset - Pagination offset
   * @returns {Promise<{ data: any[]; total: number }>} Paginated audit entries with total count
   */
  async getProjectActivity(projectId: string, tenantId: string, limit: number, offset: number): Promise<{ data: any[]; total: number }> {
    // Build sub-query for dataset IDs linked to this project
    const datasetIdsSub = db('project_datasets')
      .select('dataset_id')
      .where('project_id', projectId)

    // Base query: audit logs for the project itself or its linked datasets
    const baseQuery = db('audit_logs')
      .where('tenant_id', tenantId)
      .andWhere(function () {
        // Include direct project actions and actions on bound datasets
        this.where('resource_id', projectId)
          .orWhereIn('resource_id', datasetIdsSub)
      })

    // Run data fetch and count in parallel for efficiency
    const [data, countResult] = await Promise.all([
      baseQuery.clone()
        .select('*')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      baseQuery.clone()
        .count('* as cnt')
        .first(),
    ])

    const total = Number((countResult as any)?.cnt ?? 0)

    // Parse details JSON string back to object for each entry
    const parsedData = data.map((entry: any) => ({
      ...entry,
      details: typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details,
    }))

    return { data: parsedData, total }
  }
}

/** Singleton instance */
export const projectsService = new ProjectsService()
