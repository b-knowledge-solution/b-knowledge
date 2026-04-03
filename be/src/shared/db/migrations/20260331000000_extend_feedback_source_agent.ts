/**
 * @fileoverview Migration to extend answer_feedback source constraint to include 'agent'.
 * @description Adds 'agent' as a valid source value for the answer_feedback table,
 *   enabling feedback tracking for agent run results alongside chat and search.
 */
import type { Knex } from 'knex'

/**
 * @description Add 'agent' to the answer_feedback source check constraint.
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function up(knex: Knex): Promise<void> {
  // Drop existing check constraint that only allows 'chat' and 'search'
  await knex.raw(
    'ALTER TABLE answer_feedback DROP CONSTRAINT IF EXISTS answer_feedback_source_check'
  )

  // Re-create check constraint with 'agent' added
  await knex.raw(
    "ALTER TABLE answer_feedback ADD CONSTRAINT answer_feedback_source_check CHECK (source IN ('chat', 'search', 'agent'))"
  )
}

/**
 * @description Revert: remove agent feedback records, restore original constraint.
 * @param {Knex} knex - Knex instance
 * @returns {Promise<void>}
 */
export async function down(knex: Knex): Promise<void> {
  // Delete any agent feedback records before restoring the original constraint
  await knex('answer_feedback').where('source', 'agent').del()

  // Drop the extended constraint
  await knex.raw(
    'ALTER TABLE answer_feedback DROP CONSTRAINT IF EXISTS answer_feedback_source_check'
  )

  // Restore original constraint with only 'chat' and 'search'
  await knex.raw(
    "ALTER TABLE answer_feedback ADD CONSTRAINT answer_feedback_source_check CHECK (source IN ('chat', 'search'))"
  )
}
