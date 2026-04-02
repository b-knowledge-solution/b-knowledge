/**
 * @fileoverview Service for knowledge base search app configuration management.
 * @module services/knowledge-base-search
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { KnowledgeBaseSearch, UserContext } from '@/shared/models/types.js'

/**
 * @description Service handling CRUD operations for knowledge base search app configurations
 */
export class KnowledgeBaseSearchService {
  /**
   * @description List all search app configurations for a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseSearch[]>} Array of knowledge base search records
   */
  async listSearches(knowledgeBaseId: string): Promise<KnowledgeBaseSearch[]> {
    return ModelFactory.knowledgeBaseSearch.findByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * @description Retrieve a single search app configuration by its UUID
   * @param {string} searchId - UUID of the search app
   * @returns {Promise<KnowledgeBaseSearch | undefined>} Search record or undefined if not found
   */
  async getSearchById(searchId: string): Promise<KnowledgeBaseSearch | undefined> {
    return ModelFactory.knowledgeBaseSearch.findById(searchId)
  }

  /**
   * @description Create a new knowledge base search app with serialized JSON configurations
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {any} data - Search creation data including name, dataset_ids, search_config
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBaseSearch>} Created search record
   */
  async createSearch(knowledgeBaseId: string, data: any, user: UserContext): Promise<KnowledgeBaseSearch> {
    return ModelFactory.knowledgeBaseSearch.create({
      knowledge_base_id: knowledgeBaseId,
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
   * @description Update a knowledge base search app with partial data
   * @param {string} searchId - UUID of the search app
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBaseSearch | undefined>} Updated search record or undefined if not found
   */
  async updateSearch(searchId: string, data: any, user: UserContext): Promise<KnowledgeBaseSearch | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    // Serialize array and object fields as JSON strings if provided
    if (data.dataset_ids !== undefined) updateData.dataset_ids = JSON.stringify(data.dataset_ids)
    if (data.ragflow_dataset_ids !== undefined) updateData.ragflow_dataset_ids = JSON.stringify(data.ragflow_dataset_ids)
    if (data.search_config !== undefined) updateData.search_config = JSON.stringify(data.search_config)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.knowledgeBaseSearch.update(searchId, updateData)
  }

  /**
   * @description Delete a knowledge base search app by its UUID
   * @param {string} searchId - UUID of the search app
   * @returns {Promise<void>}
   */
  async deleteSearch(searchId: string): Promise<void> {
    await ModelFactory.knowledgeBaseSearch.delete(searchId)
  }
}

/** Singleton instance */
export const knowledgeBaseSearchService = new KnowledgeBaseSearchService()
