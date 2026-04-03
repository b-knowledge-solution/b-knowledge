/**
 * @fileoverview Lightweight Knex singleton for migrations and tests that rely on the Knex API.
 *
 * Provides a lazily-initialized, reusable Knex instance backed by the shared
 * database configuration from knexfile. Prefer the adapter-based `db` from
 * `@/shared/db/index.js` for application queries; this module is intended
 * for migration runners and test utilities only.
 *
 * @module db/knex
 */
import knex from 'knex';
import dbConfig from '@/shared/db/knexfile.js';

/**
 * @description Singleton wrapper around a Knex instance to avoid creating
 * multiple connection pools for the same database.
 */
class KnexSingleton {
  /** Cached Knex instance shared across all consumers */
  private static instance: knex.Knex;

  private constructor() { }

  /**
   * @description Lazily creates or returns the shared Knex instance.
   * @returns {knex.Knex} The singleton Knex instance configured via knexfile
   */
  public static getInstance(): knex.Knex {
    // Create the instance on first access to defer connection until needed
    if (!KnexSingleton.instance) {
      KnexSingleton.instance = knex(dbConfig);
    }
    return KnexSingleton.instance;
  }
}

/**
 * @description Shared Knex database instance for migrations and test utilities.
 * @type {knex.Knex}
 */
export const db = KnexSingleton.getInstance();
