/**
 * @fileoverview Encrypt existing plaintext API keys at rest.
 * @description Reads all non-empty api_key values from model_providers
 *   and tenant_llm, encrypts them using the shared crypto service,
 *   and writes the ciphertext back. The down migration decrypts them.
 */
import type { Knex } from 'knex'
import { cryptoService } from '../../services/crypto.service.js'

/**
 * Encrypt every plaintext api_key in model_providers and tenant_llm.
 * Already-encrypted values (prefixed with 'enc:') are skipped.
 * @param knex - Knex instance
 */
export async function up(knex: Knex): Promise<void> {
  // Encrypt model_providers rows
  const providers = await knex('model_providers')
    .select('id', 'api_key')
    .whereNotNull('api_key')
    .andWhereNot('api_key', '')

  for (const row of providers) {
    // Skip if already encrypted
    if (row.api_key.startsWith('enc:')) continue

    const encrypted = cryptoService.encrypt(row.api_key)
    await knex('model_providers')
      .where('id', row.id)
      .update({ api_key: encrypted })
  }

  // Encrypt tenant_llm rows (shared table read by Python workers)
  const tenantLlms = await knex('tenant_llm')
    .select('id', 'api_key')
    .whereNotNull('api_key')
    .andWhereNot('api_key', '')

  for (const row of tenantLlms) {
    // Skip if already encrypted
    if (row.api_key.startsWith('enc:')) continue

    const encrypted = cryptoService.encrypt(row.api_key)
    await knex('tenant_llm')
      .where('id', row.id)
      .update({ api_key: encrypted })
  }
}

/**
 * Decrypt api_key values back to plaintext (rollback).
 * @param knex - Knex instance
 */
export async function down(knex: Knex): Promise<void> {
  // Decrypt model_providers rows
  const providers = await knex('model_providers')
    .select('id', 'api_key')
    .whereNotNull('api_key')
    .andWhere('api_key', 'like', 'enc:%')

  for (const row of providers) {
    const decrypted = cryptoService.decrypt(row.api_key)
    await knex('model_providers')
      .where('id', row.id)
      .update({ api_key: decrypted })
  }

  // Decrypt tenant_llm rows
  const tenantLlms = await knex('tenant_llm')
    .select('id', 'api_key')
    .whereNotNull('api_key')
    .andWhere('api_key', 'like', 'enc:%')

  for (const row of tenantLlms) {
    const decrypted = cryptoService.decrypt(row.api_key)
    await knex('tenant_llm')
      .where('id', row.id)
      .update({ api_key: decrypted })
  }
}
