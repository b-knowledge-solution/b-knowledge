/**
 * @fileoverview Service for knowledge base chat configuration management.
 * @module services/knowledge-base-chat
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { KnowledgeBaseChat, UserContext } from '@/shared/models/types.js'

/**
 * @description Service handling CRUD operations for knowledge base chat assistant configurations
 */
export class KnowledgeBaseChatService {
  /**
   * @description List all chat assistant configurations for a knowledge base
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @returns {Promise<KnowledgeBaseChat[]>} Array of knowledge base chat records
   */
  async listChats(knowledgeBaseId: string): Promise<KnowledgeBaseChat[]> {
    return ModelFactory.knowledgeBaseChat.findByKnowledgeBaseId(knowledgeBaseId)
  }

  /**
   * @description Retrieve a single chat assistant configuration by its UUID
   * @param {string} chatId - UUID of the chat
   * @returns {Promise<KnowledgeBaseChat | undefined>} Chat record or undefined if not found
   */
  async getChatById(chatId: string): Promise<KnowledgeBaseChat | undefined> {
    return ModelFactory.knowledgeBaseChat.findById(chatId)
  }

  /**
   * @description Create a new knowledge base chat assistant with serialized JSON configurations
   * @param {string} knowledgeBaseId - UUID of the knowledge base
   * @param {any} data - Chat creation data including name, dataset_ids, llm_config, prompt_config
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBaseChat>} Created chat record
   */
  async createChat(knowledgeBaseId: string, data: any, user: UserContext): Promise<KnowledgeBaseChat> {
    return ModelFactory.knowledgeBaseChat.create({
      knowledge_base_id: knowledgeBaseId,
      name: data.name,
      // Serialize array and object fields as JSON strings for storage
      dataset_ids: JSON.stringify(data.dataset_ids || []),
      ragflow_dataset_ids: JSON.stringify(data.ragflow_dataset_ids || []),
      llm_config: JSON.stringify(data.llm_config || {}),
      prompt_config: JSON.stringify(data.prompt_config || {}),
      status: 'active',
      created_by: user.id,
      updated_by: user.id,
    })
  }

  /**
   * @description Update a knowledge base chat assistant with partial data
   * @param {string} chatId - UUID of the chat
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<KnowledgeBaseChat | undefined>} Updated chat record or undefined if not found
   */
  async updateChat(chatId: string, data: any, user: UserContext): Promise<KnowledgeBaseChat | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    // Serialize array and object fields as JSON strings if provided
    if (data.dataset_ids !== undefined) updateData.dataset_ids = JSON.stringify(data.dataset_ids)
    if (data.ragflow_dataset_ids !== undefined) updateData.ragflow_dataset_ids = JSON.stringify(data.ragflow_dataset_ids)
    if (data.llm_config !== undefined) updateData.llm_config = JSON.stringify(data.llm_config)
    if (data.prompt_config !== undefined) updateData.prompt_config = JSON.stringify(data.prompt_config)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.knowledgeBaseChat.update(chatId, updateData)
  }

  /**
   * @description Delete a knowledge base chat assistant by its UUID
   * @param {string} chatId - UUID of the chat
   * @returns {Promise<void>}
   */
  async deleteChat(chatId: string): Promise<void> {
    await ModelFactory.knowledgeBaseChat.delete(chatId)
  }
}

/** Singleton instance */
export const knowledgeBaseChatService = new KnowledgeBaseChatService()
