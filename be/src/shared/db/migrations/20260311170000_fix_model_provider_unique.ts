/**
 * @fileoverview Fix model_providers unique constraint to include model_type.
 *
 * @description
 * The original unique constraint was on (factory_name, model_name) only.
 * This prevented creating an image2text sibling provider that shares the
 * same factory + model name as a chat provider (used by the "Supports Vision"
 * checkbox). This migration widens the constraint to (factory_name, model_type,
 * model_name) so that different model_type rows can coexist.
 *
 * Uses raw SQL to look up the actual constraint name in pg_constraint
 * because Knex's dropUnique generates a name that may not match.
 */
import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  // Look up the actual constraint name from pg_constraint
  // The old unique index covers exactly (factory_name, model_name) — 2 columns
  const { rows } = await knex.raw(`
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'model_providers'
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 2
    LIMIT 1
  `)

  // Drop the old two-column unique constraint if found
  if (rows.length > 0) {
    const constraintName = rows[0].conname
    await knex.raw(`ALTER TABLE model_providers DROP CONSTRAINT "${constraintName}"`)
  }

  // Create the new three-column unique constraint
  await knex.schema.alterTable('model_providers', (table) => {
    table.unique(['factory_name', 'model_type', 'model_name'])
  })
}

export async function down(knex: Knex): Promise<void> {
  // Look up the three-column unique constraint
  const { rows } = await knex.raw(`
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'model_providers'
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 3
    LIMIT 1
  `)

  // Drop the three-column unique constraint if found
  if (rows.length > 0) {
    const constraintName = rows[0].conname
    await knex.raw(`ALTER TABLE model_providers DROP CONSTRAINT "${constraintName}"`)
  }

  // Restore the original two-column unique constraint
  await knex.schema.alterTable('model_providers', (table) => {
    table.unique(['factory_name', 'model_name'])
  })
}
