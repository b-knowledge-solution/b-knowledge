/**
 * @fileoverview Service for project search app configuration management.
 * @module services/project-search
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { ProjectSearch, UserContext } from '@/shared/models/types.js'

/**
 * @description Service handling CRUD operations for project search app configurations
 */
export class ProjectSearchService {
  /**
   * @description List all search app configurations for a project
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectSearch[]>} Array of project search records
   */
  async listSearches(projectId: string): Promise<ProjectSearch[]> {
    return ModelFactory.projectSearch.findByProjectId(projectId)
  }

  /**
   * @description Retrieve a single search app configuration by its UUID
   * @param {string} searchId - UUID of the search app
   * @returns {Promise<ProjectSearch | undefined>} Search record or undefined if not found
   */
  async getSearchById(searchId: string): Promise<ProjectSearch | undefined> {
    return ModelFactory.projectSearch.findById(searchId)
  }

  /**
   * @description Create a new project search app with serialized JSON configurations
   * @param {string} projectId - UUID of the project
   * @param {any} data - Search creation data including name, dataset_ids, search_config
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<ProjectSearch>} Created search record
   */
  async createSearch(projectId: string, data: any, user: UserContext): Promise<ProjectSearch> {
    return ModelFactory.projectSearch.create({
      project_id: projectId,
      name: data.name,
      description: data.description || null,
      // Serialize array and object fields as JSON strings for storage
      dataset_ids: JSON.stringify(data.dataset_ids || []),
      ragflow_dataset_ids: JSON.stringify(data.ragflow_dataset_ids || []),
      search_config: JSON.stringify(data.search_config || {}),
      status: 'active',
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * @description Update a project search app with partial data
   * @param {string} searchId - UUID of the search app
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<ProjectSearch | undefined>} Updated search record or undefined if not found
   */
  async updateSearch(searchId: string, data: any, user: UserContext): Promise<ProjectSearch | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    // Serialize array and object fields as JSON strings if provided
    if (data.dataset_ids !== undefined) updateData.dataset_ids = JSON.stringify(data.dataset_ids)
    if (data.ragflow_dataset_ids !== undefined) updateData.ragflow_dataset_ids = JSON.stringify(data.ragflow_dataset_ids)
    if (data.search_config !== undefined) updateData.search_config = JSON.stringify(data.search_config)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.projectSearch.update(searchId, updateData)
  }

  /**
   * @description Delete a project search app by its UUID
   * @param {string} searchId - UUID of the search app
   * @returns {Promise<void>}
   */
  async deleteSearch(searchId: string): Promise<void> {
    await ModelFactory.projectSearch.delete(searchId)
  }
}

/** Singleton instance */
export const projectSearchService = new ProjectSearchService()
