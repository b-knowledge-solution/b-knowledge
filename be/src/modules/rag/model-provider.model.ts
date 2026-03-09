import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ModelProvider } from '@/shared/models/types.js'

export class ModelProviderModel extends BaseModel<ModelProvider> {
  protected tableName = 'model_providers'
  protected knex = db

  async findDefaults(): Promise<ModelProvider[]> {
    return this.knex(this.tableName)
      .where('is_default', true)
      .where('status', 'active')
  }
}
