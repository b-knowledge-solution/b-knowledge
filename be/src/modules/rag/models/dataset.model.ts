import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { Dataset } from '@/shared/models/types.js'

export class DatasetModel extends BaseModel<Dataset> {
  protected tableName = 'datasets'
  protected knex = db
}
