/**
 * @fileoverview Service for project chat configuration management.
 * @module services/project-chat
 */
import { ModelFactory } from '@/shared/models/factory.js'
import { log } from '@/shared/services/logger.service.js'
import { ProjectChat, UserContext } from '@/shared/models/types.js'

/**
 * ProjectChatService handles CRUD for project chat assistants.
 */
export class ProjectChatService {
  /**
   * List all chats for a project.
   * @param projectId - UUID of the project
   * @returns Array of project chat records
   */
  async listChats(projectId: string): Promise<ProjectChat[]> {
    return ModelFactory.projectChat.findByProjectId(projectId)
  }

  /**
   * Get a single chat by ID.
   * @param chatId - UUID of the chat
   * @returns Chat record or undefined
   */
  async getChatById(chatId: string): Promise<ProjectChat | undefined> {
    return ModelFactory.projectChat.findById(chatId)
  }

  /**
   * Create a new project chat assistant.
   * @param projectId - UUID of the project
   * @param data - Chat creation data
   * @param user - Authenticated user context
   * @returns Created chat record
   */
  async createChat(projectId: string, data: any, user: UserContext): Promise<ProjectChat> {
    return ModelFactory.projectChat.create({
      project_id: projectId,
      name: data.name,
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
   * Update a project chat assistant.
   * @param chatId - UUID of the chat
   * @param data - Partial update data
   * @param user - Authenticated user context
   * @returns Updated chat record or undefined
   */
  async updateChat(chatId: string, data: any, user: UserContext): Promise<ProjectChat | undefined> {
    const updateData: any = { updated_by: user.id }
    if (data.name !== undefined) updateData.name = data.name
    if (data.dataset_ids !== undefined) updateData.dataset_ids = JSON.stringify(data.dataset_ids)
    if (data.ragflow_dataset_ids !== undefined) updateData.ragflow_dataset_ids = JSON.stringify(data.ragflow_dataset_ids)
    if (data.llm_config !== undefined) updateData.llm_config = JSON.stringify(data.llm_config)
    if (data.prompt_config !== undefined) updateData.prompt_config = JSON.stringify(data.prompt_config)
    if (data.status !== undefined) updateData.status = data.status

    return ModelFactory.projectChat.update(chatId, updateData)
  }

  /**
   * Delete a project chat by ID.
   * @param chatId - UUID of the chat
   */
  async deleteChat(chatId: string): Promise<void> {
    await ModelFactory.projectChat.delete(chatId)
  }
}

/** Singleton instance */
export const projectChatService = new ProjectChatService()
