
/**
 * @fileoverview Connector model for managing external data source connections.
 * @description Provides CRUD operations for the connectors table via Knex.
 * @module modules/sync/models/connector
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Connector } from './sync.types.js'

/**
 * ConnectorModel class for the 'connectors' table.
 * @description Extends BaseModel to inherit standard CRUD operations.
 */
export class ConnectorModel extends BaseModel<Connector> {
  protected tableName = 'connectors'
  protected knex = db
}
