
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
