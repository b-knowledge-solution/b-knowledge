
/**
 * @fileoverview Chat dialog service for managing RAGFlow dialog configurations.
 *
 * Dialogs define chat assistant settings: which knowledge bases to use,
 * which LLM model, and prompt configuration. Includes RBAC access control
 * for restricting dialog visibility to specific users and teams.
 *
 * @module services/chat-dialog
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { ChatDialog, ChatDialogAccess } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * Service class for chat dialog CRUD and RBAC access control operations.
 * Manages dialog configurations stored locally in PostgreSQL.
 */
export class ChatDialogService {
  /**
   * Create a new dialog configuration.
   * @param data - Dialog creation data
   * @param userId - ID of the user creating the dialog
   * @returns The created ChatDialog record
   */
  async createDialog(
    data: {
      name: string
      description?: string
      icon?: string
      kb_ids: string[]
      llm_id?: string
      prompt_config?: Record<string, unknown>
      is_public?: boolean
    },
    userId: string
  ): Promise<ChatDialog> {
    // Insert dialog record with creator info
    const dialog = await ModelFactory.chatDialog.create({
      name: data.name,
      description: data.description || null,
      icon: data.icon || null,
      kb_ids: data.kb_ids,
      llm_id: data.llm_id || null,
      prompt_config: data.prompt_config || {},
      is_public: data.is_public ?? false,
      created_by: userId,
      updated_by: userId,
    } as Partial<ChatDialog>)

    log.info('Chat dialog created', { dialogId: dialog.id, userId })
    return dialog
  }

  /**
   * Get a single dialog by ID.
   * @param dialogId - UUID of the dialog to retrieve
   * @returns The ChatDialog if found, undefined otherwise
   */
  async getDialog(dialogId: string): Promise<ChatDialog | undefined> {
    return ModelFactory.chatDialog.findById(dialogId)
  }

  /**
   * List all dialogs, optionally filtered by creator.
   * @param userId - Optional user ID to filter by creator
   * @returns Array of ChatDialog records
   */
  async listDialogs(userId?: string): Promise<ChatDialog[]> {
    // Build filter based on optional userId
    const filter = userId ? { created_by: userId } : undefined
    return ModelFactory.chatDialog.findAll(filter, { orderBy: { created_at: 'desc' } })
  }

  /**
   * List dialogs accessible to a user based on RBAC rules.
   * Admins see all dialogs. Other users see dialogs they created,
   * public dialogs, and dialogs shared with them or their teams.
   * @param userId - UUID of the requesting user
   * @param userRole - Role of the requesting user (e.g., 'admin', 'user')
   * @param teamIds - Array of team UUIDs the user belongs to
   * @returns Array of accessible ChatDialog records
   */
  async listAccessibleDialogs(
    userId: string,
    userRole: string,
    teamIds: string[]
  ): Promise<ChatDialog[]> {
    // Admins can see all dialogs without restriction
    if (userRole === 'admin' || userRole === 'superadmin') {
      return ModelFactory.chatDialog.findAll(undefined, { orderBy: { created_at: 'desc' } })
    }

    // Get dialog IDs the user has been explicitly granted access to
    const accessibleIds = await ModelFactory.chatDialogAccess.findAccessibleDialogIds(userId, teamIds)

    // Build query: created_by user OR is_public OR in accessible IDs
    const dialogs = await ModelFactory.chatDialog.getKnex()
      .where(function () {
        // User's own dialogs
        this.where('created_by', userId)
        // Public dialogs
        this.orWhere('is_public', true)
        // Dialogs shared via access control entries
        if (accessibleIds.length > 0) {
          this.orWhereIn('id', accessibleIds)
        }
      })
      .orderBy('created_at', 'desc')

    return dialogs
  }

  /**
   * Get access control entries for a dialog, enriched with display names.
   * Joins with users and teams tables to resolve entity names.
   * @param dialogId - UUID of the dialog
   * @returns Array of access entries with display_name field
   */
  async getDialogAccess(
    dialogId: string
  ): Promise<Array<ChatDialogAccess & { display_name?: string | undefined }>> {
    // Fetch raw access entries for the dialog
    const entries = await ModelFactory.chatDialogAccess.findByDialogId(dialogId)

    // Separate user and team entries for batch name resolution
    const userIds = entries.filter((e) => e.entity_type === 'user').map((e) => e.entity_id)
    const teamIds = entries.filter((e) => e.entity_type === 'team').map((e) => e.entity_id)

    // Build lookup maps for display names
    const userMap = new Map<string, string>()
    const teamMap = new Map<string, string>()

    // Batch fetch user display names
    if (userIds.length > 0) {
      const users = await ModelFactory.user.getKnex()
        .select('id', 'display_name')
        .whereIn('id', userIds)
      for (const u of users) {
        userMap.set(u.id, u.display_name)
      }
    }

    // Batch fetch team names
    if (teamIds.length > 0) {
      const teams = await ModelFactory.team.getKnex()
        .select('id', 'name')
        .whereIn('id', teamIds)
      for (const t of teams) {
        teamMap.set(t.id, t.name)
      }
    }

    // Enrich entries with resolved display names
    return entries.map((entry) => ({
      ...entry,
      display_name:
        entry.entity_type === 'user'
          ? userMap.get(entry.entity_id)
          : teamMap.get(entry.entity_id),
    }))
  }

  /**
   * Set (bulk replace) access control entries for a dialog.
   * Removes all existing entries and inserts the provided ones.
   * @param dialogId - UUID of the dialog
   * @param entries - Array of access entries to set
   * @param userId - UUID of the user performing the operation
   * @returns Array of newly created access entries
   */
  async setDialogAccess(
    dialogId: string,
    entries: Array<{ entity_type: 'user' | 'team'; entity_id: string }>,
    userId: string
  ): Promise<ChatDialogAccess[]> {
    // Bulk replace access entries within a transaction
    const result = await ModelFactory.chatDialogAccess.bulkReplace(dialogId, entries, userId)
    log.info('Chat dialog access updated', { dialogId, entryCount: entries.length, userId })
    return result
  }

  /**
   * Check if a user has access to a specific dialog.
   * Admins always have access. Other users need to be the creator,
   * or the dialog must be public, or they must have an explicit grant.
   * @param dialogId - UUID of the dialog
   * @param userId - UUID of the user to check
   * @param userRole - Role of the user
   * @param teamIds - Array of team UUIDs the user belongs to
   * @returns True if the user can access the dialog
   */
  async checkUserAccess(
    dialogId: string,
    userId: string,
    userRole: string,
    teamIds: string[]
  ): Promise<boolean> {
    // Admins always have access
    if (userRole === 'admin' || userRole === 'superadmin') {
      return true
    }

    // Fetch the dialog to check ownership and public flag
    const dialog = await ModelFactory.chatDialog.findById(dialogId)
    if (!dialog) {
      return false
    }

    // Creator always has access to their own dialog
    if (dialog.created_by === userId) {
      return true
    }

    // Public dialogs are accessible to everyone
    if (dialog.is_public) {
      return true
    }

    // Check explicit access grants for user or their teams
    const accessibleIds = await ModelFactory.chatDialogAccess.findAccessibleDialogIds(userId, teamIds)
    return accessibleIds.includes(dialogId)
  }

  /**
   * Update an existing dialog configuration.
   * @param dialogId - UUID of the dialog to update
   * @param data - Partial dialog data to update
   * @param userId - ID of the user performing the update
   * @returns The updated ChatDialog if found, undefined otherwise
   */
  async updateDialog(
    dialogId: string,
    data: Partial<Pick<ChatDialog, 'name' | 'description' | 'icon' | 'kb_ids' | 'llm_id' | 'prompt_config' | 'is_public'>>,
    userId: string
  ): Promise<ChatDialog | undefined> {
    // Update record with updated_by tracking
    const updated = await ModelFactory.chatDialog.update(dialogId, {
      ...data,
      updated_by: userId,
    } as Partial<ChatDialog>)

    if (updated) {
      log.info('Chat dialog updated', { dialogId, userId })
    }
    return updated
  }

  /**
   * Delete a dialog by ID.
   * @param dialogId - UUID of the dialog to delete
   * @returns void
   */
  async deleteDialog(dialogId: string): Promise<void> {
    await ModelFactory.chatDialog.delete(dialogId)
    log.info('Chat dialog deleted', { dialogId })
  }
}

/** Singleton instance of the chat dialog service */
export const chatDialogService = new ChatDialogService()
