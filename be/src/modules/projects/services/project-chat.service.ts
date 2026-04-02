/**
 * @fileoverview Service for project chat configuration management.
 * @module services/project-chat
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { ProjectChat, UserContext } from '@/shared/models/types.js'

/**
 * @description Service handling CRUD operations for project chat assistant configurations
 */
export class ProjectChatService {
  /**
   * @description List all chat assistant configurations for a project
   * @param {string} projectId - UUID of the project
   * @returns {Promise<ProjectChat[]>} Array of project chat records
   */
  async listChats(projectId: string): Promise<ProjectChat[]> {
    return ModelFactory.projectChat.findByProjectId(projectId)
  }

  /**
   * @description Retrieve a single chat assistant configuration by its UUID
   * @param {string} chatId - UUID of the chat
   * @returns {Promise<ProjectChat | undefined>} Chat record or undefined if not found
   */
  async getChatById(chatId: string): Promise<ProjectChat | undefined> {
    return ModelFactory.projectChat.findById(chatId)
  }

  /**
   * @description Create a new project chat assistant with serialized JSON configurations
   * @param {string} projectId - UUID of the project
   * @param {any} data - Chat creation data including name, dataset_ids, llm_config, prompt_config
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<ProjectChat>} Created chat record
   */
  async createChat(projectId: string, data: any, user: UserContext): Promise<ProjectChat> {
    return ModelFactory.projectChat.create({
      project_id: projectId,
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
   * @description Update a project chat assistant with partial data
   * @param {string} chatId - UUID of the chat
   * @param {any} data - Partial update data
   * @param {UserContext} user - Authenticated user context
   * @returns {Promise<ProjectChat | undefined>} Updated chat record or undefined if not found
   */
  async updateChat(chatId: string, data: any, user: UserContext): Promise<ProjectChat | undefined> {
    // Build update payload including only provided fields
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    // Serialize array and object fields as JSON strings if provided
    if (data.dataset_ids !== undefined) updateData.dataset_ids = JSON.stringify(data.dataset_ids)
    if (data.ragflow_dataset_ids !== undefined) updateData.ragflow_dataset_ids = JSON.stringify(data.ragflow_dataset_ids)
    if (data.llm_config !== undefined) updateData.llm_config = JSON.stringify(data.llm_config)
    if (data.prompt_config !== undefined) updateData.prompt_config = JSON.stringify(data.prompt_config)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.projectChat.update(chatId, updateData)
  }

  /**
   * @description Delete a project chat assistant by its UUID
   * @param {string} chatId - UUID of the chat
   * @returns {Promise<void>}
   */
  async deleteChat(chatId: string): Promise<void> {
    await ModelFactory.projectChat.delete(chatId)
  }
}

/** Singleton instance */
export const projectChatService = new ProjectChatService()
