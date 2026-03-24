
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
  async removeDatasetReference(datasetId: string): Promise<number> {
    // Find all search apps whose dataset_ids array contains the dataset ID
    const affected = await this.knex(this.tableName)
      .whereRaw('dataset_ids @> ?::jsonb', [JSON.stringify([datasetId])])
      .select('id', 'dataset_ids')

    // Update each row, filtering out the deleted dataset ID
    for (const row of affected) {
      const updatedIds = (row.dataset_ids as string[]).filter((dsId: string) => dsId !== datasetId)
      await this.knex(this.tableName)
        .where('id', row.id)
        .update({ dataset_ids: JSON.stringify(updatedIds) })
    }

    return affected.length
  }
}
