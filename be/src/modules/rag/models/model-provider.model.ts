/**
 * @fileoverview ModelProvider model — CRUD for the model_providers table.
 * @module modules/rag/models/model-provider
 */
import { BaseModel } from '@/shared/models/base.model.js'
import { db } from '@/shared/db/knex.js'
import { ModelProvider } from '@/shared/models/types.js'
import { ProviderStatus } from '@/shared/constants/index.js'

/**
 * @description Provides data access for the model_providers table, which stores
 * LLM, embedding, and rerank provider configurations.
 */
export class ModelProviderModel extends BaseModel<ModelProvider> {
  protected tableName = 'model_providers'
  protected knex = db

  /**
   * @description Find all default active model providers across all model types
   * @returns {Promise<ModelProvider[]>} Array of default active ModelProvider records
   */
  async findDefaults(): Promise<ModelProvider[]> {
    return this.knex(this.tableName)
      .where('is_default', true)
      .where('status', ProviderStatus.ACTIVE)
  }

  /**
   * @description Find a model provider by its model_name field
   * @param {string} modelName - The model name to search for
   * @returns {Promise<ModelProvider | undefined>} The matching provider or undefined
   */
  async findByModelName(modelName: string): Promise<ModelProvider | undefined> {
    return this.knex(this.tableName)
      .where('model_name', modelName)
      .first()
  }

  /**
   * @description Find an active embedding provider by model name
   * @param {string} modelName - The embedding model name (e.g., "text-embedding-3-small")
   * @returns {Promise<ModelProvider | undefined>} The matching active embedding provider or undefined
   */
  async findActiveEmbeddingByModelName(modelName: string): Promise<ModelProvider | undefined> {
    return this.knex(this.tableName)
      .where('model_name', modelName)
      .where('model_type', 'embedding')
      .where('status', ProviderStatus.ACTIVE)
      .first()
  }

  /**
   * @description Clear the is_default flag for all active providers of a given model type,
   * excluding the specified provider. Used when marking a new provider as default.
   * @param {string} modelType - The model type to clear defaults for (e.g. 'chat', 'embedding')
   * @param {string} excludeId - Provider UUID to exclude from the update
   * @returns {Promise<void>}
   */
  async clearDefaultsByModelType(modelType: string, excludeId: string): Promise<void> {
    await this.knex(this.tableName)
      .where('model_type', modelType)
      .where('status', ProviderStatus.ACTIVE)
      .whereNot('id', excludeId)
      .update({ is_default: false })
  }

  /**
   * @description List active providers with safe fields only (no API keys), optionally filtered by model_type.
   * Used by config dialogs that do not require admin permission.
   * @param {string} [modelType] - Optional model type filter (e.g. 'chat', 'embedding', 'rerank')
   * @returns {Promise<Pick<ModelProvider, 'id' | 'factory_name' | 'model_type' | 'model_name' | 'max_tokens' | 'is_default' | 'vision'>[]>} Safe provider records without sensitive fields
   */
  async findPublicList(modelType?: string): Promise<Pick<ModelProvider, 'id' | 'factory_name' | 'model_type' | 'model_name' | 'max_tokens' | 'is_default' | 'vision'>[]> {
    // Only expose safe columns — never return api_key or api_base
    let query = this.knex(this.tableName)
      .select('id', 'factory_name', 'model_type', 'model_name', 'max_tokens', 'is_default', 'vision')
      .where('status', ProviderStatus.ACTIVE)
      .orderBy('factory_name')
      .orderBy('model_name')

    // Filter by model_type if provided
    if (modelType) {
      query = query.where('model_type', modelType)
    }

    return query
  }
}
