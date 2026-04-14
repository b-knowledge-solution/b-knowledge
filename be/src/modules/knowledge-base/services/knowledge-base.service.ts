/**
 * @fileoverview Core knowledge base service handling CRUD, default category/version creation, and RBAC.
 * @module services/knowledge-base
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { auditService, AuditAction, AuditResourceType } from '@/modules/audit/services/audit.service.js'
import { teamService } from '@/modules/teams/services/team.service.js'
import { KnowledgeBase, KnowledgeBasePermission, KnowledgeBaseDataset, UserContext } from '@/shared/models/types.js'
import { knowledgeBaseCategoryService } from './knowledge-base-category.service.js'
import { config } from '@/shared/config/index.js'
import { UserRole } from '@/shared/constants/index.js'
import { KNOWLEDGE_BASE_PERMISSIONS } from '../knowledge-base.permissions.js'
import { buildAbilityFor } from '@/shared/services/ability.service.js'
import { PermissionSubjects } from '@/shared/constants/permissions.js'

/**
 * @description Core knowledge base service handling CRUD operations, auto-dataset creation on knowledge base setup,
 *   RBAC-based knowledge base listing, permission management, and entity-level access control
 */
export class KnowledgeBaseService {
  /**
   * @description Normalize user permissions from the session user context.
   * @param {UserContext['permissions']} rawPermissions - Raw permission payload
   * @returns {Set<string>} Parsed permission key set
   */
  private getPermissionSet(rawPermissions: UserContext['permissions']): Set<string> {
    // Support legacy stringified JSON values.
    if (typeof rawPermissions === 'string') {
      try {
        const parsed = JSON.parse(rawPermissions)
        if (Array.isArray(parsed)) {
          return new Set(parsed.filter((p): p is string => typeof p === 'string'))
        }
      } catch {
        return new Set()
      }
    }

    if (Array.isArray(rawPermissions)) {
      return new Set(rawPermissions.filter((p): p is string => typeof p === 'string'))
    }

    return new Set()
  }

  /**
   * @description Get all knowledge bases accessible to the given user based on RBAC rules and tenant isolation.
   *   Admins see all knowledge bases within the tenant. Other users see public knowledge bases and those
   *   they have explicit permissions for (directly or via team membership).
   * @param {UserContext} user - Authenticated user context
   * @param {string} tenantId - Tenant ID for org-scoped filtering (required for multi-tenant isolation)
   * @returns {Promise<KnowledgeBase[]>} Array of accessible knowledge bases
   */
  async getAccessibleKnowledgeBases(user: UserContext, tenantId: string): Promise<KnowledgeBase[]> {
    const permissions = this.getPermissionSet(user.permissions)
    let canViewAllKnowledgeBases =
      user.role === UserRole.ADMIN ||
      user.role === UserRole.SUPER_ADMIN ||
      permissions.has('*') ||
      permissions.has(KNOWLEDGE_BASE_PERMISSIONS.view.key)

    // Prefer ability-engine evaluation so role_permissions overrides are respected.
    if (!canViewAllKnowledgeBases) {
      try {
        const ability = await buildAbilityFor({
          id: user.id,
          role: user.role || UserRole.USER,
          is_superuser: user.is_superuser ?? null,
          current_org_id: user.current_org_id || '',
        })
        canViewAllKnowledgeBases = ability.can('read', PermissionSubjects.KnowledgeBase)
      } catch {
        // Fall back to role/session-permission checks above when ability building fails.
      }
    }

    // Permission-driven admin scope: users with knowledge_base.view should see all tenant KBs.
    if (canViewAllKnowledgeBases) {
      return ModelFactory.knowledgeBase.findByTenant(tenantId)
    }

    // Fetch all active knowledge bases scoped to this tenant
    const allKnowledgeBases = await ModelFactory.knowledgeBase.findByTenant(tenantId)

    // Get user's team IDs for team-based permission checks
    const userTeams = await teamService.getUserTeams(user.id)
    const teamIds = userTeams.map((t: any) => t.id)

    // Get all permissions for this user (direct + team)
    const userPerms = await ModelFactory.knowledgeBasePermission.findByGrantee('user', user.id)
    const userPermKnowledgeBaseIds = new Set(userPerms.map(p => p.knowledge_base_id))

    // Get team permissions in a single query to avoid N+1 DB round-trips
    const teamPermKnowledgeBaseIds = new Set<string>()
    if (teamIds.length > 0) {
      const teamKbIds = await ModelFactory.knowledgeBasePermission.findKnowledgeBaseIdsByTeams(teamIds)
      teamKbIds.forEach((id: string) => teamPermKnowledgeBaseIds.add(id))
    }

    // Filter: show public knowledge bases, knowledge bases created by user, or those with permissions
    return allKnowledgeBases.filter(kb => {
      if (!kb.is_private) return true
      if (kb.created_by === user.id) return true
      if (userPermKnowledgeBaseIds.has(kb.id)) return true
      if (teamPermKnowledgeBaseIds.has(kb.id)) return true
      return false
    })
  }

  /**
   * @description Retrieve a single knowledge base by its UUID
   * @param {string} id - UUID of the knowledge base
   * @returns {Promise<KnowledgeBase | undefined>} Knowledge base record or undefined if not found
   */
  async getKnowledgeBaseById(id: string): Promise<KnowledgeBase | undefined> {
    return ModelFactory.knowledgeBase.findById(id)
  }

  /**
   * @description Create a new knowledge base. If first_version_label is provided, also creates
   *   a default document category and first version (which triggers auto-dataset creation).
   * @param {any} data - Knowledge base creation data including name, embedding model defaults, optional first_version_label
   * @param {UserContext} user - Authenticated user context
   * @param {string} [tenantId] - Tenant ID for org-scoped audit logging
   * @returns {Promise<KnowledgeBase>} The created knowledge base
   * @throws {Error} If knowledge base creation fails
   */
  async createKnowledgeBase(data: any, user: UserContext, tenantId?: string): Promise<KnowledgeBase> {
    try {
      // Check for duplicate knowledge base name within the same tenant
      const existingKnowledgeBase = await ModelFactory.knowledgeBase.findByNameExcludingDeleted(data.name, tenantId)

      if (existingKnowledgeBase) {
        throw new Error('Knowledge base with this name already exists')
      }

      // Create the knowledge base record with tenant_id for multi-tenant isolation
      const knowledgeBase = await ModelFactory.knowledgeBase.create({
        name: data.name,
        description: data.description || null,
        avatar: data.avatar || null,
        default_embedding_model: data.default_embedding_model || null,
        default_chunk_method: data.default_chunk_method || null,
        default_parser_config: JSON.stringify(data.default_parser_config || {}),
        status: 'active',
        is_private: data.is_private ?? false,
        tenant_id: tenantId || config.opensearch.systemTenantId,
        created_by: user.id,
        updated_by: user.id,
      })

      // If first_version_label is provided, auto-create a default category + first version
      if (data.first_version_label) {
        try {
          // Create a default document category for the knowledge base
          const category = await knowledgeBaseCategoryService.createCategory(knowledgeBase.id, {
            name: 'Default',
            description: `Default document category for knowledge base: ${knowledgeBase.name}`,
          }, user)

          // Create the first version (this triggers auto-dataset creation in category service)
          await knowledgeBaseCategoryService.createVersion(category.id, {
            version_label: data.first_version_label,
            knowledge_base_id: knowledgeBase.id,
          }, user)
        } catch (versionError) {
          // Non-blocking: knowledge base is still created even if version setup fails
          log.warn('Failed to auto-create default category/version for knowledge base', {
            error: String(versionError), knowledgeBaseId: knowledgeBase.id,
          })
        }
      }

      // Audit log the knowledge base creation with tenant context
      await auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: AuditAction.CREATE_SOURCE,
        resourceType: AuditResourceType.DATASET,
        resourceId: knowledgeBase.id,
        details: { name: knowledgeBase.name, type: 'knowledge_base' },
        ipAddress: user.ip,
        tenantId,
      })

      return knowledgeBase
    } catch (error) {
      log.error('Failed to create knowledge base', { error: String(error) })
      throw error
    }
  }

  /**
   * @description Update an existing knowledge base with partial data and log the change to audit
   * @param {string} id - UUID of the knowledge base
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @param {string} [tenantId] - Tenant ID for org-scoped audit logging
   * @returns {Promise<KnowledgeBase | undefined>} Updated knowledge base or undefined if not found
   * @throws {Error} If update fails
   */
  async updateKnowledgeBase(id: string, data: any, user: UserContext, tenantId?: string): Promise<KnowledgeBase | undefined> {
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

      const knowledgeBase = await ModelFactory.knowledgeBase.update(id, updateData)

      // Audit log with tenant context
      if (knowledgeBase) {
        await auditService.log({
          userId: user.id,
          userEmail: user.email,
          action: AuditAction.UPDATE_SOURCE,
          resourceType: AuditResourceType.DATASET,
          resourceId: id,
          details: { changes: data, type: 'knowledge_base' },
          ipAddress: user.ip,
          tenantId,
        })
      }

      return knowledgeBase
    } catch (error) {
      log.error('Failed to update knowledge base', { error: String(error) })
      throw error
    }
  }

  /**
   * @description Delete a knowledge base and cascade-delete any auto-created datasets linked to it
   * @param {string} id - UUID of the knowledge base
   * @param {UserContext} user - Authenticated user context
   * @param {string} [tenantId] - Tenant ID for org-scoped audit logging
   * @returns {Promise<void>}
   * @throws {Error} If deletion fails
   */
  async deleteKnowledgeBase(id: string, user: UserContext, tenantId?: string): Promise<void> {
    try {
      // Find and delete auto-created datasets
      const autoLinks = await ModelFactory.knowledgeBaseDataset.findAutoCreated(id)
      for (const link of autoLinks) {
        // Soft-delete the auto-created dataset
        await ModelFactory.dataset.update(link.dataset_id, { status: 'deleted' })
      }

      // Delete the knowledge base (cascades to permissions, categories, chats, searches, etc.)
      await ModelFactory.knowledgeBase.delete(id)

      // Audit log with tenant context
      await auditService.log({
        userId: user.id,
        userEmail: user.email,
        action: AuditAction.DELETE_SOURCE,
        resourceType: AuditResourceType.DATASET,
        resourceId: id,
        details: { type: 'knowledge_base' },
        ipAddress: user.ip,
        tenantId,
      })
    } catch (error) {
      log.error('Failed to delete knowledge base', { error: String(error) })
      throw error
    }
  }

  // -------------------------------------------------------------------------
  // Permissions
  // -------------------------------------------------------------------------

  /**
   * @description Get all permission entries for a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBasePermission[]>} Array of permission records
   */
  async getPermissions(knowledgeBaseId: string): Promise<KnowledgeBasePermission[]> {
    return ModelFactory.knowledgeBasePermission.findByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * @description Set (upsert) a permission for a knowledge base, updating if one already exists for the grantee
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {any} data - Permission data including grantee_type, grantee_id, tab access levels
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBasePermission>} Created or updated permission record
   */
  async setPermission(knowledgeBaseId: string, data: any, user: UserContext): Promise<KnowledgeBasePermission> {
    // Check if permission already exists
    const existing = await ModelFactory.knowledgeBasePermission.findByKnowledgeBaseAndGrantee(
      knowledgeBaseId, data.grantee_type, data.grantee_id
    )

    if (existing) {
      // Update existing permission
      const updated = await ModelFactory.knowledgeBasePermission.update(existing.id, {
        tab_documents: data.tab_documents ?? existing.tab_documents,
        tab_chat: data.tab_chat ?? existing.tab_chat,
        tab_settings: data.tab_settings ?? existing.tab_settings,
        updated_by: user.id,
      })
      return updated!
    }

    // Create new permission
    return ModelFactory.knowledgeBasePermission.create({
      knowledge_base_id: knowledgeBaseId,
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
    await ModelFactory.knowledgeBasePermission.delete(permId)
  }

  // -------------------------------------------------------------------------
  // Knowledge Base Datasets
  // -------------------------------------------------------------------------

  /**
   * @description Get all datasets linked to a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseDataset[]>} Array of knowledge-base-dataset link records
   */
  async getKnowledgeBaseDatasets(knowledgeBaseId: string): Promise<KnowledgeBaseDataset[]> {
    return ModelFactory.knowledgeBaseDataset.findByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * @description Link an existing dataset or create a new one and link it to a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {any} data - Link data with dataset_id, or create_new + dataset_name for new dataset
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBaseDataset>} Created knowledge-base-dataset link record
   */
  async linkDataset(knowledgeBaseId: string, data: any, user: UserContext): Promise<KnowledgeBaseDataset> {
    let datasetId = data.dataset_id

    // If creating a new dataset
    if (data.create_new && data.dataset_name) {
      const dataset = await ModelFactory.dataset.create({
        name: data.dataset_name,
        description: `Dataset for knowledge base`,
        status: 'active',
        created_by: user.id,
        updated_by: user.id,
      })
      datasetId = dataset.id
    }

    // Create the link
    return ModelFactory.knowledgeBaseDataset.create({
      knowledge_base_id: knowledgeBaseId,
      dataset_id: datasetId,
      auto_created: !!data.create_new,
    })
  }

  /**
   * @description Remove the link between a dataset and a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} datasetId - UUID of the dataset
   * @returns {Promise<void>}
   */
  async unlinkDataset(knowledgeBaseId: string, datasetId: string): Promise<void> {
    await ModelFactory.knowledgeBaseDataset.delete({
      knowledge_base_id: knowledgeBaseId,
      dataset_id: datasetId,
    } as any)
  }

  // -------------------------------------------------------------------------
  // Entity Permissions
  // -------------------------------------------------------------------------

  /**
   * @description Get all entity-level permissions for a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<any[]>} Array of entity permission records
   */
  async getEntityPermissions(knowledgeBaseId: string): Promise<any[]> {
    return ModelFactory.knowledgeBaseEntityPermission.findByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * @description Create a fine-grained entity-level permission grant
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {any} data - Entity permission data including entity_type, entity_id, grantee info
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<any>} Created entity permission record
   */
  async createEntityPermission(knowledgeBaseId: string, data: any, user: UserContext): Promise<any> {
    return ModelFactory.knowledgeBaseEntityPermission.create({
      knowledge_base_id: knowledgeBaseId,
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
    await ModelFactory.knowledgeBaseEntityPermission.delete(permId)
  }

  // -------------------------------------------------------------------------
  // Member Management
  // -------------------------------------------------------------------------

  /**
   * @description Get all user members of a knowledge base with their profile details.
   *   Queries knowledge_base_permissions for grantee_type='user' and JOINs with users table.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<Array<{ id: string; user_id: string; email: string; name: string; role: string; created_at: Date }>>}
   *   Array of member objects with user profile info
   */
  async getKnowledgeBaseMembers(knowledgeBaseId: string): Promise<Array<{
    id: string; user_id: string; email: string; name: string; role: string; created_at: Date
  }>> {
    // Delegate to model which JOINs with users table for member profile details
    return ModelFactory.knowledgeBasePermission.findMembersWithUserDetails(knowledgeBaseId)
  }

  /**
   * @description Add a user as a member of a knowledge base with default view permissions.
   *   Validates that the user exists within the same tenant before granting access.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} userId - UUID of the user to add
   * @param {string} addedBy - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for org-scoped validation and audit logging
   * @returns {Promise<KnowledgeBasePermission>} The created permission record
   * @throws {Error} If user not found in the same tenant
   */
  async addMember(knowledgeBaseId: string, userId: string, addedBy: string, tenantId: string): Promise<KnowledgeBasePermission> {
    // Verify user exists within the same tenant for multi-tenant isolation
    const user = await ModelFactory.user.findByIdAndTenant(userId, tenantId)

    if (!user) {
      throw new Error('User not found in this organization')
    }

    // Create permission with default view access on documents and chat tabs
    const permission = await ModelFactory.knowledgeBasePermission.create({
      knowledge_base_id: knowledgeBaseId,
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
      resourceId: knowledgeBaseId,
      details: { type: 'add_member', member_id: userId },
      tenantId,
    })

    return permission
  }

  /**
   * @description Remove a user from a knowledge base by deleting their permission entry.
   *   Rejects removal of the knowledge base creator to prevent orphaned knowledge bases.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} userId - UUID of the user to remove
   * @param {string} removedBy - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for audit logging
   * @returns {Promise<void>}
   * @throws {Error} If trying to remove the knowledge base creator
   */
  async removeMember(knowledgeBaseId: string, userId: string, removedBy: string, tenantId: string): Promise<void> {
    // Prevent removal of the knowledge base creator to avoid orphaned knowledge bases
    const knowledgeBase = await ModelFactory.knowledgeBase.findById(knowledgeBaseId)
    if (knowledgeBase && knowledgeBase.created_by === userId) {
      throw new Error('Cannot remove the knowledge base creator')
    }

    // Delete the permission entry for this user
    await ModelFactory.knowledgeBasePermission.delete({
      knowledge_base_id: knowledgeBaseId,
      grantee_type: 'user',
      grantee_id: userId,
    } as any)

    // Audit log the member removal
    await auditService.log({
      userId: removedBy,
      userEmail: '',
      action: AuditAction.SET_PERMISSION,
      resourceType: AuditResourceType.PERMISSION,
      resourceId: knowledgeBaseId,
      details: { type: 'remove_member', member_id: userId },
      tenantId,
    })
  }

  // -------------------------------------------------------------------------
  // Dataset Binding
  // -------------------------------------------------------------------------

  /**
   * @description Bind one or more datasets to a knowledge base using a single INSERT with ON CONFLICT DO NOTHING.
   *   Avoids N+1 inserts by batching all dataset IDs into one query.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string[]} datasetIds - Array of dataset UUIDs to bind
   * @param {string} userId - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for audit logging
   * @returns {Promise<void>}
   */
  async bindDatasets(knowledgeBaseId: string, datasetIds: string[], userId: string, tenantId: string): Promise<void> {
    // Build batch rows for a single INSERT with conflict handling
    const rows = datasetIds.map(datasetId => ({
      knowledge_base_id: knowledgeBaseId,
      dataset_id: datasetId,
      auto_created: false,
    }))

    // Single INSERT with ON CONFLICT DO NOTHING to skip duplicates (no N+1)
    await ModelFactory.knowledgeBaseDataset.bulkInsertIgnoreConflict(rows)

    // Audit log the binding action
    await auditService.log({
      userId,
      userEmail: '',
      action: AuditAction.UPDATE_SOURCE,
      resourceType: AuditResourceType.DATASET,
      resourceId: knowledgeBaseId,
      details: { type: 'bind_datasets', dataset_ids: datasetIds },
      tenantId,
    })
  }

  /**
   * @description Unbind a single dataset from a knowledge base. Immediate access revocation.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} datasetId - UUID of the dataset to unbind
   * @param {string} userId - UUID of the user performing the action
   * @param {string} tenantId - Tenant ID for audit logging
   * @returns {Promise<void>}
   */
  async unbindDataset(knowledgeBaseId: string, datasetId: string, userId: string, tenantId: string): Promise<void> {
    // Delete the knowledge-base-dataset link for immediate access revocation
    await ModelFactory.knowledgeBaseDataset.delete({
      knowledge_base_id: knowledgeBaseId,
      dataset_id: datasetId,
    } as any)

    // Audit log the unbinding action
    await auditService.log({
      userId,
      userEmail: '',
      action: AuditAction.UPDATE_SOURCE,
      resourceType: AuditResourceType.DATASET,
      resourceId: knowledgeBaseId,
      details: { type: 'unbind_dataset', dataset_id: datasetId },
      tenantId,
    })
  }

  // -------------------------------------------------------------------------
  // Cross-Knowledge-Base Dataset Resolver
  // -------------------------------------------------------------------------

  /**
   * @description Resolve all unique dataset IDs accessible to a user across all their knowledge bases.
   *   Uses a single JOIN query to avoid N+1. Returns deduplicated dataset IDs.
   * @param {string} userId - UUID of the user
   * @param {string} tenantId - Tenant ID for org-scoped filtering
   * @returns {Promise<string[]>} Deduplicated array of dataset UUIDs the user can access
   */
  async resolveKnowledgeBaseDatasets(userId: string, tenantId: string): Promise<string[]> {
    // Delegate to model which uses a single JOIN query for efficient resolution
    return ModelFactory.knowledgeBaseDataset.resolveDatasetIdsByUserPermissions(userId, tenantId)
  }

  // -------------------------------------------------------------------------
  // Activity Feed
  // -------------------------------------------------------------------------

  /**
   * @description Get paginated audit log entries scoped to a knowledge base and its bound datasets.
   *   Includes both direct knowledge base actions and actions on datasets linked to the knowledge base.
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {string} tenantId - Tenant ID for org-scoped filtering
   * @param {number} limit - Maximum number of entries to return
   * @param {number} offset - Pagination offset
   * @returns {Promise<{ data: any[]; total: number }>} Paginated audit entries with total count
   */
  async getKnowledgeBaseActivity(knowledgeBaseId: string, tenantId: string, limit: number, offset: number): Promise<{ data: any[]; total: number }> {
    // Gather resource IDs: the knowledge base itself + its linked datasets
    const datasetLinks = await ModelFactory.knowledgeBaseDataset.findByKnowledgeBaseId(knowledgeBaseId)
    const resourceIds = [knowledgeBaseId, ...datasetLinks.map((l: any) => l.dataset_id)]

    // Query audit logs for all relevant resource IDs within the tenant
    const { data, total } = await ModelFactory.auditLog.findByResourceIdsInTenant(tenantId, resourceIds, limit, offset)

    // Parse details JSON string back to object for each entry
    const parsedData = data.map((entry: any) => ({
      ...entry,
      details: typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details,
    }))

    return { data: parsedData, total }
  }
}

/** Singleton instance */
export const knowledgeBaseService = new KnowledgeBaseService()
