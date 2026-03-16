
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
}
