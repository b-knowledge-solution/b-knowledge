/**
 * @fileoverview Add model_type to the model_providers unique index.
 *
 * The old index enforced unique (tenant_id, factory_name, model_name) for active rows.
 * This prevented creating a separate `image2text` row for a vision-capable chat model
 * that shares the same name. The new index includes model_type so each model can have
 * one active row per type (e.g., chat + image2text).
 */
import { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Drop the old unique index (tenant_id, factory_name, model_name)
  await knex.raw('DROP INDEX IF EXISTS model_providers_tenant_factory_model_active_unique')

  // Create new unique index including model_type
  await knex.raw(`
    CREATE UNIQUE INDEX model_providers_tenant_factory_type_model_active_unique
    ON model_providers (tenant_id, factory_name, model_name, model_type)
    WHERE status = 'active'
  `)
}

export async function down(knex: Knex): Promise<void> {
  // Drop the new index
  await knex.raw('DROP INDEX IF EXISTS model_providers_tenant_factory_type_model_active_unique')

  // Restore the old index
  await knex.raw(`
    CREATE UNIQUE INDEX model_providers_tenant_factory_model_active_unique
    ON model_providers (tenant_id, factory_name, model_name)
    WHERE status = 'active'
  `)
}
