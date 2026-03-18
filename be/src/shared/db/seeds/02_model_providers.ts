/**
 * @fileoverview Seed default LLM model providers for local Ollama development.
 *
 * Creates two model provider entries:
 *   - qwen3.5:4b (chat, default, vision-capable)
 *   - qwen3-embedding:4b (embedding, default)
 *
 * Skips insertion if rows with matching (tenant_id, factory_name, model_name) already exist.
 *
 * @example
 * Run seed: npm run db:seed
 */
import { Knex } from 'knex'
import { config } from '@/shared/config/index.js'

const SYSTEM_TENANT_ID = config.opensearch.systemTenantId

export async function seed(knex: Knex): Promise<void> {
  const providers = [
    {
      factory_name: 'Ollama',
      model_type: 'chat',
      model_name: 'qwen3.5:4b',
      api_base: 'http://localhost:11434',
      max_tokens: 32489,
      vision: true,
      is_default: true,
      status: 'active',
      tenant_id: SYSTEM_TENANT_ID,
      used_tokens: 0,
    },
    {
      factory_name: 'Ollama',
      model_type: 'embedding',
      model_name: 'qwen3-embedding:4b',
      api_base: 'http://localhost:11434',
      max_tokens: 32489,
      vision: false,
      is_default: true,
      status: 'active',
      tenant_id: SYSTEM_TENANT_ID,
      used_tokens: 0,
    },
  ]

  for (const provider of providers) {
    // Skip if already exists (idempotent)
    const existing = await knex('model_providers')
      .where({
        tenant_id: provider.tenant_id,
        factory_name: provider.factory_name,
        model_name: provider.model_name,
      })
      .whereNot('status', 'deleted')
      .first()

    if (!existing) {
      await knex('model_providers').insert(provider)
    }
  }
}
