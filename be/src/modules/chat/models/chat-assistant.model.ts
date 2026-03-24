
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
    // Find all assistants whose kb_ids array contains the dataset ID
    const affected = await this.knex(this.tableName)
      .whereRaw('kb_ids @> ?::jsonb', [JSON.stringify([datasetId])])
      .select('id', 'kb_ids')

    // Update each row, filtering out the deleted dataset ID
    for (const row of affected) {
      const updatedKbIds = (row.kb_ids as string[]).filter((kbId: string) => kbId !== datasetId)
      await this.knex(this.tableName)
        .where('id', row.id)
        .update({ kb_ids: JSON.stringify(updatedKbIds) })
    }

    return affected.length
  }
}
