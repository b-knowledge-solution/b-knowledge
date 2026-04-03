
/**
 * @fileoverview SyncLog model for tracking data source sync operations.
 * @description Provides CRUD operations for the sync_logs table via Knex.
 * @module modules/sync/models/sync-log
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { SyncLog } from './sync.types.js'

/**
 * SyncLogModel class for the 'sync_logs' table.
 * @description Extends BaseModel to inherit standard CRUD operations.
 */
export class SyncLogModel extends BaseModel<SyncLog> {
  protected tableName = 'sync_logs'
  protected knex = db
}
