
/**
 * Search app model: stores saved search application configurations.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { SearchApp } from '@/shared/models/types.js'

/**
 * @description Model for the search_apps table, providing CRUD operations
 *   for saved search application configurations including dataset references and LLM settings
 */
export class SearchAppModel extends BaseModel<SearchApp> {
  /** Table name in the database */
  protected tableName = 'search_apps'
  /** Knex connection instance */
  protected knex = db

  /**
   * @description Remove a dataset ID from the dataset_ids JSONB array of all search apps
   * that reference it. Used during dataset deletion to clean stale references.
   * @param {string} datasetId - Dataset UUID to remove from dataset_ids
   * @returns {Promise<number>} Number of search apps updated
   */
  /**
   * @description List search apps accessible to a user with RBAC filtering, search, sorting, and pagination.
   *   Admins see all apps. Non-admins see their own apps, public apps, and shared apps (by ID list).
   * @param {object} params - Query parameters
   * @param {string} [params.userId] - UUID of the requesting user (omit for admin access)
   * @param {string[]} [params.accessibleIds] - IDs the user has been granted access to via search_app_access
   * @param {boolean} [params.adminAccess] - If true, skip RBAC filters (admin/superadmin)
   * @param {string} [params.search] - Optional search string for name/description (ilike)
   * @param {string} [params.sortBy] - Column to sort by (default: 'created_at')
   * @param {string} [params.sortOrder] - Sort direction 'asc' | 'desc' (default: 'desc')
   * @param {number} [params.page] - Page number (1-indexed, default: 1)
   * @param {number} [params.pageSize] - Items per page (default: 20)
   * @returns {Promise<{ data: SearchApp[]; total: number }>} Paginated search apps with total count
   */
  async findAccessiblePaginated(params: {
    userId?: string
    accessibleIds?: string[]
    adminAccess?: boolean
    search?: string
    sortBy?: string
    sortOrder?: string
    page?: number
    pageSize?: number
  }): Promise<{ data: SearchApp[]; total: number }> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    // Build base query with optional RBAC filters
    let baseQuery = this.knex(this.tableName)

    // Non-admin users only see own + public + explicitly shared apps
    if (!params.adminAccess && params.userId) {
      baseQuery = baseQuery.where(function (this: any) {
        this.where('created_by', params.userId)
        this.orWhere('is_public', true)
        if (params.accessibleIds && params.accessibleIds.length > 0) {
          this.orWhereIn('id', params.accessibleIds)
        }
      })
    }

    // Apply search filter on name and description
    if (params.search) {
      baseQuery = baseQuery.andWhere(function (this: any) {
        this.where('name', 'ilike', `%${params.search}%`)
          .orWhere('description', 'ilike', `%${params.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await baseQuery.clone().clearSelect().clearOrder().count('* as count').first()
    const total = Number((countResult as any)?.count || 0)

    // Apply sort and pagination
    const data = await baseQuery
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { data, total }
  }

  /**
   * @description List only public search apps with search, sorting, and pagination.
   * @param {object} params - Query parameters
   * @param {string} [params.search] - Optional search string for name/description (ilike)
   * @param {string} [params.sortBy] - Column to sort by (default: 'created_at')
   * @param {string} [params.sortOrder] - Sort direction 'asc' | 'desc' (default: 'desc')
   * @param {number} [params.page] - Page number (1-indexed, default: 1)
   * @param {number} [params.pageSize] - Items per page (default: 20)
   * @returns {Promise<{ data: SearchApp[]; total: number }>} Paginated public apps with total count
   */
  async findPublicPaginated(params: {
    search?: string
    sortBy?: string
    sortOrder?: string
    page?: number
    pageSize?: number
  }): Promise<{ data: SearchApp[]; total: number }> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20
    const sortBy = params.sortBy || 'created_at'
    const sortOrder = params.sortOrder || 'desc'

    // Only return public apps
    let baseQuery = this.knex(this.tableName).where('is_public', true)

    // Apply search filter on name and description
    if (params.search) {
      baseQuery = baseQuery.andWhere(function (this: any) {
        this.where('name', 'ilike', `%${params.search}%`)
          .orWhere('description', 'ilike', `%${params.search}%`)
      })
    }

    // Count total before pagination
    const countResult = await baseQuery.clone().clearSelect().clearOrder().count('* as count').first()
    const total = Number((countResult as any)?.count || 0)

    // Apply sort and pagination
    const data = await baseQuery
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset((page - 1) * pageSize)

    return { data, total }
  }

  async removeDatasetReference(datasetId: string): Promise<number> {
    // Remove dataset ID from dataset_ids JSONB array in a single query using PG array subtraction.
    // The - operator on a JSONB array removes the matching string element.
    const affected = await this.knex(this.tableName)
      .whereRaw('dataset_ids @> ?::jsonb', [JSON.stringify([datasetId])])
      .update({
        dataset_ids: this.knex.raw('dataset_ids - ?', [datasetId]),
      })

    return affected
  }
}
