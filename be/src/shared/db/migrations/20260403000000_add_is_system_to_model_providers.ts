import type { Knex } from 'knex'

/**
 * @description Add is_system boolean flag to model_providers table.
 * System-managed providers (e.g., SentenceTransformers from LOCAL_EMBEDDING_MODEL env)
 * are auto-seeded by the backend startup hook and should not be editable in the UI.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('model_providers', (table) => {
    // Flag to distinguish system-managed providers from user-created ones
    table.boolean('is_system').notNullable().defaultTo(false)
  })
}

/**
 * @description Remove is_system column from model_providers table.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('model_providers', (table) => {
    table.dropColumn('is_system')
  })
}
