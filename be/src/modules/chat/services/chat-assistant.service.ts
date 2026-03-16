
/**
 * @fileoverview Chat assistant service for managing chat assistant configurations.
 *
 * Assistants define chat settings: which knowledge bases to use,
 * which LLM model, and prompt configuration. Includes RBAC access control
 * for restricting assistant visibility to specific users and teams.
 *
 * @module services/chat-assistant
 */

import { ModelFactory } from '@/shared/models/factory.js'
import { ChatAssistant, ChatAssistantAccess } from '@/shared/models/types.js'
import { log } from '@/shared/services/logger.service.js'

/**
 * Service class for chat assistant CRUD and RBAC access control operations.
 * Manages assistant configurations stored locally in PostgreSQL.
 */
export class ChatAssistantService {
  /**
   * Create a new assistant configuration.
   * @param data - Assistant creation data
   * @param userId - ID of the user creating the assistant
   * @returns The created ChatAssistant record
   */
  async createAssistant(
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
  ): Promise<ChatAssistant> {
    // Check name uniqueness (case-insensitive)
    const existing = await ModelFactory.chatAssistant.getKnex()
      .whereRaw('LOWER(name) = LOWER(?)', [data.name])
      .first()
    if (existing) {
      throw new Error('An assistant with this name already exists')
    }

    // Insert assistant record with creator info
    const assistant = await ModelFactory.chatAssistant.create({
      name: data.name,
      description: data.description || null,
      icon: data.icon || null,
      kb_ids: data.kb_ids,
      llm_id: data.llm_id || null,
      prompt_config: data.prompt_config || {},
      is_public: data.is_public ?? false,
      created_by: userId,
      updated_by: userId,
    } as Partial<ChatAssistant>)

    log.info('Chat assistant created', { assistantId: assistant.id, userId })
    return assistant
  }

  /**
   * Get a single assistant by ID.
   * @param assistantId - UUID of the assistant to retrieve
   * @returns The ChatAssistant if found, undefined otherwise
   */
  async getAssistant(assistantId: string): Promise<ChatAssistant | undefined> {
    return ModelFactory.chatAssistant.findById(assistantId)
  }

  /**
   * List all assistants, optionally filtered by creator.
   * @param userId - Optional user ID to filter by creator
   * @returns Array of ChatAssistant records
   */
  async listAssistants(userId?: string): Promise<ChatAssistant[]> {
    // Build filter based on optional userId
    const filter = userId ? { created_by: userId } : undefined
    return ModelFactory.chatAssistant.findAll(filter, { orderBy: { created_at: 'desc' } })
  }

  /**
   * List assistants accessible to a user based on RBAC rules, with pagination and search.
   * Admins see all assistants. Other users see assistants they created,
   * public assistants, and assistants shared with them or their teams.
   * @param userId - UUID of the requesting user
   * @param userRole - Role of the requesting user (e.g., 'admin', 'user')
   * @param teamIds - Array of team UUIDs the user belongs to
   * @param options - Pagination, search, and sort options
   * @returns Paginated result with data array and total count
   */
  async listAccessibleAssistants(
    userId: string,
    userRole: string,
    teamIds: string[],
    options: {
      page?: number
      pageSize?: number
      search?: string
      sortBy?: string
      sortOrder?: string
    } = {}
  ): Promise<{ data: ChatAssistant[]; total: number }> {
    const page = options.page ?? 1
    const pageSize = options.pageSize ?? 20
    const sortBy = options.sortBy ?? 'created_at'
    const sortOrder = options.sortOrder ?? 'desc'

    // Start building the base query with RBAC filtering
    let query = ModelFactory.chatAssistant.getKnex()

    // Apply RBAC filtering (admins see all)
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      // Get assistant IDs the user has been explicitly granted access to
      const accessibleIds = await ModelFactory.chatAssistantAccess.findAccessibleAssistantIds(userId, teamIds)

      query = query.where(function () {
        // User's own assistants
        this.where('created_by', userId)
        // Public assistants
        this.orWhere('is_public', true)
        // Assistants shared via access control entries
        if (accessibleIds.length > 0) {
          this.orWhereIn('id', accessibleIds)
        }
      })
    }

    // Apply search filter (case-insensitive on name and description)
    if (options.search) {
      query = query.where(function () {
        this.whereILike('name', `%${options.search}%`)
          .orWhereILike('description', `%${options.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await query.clone().count('* as count').first()
    const total = Number(countResult?.count ?? 0)

    // Apply sort and pagination
    const data = await query
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { data, total }
  }

  /**
   * Get access control entries for an assistant, enriched with display names.
   * Joins with users and teams tables to resolve entity names.
   * @param assistantId - UUID of the assistant
   * @returns Array of access entries with display_name field
   */
  async getAssistantAccess(
    assistantId: string
  ): Promise<Array<ChatAssistantAccess & { display_name?: string | undefined }>> {
    // Fetch raw access entries for the assistant
    const entries = await ModelFactory.chatAssistantAccess.findByAssistantId(assistantId)

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
   * Set (bulk replace) access control entries for an assistant.
   * Removes all existing entries and inserts the provided ones.
   * @param assistantId - UUID of the assistant
   * @param entries - Array of access entries to set
   * @param userId - UUID of the user performing the operation
   * @returns Array of newly created access entries
   */
  async setAssistantAccess(
    assistantId: string,
    entries: Array<{ entity_type: 'user' | 'team'; entity_id: string }>,
    userId: string
  ): Promise<ChatAssistantAccess[]> {
    // Bulk replace access entries within a transaction
    const result = await ModelFactory.chatAssistantAccess.bulkReplace(assistantId, entries, userId)
    log.info('Chat assistant access updated', { assistantId, entryCount: entries.length, userId })
    return result
  }

  /**
   * Check if a user has access to a specific assistant.
   * Admins always have access. Other users need to be the creator,
   * or the assistant must be public, or they must have an explicit grant.
   * @param assistantId - UUID of the assistant
   * @param userId - UUID of the user to check
   * @param userRole - Role of the user
   * @param teamIds - Array of team UUIDs the user belongs to
   * @returns True if the user can access the assistant
   */
  async checkUserAccess(
    assistantId: string,
    userId: string,
    userRole: string,
    teamIds: string[]
  ): Promise<boolean> {
    // Admins always have access
    if (userRole === 'admin' || userRole === 'superadmin') {
      return true
    }

    // Fetch the assistant to check ownership and public flag
    const assistant = await ModelFactory.chatAssistant.findById(assistantId)
    if (!assistant) {
      return false
    }

    // Creator always has access to their own assistant
    if (assistant.created_by === userId) {
      return true
    }

    // Public assistants are accessible to everyone
    if (assistant.is_public) {
      return true
    }

    // Check explicit access grants for user or their teams
    const accessibleIds = await ModelFactory.chatAssistantAccess.findAccessibleAssistantIds(userId, teamIds)
    return accessibleIds.includes(assistantId)
  }

  /**
   * Update an existing assistant configuration.
   * @param assistantId - UUID of the assistant to update
   * @param data - Partial assistant data to update
   * @param userId - ID of the user performing the update
   * @returns The updated ChatAssistant if found, undefined otherwise
   */
  async updateAssistant(
    assistantId: string,
    data: Partial<Pick<ChatAssistant, 'name' | 'description' | 'icon' | 'kb_ids' | 'llm_id' | 'prompt_config' | 'is_public'>>,
    userId: string
  ): Promise<ChatAssistant | undefined> {
    // Update record with updated_by tracking
    const updated = await ModelFactory.chatAssistant.update(assistantId, {
      ...data,
      updated_by: userId,
    } as Partial<ChatAssistant>)

    if (updated) {
      log.info('Chat assistant updated', { assistantId, userId })
    }
    return updated
  }

  /**
   * Delete an assistant by ID.
   * @param assistantId - UUID of the assistant to delete
   * @returns void
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    await ModelFactory.chatAssistant.delete(assistantId)
    log.info('Chat assistant deleted', { assistantId })
  }
}

/** Singleton instance of the chat assistant service */
export const chatAssistantService = new ChatAssistantService()
