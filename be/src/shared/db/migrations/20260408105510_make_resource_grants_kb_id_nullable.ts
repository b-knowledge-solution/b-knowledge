import type { Knex } from 'knex'

/**
 * @description Make `resource_grants.knowledge_base_id` nullable so that
 * DocumentCategory-level grants can be inserted without requiring a parent
 * knowledge base reference. Closes Phase 3 carry-forward IOU #2 and unblocks
 * Phase 5 P5.3 (D-08) which introduces a scope toggle between whole-KB grants
 * and category-level grants inside a single modal.
 *
 * The column was originally created as `text NOT NULL` (renamed from
 * `project_id` in 20260402000000_rename_projects_to_knowledge_base.ts).
 * This migration only drops the NOT NULL constraint; the column type stays
 * `text` and existing data is untouched.
 */
export async function up(knex: Knex): Promise<void> {
  // Drop NOT NULL so DocumentCategory-only grants can be inserted with
  // knowledge_base_id = NULL (resource_type = 'DocumentCategory').
  await knex.schema.alterTable('resource_grants', (table) => {
    table.text('knowledge_base_id').nullable().alter()
  })
}

/**
 * @description Restore NOT NULL on `resource_grants.knowledge_base_id`.
 * Aborts with a clear error if any rows currently have NULL so we do not
 * silently drop DocumentCategory grants on rollback.
 */
export async function down(knex: Knex): Promise<void> {
  // Guard: rolling back would fail mid-ALTER if null rows exist. Check first
  // and throw a descriptive error so the operator can backfill or delete.
  const nullRows = await knex('resource_grants')
    .whereNull('knowledge_base_id')
    .count<{ count: string }[]>('* as count')
  const count = Number(nullRows[0]?.count ?? 0)
  if (count > 0) {
    throw new Error(
      `Cannot rollback make_resource_grants_kb_id_nullable: ${count} row(s) in resource_grants have knowledge_base_id IS NULL. ` +
        `Backfill or delete these rows (likely DocumentCategory grants) before rolling back.`,
    )
  }

  // Safe to restore NOT NULL now.
  await knex.schema.alterTable('resource_grants', (table) => {
    table.text('knowledge_base_id').notNullable().alter()
  })
}
