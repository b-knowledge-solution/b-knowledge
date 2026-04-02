
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
