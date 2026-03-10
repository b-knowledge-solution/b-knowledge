
/**
 * Search app model: stores saved search application configurations.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { SearchApp } from '@/shared/models/types.js'

/**
 * SearchAppModel
 * Represents the 'search_apps' table.
 * Manages search application CRUD operations.
 */
export class SearchAppModel extends BaseModel<SearchApp> {
  /** Table name in the database */
  protected tableName = 'search_apps'
  /** Knex connection instance */
  protected knex = db
}
