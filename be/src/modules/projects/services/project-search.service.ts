/**
 * @fileoverview Service for project search app configuration management.
 * @module services/project-search
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { ProjectSearch, UserContext } from '@/shared/models/types.js'

/**
 * ProjectSearchService handles CRUD for project search apps.
 */
export class ProjectSearchService {
  /**
   * List all search apps for a project.
   * @param projectId - UUID of the project
   * @returns Array of project search records
   */
  async listSearches(projectId: string): Promise<ProjectSearch[]> {
    return ModelFactory.projectSearch.findByProjectId(projectId)
  }

  /**
   * Get a single search app by ID.
   * @param searchId - UUID of the search app
   * @returns Search record or undefined
   */
  async getSearchById(searchId: string): Promise<ProjectSearch | undefined> {
    return ModelFactory.projectSearch.findById(searchId)
  }

  /**
   * Create a new project search app.
   * @param projectId - UUID of the project
   * @param data - Search creation data
   * @param user - Authenticated user context
   * @returns Created search record
   */
  async createSearch(projectId: string, data: any, user: UserContext): Promise<ProjectSearch> {
    return ModelFactory.projectSearch.create({
      project_id: projectId,
      name: data.name,
      description: data.description || null,
      dataset_ids: JSON.stringify(data.dataset_ids || []),
      ragflow_dataset_ids: JSON.stringify(data.ragflow_dataset_ids || []),
      search_config: JSON.stringify(data.search_config || {}),
      status: 'active',
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * Update a project search app.
   * @param searchId - UUID of the search app
   * @param data - Partial update data
   * @param user - Authenticated user context
   * @returns Updated search record or undefined
   */
  async updateSearch(searchId: string, data: any, user: UserContext): Promise<ProjectSearch | undefined> {
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.dataset_ids !== undefined) updateData.dataset_ids = JSON.stringify(data.dataset_ids)
    if (data.ragflow_dataset_ids !== undefined) updateData.ragflow_dataset_ids = JSON.stringify(data.ragflow_dataset_ids)
    if (data.search_config !== undefined) updateData.search_config = JSON.stringify(data.search_config)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.projectSearch.update(searchId, updateData)
  }

  /**
   * Delete a project search app by ID.
   * @param searchId - UUID of the search app
   */
  async deleteSearch(searchId: string): Promise<void> {
    await ModelFactory.projectSearch.delete(searchId)
  }
}

/** Singleton instance */
export const projectSearchService = new ProjectSearchService()
