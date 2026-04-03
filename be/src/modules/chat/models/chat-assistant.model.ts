
/**
 * Chat assistant model: stores chat assistant configurations.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ChatAssistant } from '@/shared/models/types.js'

/**
 * @description ChatAssistantModel — represents the 'chat_assistants' table.
 * Manages assistant configurations for chat features including knowledge base
 * associations, LLM settings, and prompt configuration.
 */
export class ChatAssistantModel extends BaseModel<ChatAssistant> {
  /** Table name in the database */
  protected tableName = 'chat_assistants'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Remove a dataset ID from the kb_ids JSONB array of all chat assistants
   * that reference it. Used during dataset deletion to clean stale references.
   * @param {string} datasetId - Dataset UUID to remove from kb_ids
   * @returns {Promise<number>} Number of assistants updated
   */
  /**
   * @description Find an assistant by name using case-insensitive matching.
   * Used to enforce name uniqueness during creation.
   * @param {string} name - Assistant name to search for
   * @returns {Promise<ChatAssistant | undefined>} The matching assistant if found
   */
  async findByNameCaseInsensitive(name: string): Promise<ChatAssistant | undefined> {
    return this.knex(this.tableName)
      .whereRaw('LOWER(name) = LOWER(?)', [name])
      .first()
  }

  /**
   * @description List assistants accessible to a user with RBAC filtering, search, and pagination.
   * Returns assistants the user created, public ones, and those shared via access control.
   * @param {object} params - Query parameters
   * @param {string} params.userId - UUID of the requesting user
   * @param {string[]} params.accessibleIds - Assistant IDs the user has been granted access to
   * @param {string} [params.search] - Optional search term for name/description
   * @param {string} params.sortBy - Column to sort by
   * @param {string} params.sortOrder - Sort direction ('asc' or 'desc')
   * @param {number} params.limit - Page size
   * @param {number} params.offset - Number of records to skip
   * @returns {Promise<{ data: ChatAssistant[]; total: number }>} Paginated result with data and total count
   */
  async findAccessiblePaginated(params: {
    userId: string
    accessibleIds: string[]
    search?: string | undefined
    sortBy: string
    sortOrder: string
    limit: number
    offset: number
  }): Promise<{ data: ChatAssistant[]; total: number }> {
    // Build base query with RBAC filtering
    let query = this.knex(this.tableName).where(function () {
      // User's own assistants
      this.where('created_by', params.userId)
      // Public assistants
      this.orWhere('is_public', true)
      // Assistants shared via access control entries
      if (params.accessibleIds.length > 0) {
        this.orWhereIn('id', params.accessibleIds)
      }
    })

    // Apply search filter (case-insensitive on name and description)
    if (params.search) {
      query = query.andWhere(function () {
        this.whereILike('name', `%${params.search}%`)
          .orWhereILike('description', `%${params.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await query.clone().count('* as count').first()
    const total = Number(countResult?.count ?? 0)

    // Apply sort and pagination
    const data = await query
      .orderBy(params.sortBy, params.sortOrder)
      .limit(params.limit)
      .offset(params.offset)

    return { data, total }
  }

  /**
   * @description List all assistants with optional search, sorting, and pagination.
   * Used by admins who can see all assistants without RBAC filtering.
   * @param {object} params - Query parameters
   * @param {string} [params.search] - Optional search term for name/description
   * @param {string} params.sortBy - Column to sort by
   * @param {string} params.sortOrder - Sort direction ('asc' or 'desc')
   * @param {number} params.limit - Page size
   * @param {number} params.offset - Number of records to skip
   * @returns {Promise<{ data: ChatAssistant[]; total: number }>} Paginated result with data and total count
   */
  async findAllPaginated(params: {
    search?: string | undefined
    sortBy: string
    sortOrder: string
    limit: number
    offset: number
  }): Promise<{ data: ChatAssistant[]; total: number }> {
    // Build base query without RBAC filtering (admin view)
    let query = this.knex(this.tableName)

    // Apply search filter (case-insensitive on name and description)
    if (params.search) {
      query = query.where(function () {
        this.whereILike('name', `%${params.search}%`)
          .orWhereILike('description', `%${params.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await query.clone().count('* as count').first()
    const total = Number(countResult?.count ?? 0)

    // Apply sort and pagination
    const data = await query
      .orderBy(params.sortBy, params.sortOrder)
      .limit(params.limit)
      .offset(params.offset)

    return { data, total }
  }

  /**
   * @description List public assistants with optional search, sorting, and pagination.
   * Used for unauthenticated access to publicly shared assistants.
   * @param {object} params - Query parameters
   * @param {string} [params.search] - Optional search term for name/description
   * @param {string} params.sortBy - Column to sort by
   * @param {string} params.sortOrder - Sort direction ('asc' or 'desc')
   * @param {number} params.limit - Page size
   * @param {number} params.offset - Number of records to skip
   * @returns {Promise<{ data: ChatAssistant[]; total: number }>} Paginated result with data and total count
   */
  async findPublicPaginated(params: {
    search?: string | undefined
    sortBy: string
    sortOrder: string
    limit: number
    offset: number
  }): Promise<{ data: ChatAssistant[]; total: number }> {
    // Only return public assistants
    let query = this.knex(this.tableName).where('is_public', true)

    // Apply search filter (case-insensitive on name and description)
    if (params.search) {
      query = query.andWhere(function () {
        this.whereILike('name', `%${params.search}%`)
          .orWhereILike('description', `%${params.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await query.clone().count('* as count').first()
    const total = Number(countResult?.count ?? 0)

    // Apply sort and pagination
    const data = await query
      .orderBy(params.sortBy, params.sortOrder)
      .limit(params.limit)
      .offset(params.offset)

    return { data, total }
  }

  async removeDatasetReference(datasetId: string): Promise<number> {
    // Remove dataset ID from kb_ids JSONB array in a single query using PG array subtraction.
    // jsonb_build_array wraps the ID so the - operator removes it from the array.
    const affected = await this.knex(this.tableName)
      .whereRaw('kb_ids @> ?::jsonb', [JSON.stringify([datasetId])])
      .update({
        kb_ids: this.knex.raw('kb_ids - ?', [datasetId]),
      })

    return affected
  }
}
