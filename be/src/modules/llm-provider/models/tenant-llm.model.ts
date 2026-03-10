import { BaseModel } from "@/shared/models/base.model.js";
import { db } from "@/shared/db/knex.js";
import { TenantLlm, ModelProvider } from "@/shared/models/types.js";

const SYSTEM_TENANT_ID =
  process.env["SYSTEM_TENANT_ID"] || "00000000-0000-0000-0000-000000000001";

/**
 * TenantLlmModel provides CRUD access to the shared 'tenant_llm' table.
 * This table is consumed by Python task executors to load LLM provider configs.
 * Follows the Factory Pattern — instantiated as a singleton via ModelFactory.
 */
export class TenantLlmModel extends BaseModel<TenantLlm> {
  protected tableName = "tenant_llm";
  protected knex = db;

  /**
   * Find an existing tenant_llm row by the composite business key.
   * @param tenantId - Tenant UUID
   * @param llmFactory - Provider factory name (e.g., 'OpenAI')
   * @param llmName - Model identifier (e.g., 'gpt-4o')
   * @returns The matching row if found, undefined otherwise
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
   * Sync a model provider config to the shared tenant_llm table
   * that the Python task executors read from.
   * @param provider - The model provider record to sync
   */
  async syncFromProvider(provider: ModelProvider): Promise<void> {
    // Look up an existing row using the composite business key
    const existing = await this.findByKey(
      SYSTEM_TENANT_ID,
      provider.factory_name,
      provider.model_name,
    );

    // Build the shared row payload from provider fields
    const row = {
      tenant_id: SYSTEM_TENANT_ID,
      llm_factory: provider.factory_name,
      model_type: provider.model_type,
      llm_name: provider.model_name,
      api_key: provider.api_key || "",
      api_base: provider.api_base || "",
      max_tokens: provider.max_tokens || 0,
    };

    if (existing) {
      // Update in-place when the row already exists
      await this.update({ id: existing.id }, row);
    } else {
      // Insert a new row with a generated hex UUID (no hyphens, matching ragflow convention)
      await this.create({
        ...row,
        id: crypto.randomUUID().replace(/-/g, ""),
      });
    }
  }
}
