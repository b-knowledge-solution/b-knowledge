/**
 * @fileoverview Data access layer for the shared tenant_llm table consumed by Python task executors.
 * @module modules/llm-provider/models/tenant-llm
 */
import { BaseModel } from "@/shared/models/base.model.js";
import { db } from "@/shared/db/knex.js";
import { TenantLlm, ModelProvider } from "@/shared/models/types.js";

// RAGFlow stores tenant_id as a 32-char hex string (UUID without hyphens)
const SYSTEM_TENANT_ID = (
  process.env["SYSTEM_TENANT_ID"] || "00000000000000000000000000000001"
).replace(/-/g, "");

/**
 * @description Provides CRUD access to the shared tenant_llm table consumed by Python task executors for LLM provider configs.
 * Follows the Factory Pattern -- instantiated as a singleton via ModelFactory.
 */
export class TenantLlmModel extends BaseModel<TenantLlm> {
  protected tableName = "tenant_llm";
  protected knex = db;

  /**
   * @description Find an existing tenant_llm row by the composite business key (tenant_id + factory + model)
   * @param {string} tenantId - Tenant ID (32-char hex string)
   * @param {string} llmFactory - Provider factory name (e.g., 'OpenAI')
   * @param {string} llmName - Model identifier (e.g., 'gpt-4o')
   * @returns {Promise<TenantLlm | undefined>} The matching row if found, undefined otherwise
   */
  async findByKey(
    tenantId: string,
    llmFactory: string,
    llmName: string,
  ): Promise<TenantLlm | undefined> {
    // Query by the three-part composite key used to identify a unique provider config
    return this.knex(this.tableName)
      .where({
        tenant_id: tenantId,
        llm_factory: llmFactory,
        llm_name: llmName,
      })
      .first();
  }

  /**
   * @description Sync a model provider config to the shared tenant_llm table consumed by Python task executors
   * @param {ModelProvider} provider - The model provider record to sync
   * @returns {Promise<void>}
   */
  async syncFromProvider(provider: ModelProvider): Promise<void> {
    // Look up an existing row using the composite business key
    const existing = await this.findByKey(
      SYSTEM_TENANT_ID,
      provider.factory_name,
      provider.model_name,
    );

    // Build the shared row payload from provider fields
    // Note: do NOT set `id` — it is an auto-increment integer managed by Postgres
    const row = {
      tenant_id: SYSTEM_TENANT_ID,
      llm_factory: provider.factory_name,
      model_type: provider.model_type,
      llm_name: provider.model_name,
      api_key: provider.api_key || "",
      api_base: provider.api_base || "",
      max_tokens: provider.max_tokens || 0,
      used_tokens: 0,
      vision: provider.vision || false,
    };

    if (existing) {
      // Update in-place when the row already exists
      await this.update({ id: existing.id }, row);
    } else {
      // Insert a new row — Postgres auto-increments the id column
      await this.create(row);
    }
  }

  /**
   * @description Remove tenant_llm row(s) for a soft-deleted provider so Python workers stop using it
   * @param {ModelProvider} provider - The model provider being deleted
   * @returns {Promise<void>}
   */
  async deleteByProvider(provider: ModelProvider): Promise<void> {
    // Delete by composite business key rather than by id
    await this.delete({
      tenant_id: SYSTEM_TENANT_ID,
      llm_factory: provider.factory_name,
      llm_name: provider.model_name,
    } as Partial<TenantLlm>);
  }
}
