
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
import { UserRole } from '@/shared/constants/index.js'

/**
 * Service class for chat assistant CRUD and RBAC access control operations.
 * Manages assistant configurations stored locally in PostgreSQL.
 */
export class ChatAssistantService {
  /**
   * @description Create a new assistant configuration.
   * Validates name uniqueness (case-insensitive) and inserts the record.
   * @param {object} data - Assistant creation data
   * @param {string} userId - ID of the user creating the assistant
   * @returns {Promise<ChatAssistant>} The created ChatAssistant record
   * @throws {Error} If an assistant with the same name already exists
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
    const existing = await ModelFactory.chatAssistant.findByNameCaseInsensitive(data.name)
    if (existing) {
      throw new Error('An assistant with this name already exists')
    }

    // Insert assistant record with creator info
    // JSONB columns must be stringified before Knex insert
    const insertData: Record<string, unknown> = {
      name: data.name,
      description: data.description || null,
      icon: data.icon || null,
      kb_ids: JSON.stringify(data.kb_ids),
      llm_id: data.llm_id || null,
      prompt_config: JSON.stringify(data.prompt_config || {}),
      is_public: data.is_public ?? false,
      created_by: userId,
      updated_by: userId,
    }
    const assistant = await ModelFactory.chatAssistant.create(insertData as Partial<ChatAssistant>)

    log.info('Chat assistant created', { assistantId: assistant.id, userId })
    return assistant
  }

  /**
   * @description Get a single assistant by ID.
   * @param {string} assistantId - UUID of the assistant to retrieve
   * @returns {Promise<ChatAssistant | undefined>} The ChatAssistant if found, undefined otherwise
   */
  async getAssistant(assistantId: string): Promise<ChatAssistant | undefined> {
    return ModelFactory.chatAssistant.findById(assistantId)
  }

  /**
   * @description List all assistants, optionally filtered by creator.
   * @param {string} [userId] - Optional user ID to filter by creator
   * @returns {Promise<ChatAssistant[]>} Array of ChatAssistant records ordered by creation date descending
   */
  async listAssistants(userId?: string): Promise<ChatAssistant[]> {
    // Build filter based on optional userId
    const filter = userId ? { created_by: userId } : undefined
    return ModelFactory.chatAssistant.findAll(filter, { orderBy: { created_at: 'desc' } })
  }

  /**
   * @description List assistants accessible to a user based on RBAC rules, with pagination and search.
   * Admins see all assistants. Other users see assistants they created,
   * public assistants, and assistants shared with them or their teams.
   * @param {string} userId - UUID of the requesting user
   * @param {string} userRole - Role of the requesting user (e.g., 'admin', 'user')
   * @param {string[]} teamIds - Array of team UUIDs the user belongs to
   * @param {object} options - Pagination, search, and sort options
   * @returns {Promise<{ data: ChatAssistant[]; total: number }>} Paginated result with data array and total count
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

    // Apply RBAC filtering (admins see all, others see owned + public + shared)
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPERADMIN) {
      // Get assistant IDs the user has been explicitly granted access to
      const accessibleIds = await ModelFactory.chatAssistantAccess.findAccessibleAssistantIds(userId, teamIds)

      return ModelFactory.chatAssistant.findAccessiblePaginated({
        userId,
        accessibleIds,
        search: options.search,
        sortBy,
        sortOrder,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })
    }

    // Admin path: no RBAC filtering, just search + pagination
    return ModelFactory.chatAssistant.findAllPaginated({
      search: options.search,
      sortBy,
      sortOrder,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
  }

  /**
   * List only public assistants (for unauthenticated users).
   * @param options - Paging, sorting, and searching
   * @returns Paginated object with public assistants
   */
  async listPublicAssistants(
    options?: { page?: number; page_size?: number; search?: string; sort_by?: string; sort_order?: string }
  ): Promise<{ data: ChatAssistant[]; total: number }> {
    const page = Number(options?.page) || 1
    const pageSize = Number(options?.page_size) || 20
    const sortBy = options?.sort_by || 'created_at'
    const sortOrder = options?.sort_order || 'desc'

    // Delegate to model for public-only paginated query
    return ModelFactory.chatAssistant.findPublicPaginated({
      search: options?.search,
      sortBy,
      sortOrder,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    })
  }

  /**
   * @description Get access control entries for an assistant, enriched with display names.
   * Joins with users and teams tables to resolve entity names.
   * @param {string} assistantId - UUID of the assistant
   * @returns {Promise<Array<ChatAssistantAccess & { display_name?: string }>>} Array of access entries with display_name field
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

    // Batch fetch user display names via model method
    if (userIds.length > 0) {
      const users = await ModelFactory.user.findDisplayNamesByIds(userIds)
      for (const u of users) {
        userMap.set(u.id, u.display_name)
      }
    }

    // Batch fetch team names via model method
    if (teamIds.length > 0) {
      const teams = await ModelFactory.team.findNamesByIds(teamIds)
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
   * @description Set (bulk replace) access control entries for an assistant.
   * Removes all existing entries and inserts the provided ones.
   * @param {string} assistantId - UUID of the assistant
   * @param {Array<{ entity_type: 'user' | 'team'; entity_id: string }>} entries - Array of access entries to set
   * @param {string} userId - UUID of the user performing the operation
   * @returns {Promise<ChatAssistantAccess[]>} Array of newly created access entries
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
   * @description Check if a user has access to a specific assistant.
   * Admins always have access. Other users need to be the creator,
   * or the assistant must be public, or they must have an explicit grant.
   * @param {string} assistantId - UUID of the assistant
   * @param {string} userId - UUID of the user to check
   * @param {string} userRole - Role of the user
   * @param {string[]} teamIds - Array of team UUIDs the user belongs to
   * @returns {Promise<boolean>} True if the user can access the assistant
   */
  async checkUserAccess(
    assistantId: string,
    userId: string | undefined,
    userRole: string | undefined,
    teamIds: string[]
  ): Promise<boolean> {
    // Admins always have access
    if (userRole === UserRole.ADMIN || userRole === UserRole.SUPERADMIN) {
      return true
    }

    // Fetch the assistant to check ownership and public flag
    const assistant = await ModelFactory.chatAssistant.findById(assistantId)
    if (!assistant) {
      return false
    }

    // Public assistants are accessible to everyone (including anonymous)
    if (assistant.is_public) {
      return true
    }

    // Anonymous users cannot access non-public assistants
    if (!userId) {
      return false
    }

    // Creator always has access to their own assistant
    if (assistant.created_by === userId) {
      return true
    }

    // Check explicit access grants for user or their teams
    const accessibleIds = await ModelFactory.chatAssistantAccess.findAccessibleAssistantIds(userId, teamIds)
    return accessibleIds.includes(assistantId)
  }

  /**
   * @description Update an existing assistant configuration.
   * @param {string} assistantId - UUID of the assistant to update
   * @param {Partial<Pick<ChatAssistant, 'name' | 'description' | 'icon' | 'kb_ids' | 'llm_id' | 'prompt_config' | 'is_public'>>} data - Partial assistant data to update
   * @param {string} userId - ID of the user performing the update
   * @returns {Promise<ChatAssistant | undefined>} The updated ChatAssistant if found, undefined otherwise
   */
  async updateAssistant(
    assistantId: string,
    data: Partial<Pick<ChatAssistant, 'name' | 'description' | 'icon' | 'kb_ids' | 'llm_id' | 'prompt_config' | 'is_public'>>,
    userId: string
  ): Promise<ChatAssistant | undefined> {
    // Stringify JSONB columns before update
    const updateData: Record<string, unknown> = { ...data, updated_by: userId }
    if (data.kb_ids !== undefined) updateData.kb_ids = JSON.stringify(data.kb_ids)
    if (data.prompt_config !== undefined) updateData.prompt_config = JSON.stringify(data.prompt_config)

    // Update record with updated_by tracking
    const updated = await ModelFactory.chatAssistant.update(assistantId, updateData as Partial<ChatAssistant>)

    if (updated) {
      log.info('Chat assistant updated', { assistantId, userId })
    }
    return updated
  }

  /**
   * @description Delete an assistant by ID.
   * @param {string} assistantId - UUID of the assistant to delete
   * @returns {Promise<void>}
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    await ModelFactory.chatAssistant.delete(assistantId)
    log.info('Chat assistant deleted', { assistantId })
  }
}

/** Singleton instance of the chat assistant service */
export const chatAssistantService = new ChatAssistantService()
