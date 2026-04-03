/**
 * @fileoverview QueryLog model for CRUD operations on the query_log table.
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { QueryLog } from '@/shared/models/types.js'

/**
 * @description Provides CRUD operations for the query_log table,
 *   which stores search and chat query events for analytics and observability
 * @extends BaseModel<QueryLog>
 */
export class QueryLogModel extends BaseModel<QueryLog> {
  protected tableName = 'query_log'
  protected knex = db
}
