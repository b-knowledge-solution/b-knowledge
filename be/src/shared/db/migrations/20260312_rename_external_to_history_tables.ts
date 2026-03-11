/**
 * @fileoverview Migration to rename external_* tables to history_* tables.
 *
 * Renames:
 * - external_chat_sessions   -> history_chat_sessions
 * - external_chat_messages    -> history_chat_messages
 * - external_search_sessions  -> history_search_sessions
 * - external_search_records   -> history_search_records
 *
 * @description Part of the external -> trace module refactoring.
 */
import { Knex } from 'knex'

/**
 * Rename external_* tables to history_* tables.
 * @param knex - Knex instance.
 * @returns Promise<void>
 */
export async function up(knex: Knex): Promise<void> {
  // Rename chat sessions table
  await knex.schema.renameTable('external_chat_sessions', 'history_chat_sessions')
  // Rename chat messages table
  await knex.schema.renameTable('external_chat_messages', 'history_chat_messages')
  // Rename search sessions table
  await knex.schema.renameTable('external_search_sessions', 'history_search_sessions')
  // Rename search records table
  await knex.schema.renameTable('external_search_records', 'history_search_records')
}

/**
 * Revert table renames back to external_* prefix.
 * @param knex - Knex instance.
 * @returns Promise<void>
 */
export async function down(knex: Knex): Promise<void> {
  // Revert chat sessions table name
  await knex.schema.renameTable('history_chat_sessions', 'external_chat_sessions')
  // Revert chat messages table name
  await knex.schema.renameTable('history_chat_messages', 'external_chat_messages')
  // Revert search sessions table name
  await knex.schema.renameTable('history_search_sessions', 'external_search_sessions')
  // Revert search records table name
  await knex.schema.renameTable('history_search_records', 'external_search_records')
}
