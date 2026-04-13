/**
 * @fileoverview Scratch-DB helpers for Phase 1 permission-system tests.
 *
 * Provides three utilities for migration-aware integration testing:
 *   - {@link withScratchDb}                — full migrate.latest, callback, rollback all.
 *   - {@link withScratchDbStoppingBefore}  — partial migrate.latest stopping before a target migration.
 *   - {@link roundTripMigration}           — up → snapshot → down ONE migration by name → assertions → up again.
 *
 * Each helper opens its own Knex instance against the configured Postgres
 * database, isolates work to a per-run schema where possible, and guarantees
 * cleanup (rollback + destroy) in a `finally` block so a thrown assertion
 * never leaks state into sibling specs.
 *
 * Importing this file has NO side effects: connections are only created
 * inside the exported functions when invoked.
 *
 * @module tests/permissions/_helpers
 */
import knex, { type Knex } from 'knex'
import dbConfig from '../../src/shared/db/knexfile.js'

/**
 * Schema name used to isolate test runs from the application's `public` schema.
 * Each invocation suffixes a random token so parallel Vitest workers do not
 * collide. Centralized here so callers never hardcode the literal.
 */
const TEST_SCHEMA_PREFIX = 'permissions_test'

/**
 * @description Generate a unique, lowercase, Postgres-safe schema name for one test run.
 * @returns {string} A schema identifier such as `permissions_test_ab12cd34`.
 */
function makeScratchSchemaName(): string {
  // Use Math.random in lieu of crypto to avoid Node version probing in tests;
  // collision risk is negligible for the lifetime of a single test run.
  const token = Math.random().toString(36).slice(2, 10)
  return `${TEST_SCHEMA_PREFIX}_${token}`
}

/**
 * @description Build a fresh Knex instance bound to an isolated Postgres schema
 * so migrations run against an empty namespace and cannot collide with the
 * developer's working database or with parallel test workers.
 * @param {string} schemaName - Schema to create and pin via `search_path`.
 * @returns {Knex} A configured Knex instance whose pool runs every connection
 *   inside the supplied schema.
 */
function buildScratchKnex(schemaName: string): Knex {
  // Clone the shared config so we can override `searchPath` and `afterCreate`
  // without mutating the singleton used by application code.
  return knex({
    ...dbConfig,
    // `searchPath` makes Knex prepend our schema to every query, so the
    // migrations table and DDL all land inside the scratch namespace.
    searchPath: [schemaName, 'public'],
    pool: {
      // `afterCreate` runs once per pooled connection: ensure the schema exists
      // and the connection's session search_path is locked to it.
      afterCreate: (conn: { query: (sql: string, cb: (err: Error | null) => void) => void }, done: (err: Error | null) => void) => {
        conn.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`, (createErr) => {
          if (createErr) return done(createErr)
          conn.query(`SET search_path TO "${schemaName}", public`, (setErr) => done(setErr))
        })
      },
    },
    migrations: {
      ...dbConfig.migrations,
      // Pin the knex_migrations table inside the scratch schema so parallel
      // workers do not race against a shared migrations ledger.
      schemaName,
    },
  } as Knex.Config)
}

/**
 * @description Tear down a scratch schema and destroy its Knex pool.
 * Always called from a `finally` block so an assertion error does not leak
 * connections or DDL state into sibling tests.
 * @param {Knex} k - The scratch Knex instance to dispose.
 * @param {string} schemaName - The schema that should be dropped CASCADE.
 * @returns {Promise<void>} Resolves once rollback, schema drop, and pool destroy complete.
 */
async function teardownScratch(k: Knex, schemaName: string): Promise<void> {
  // Best-effort rollback first so any leftover migration locks are released
  // before we drop the schema out from under them.
  try {
    await k.migrate.rollback(undefined, true)
  } catch {
    // Swallow: rollback may legitimately fail if the schema is mid-creation.
  }

  // Drop the entire scratch namespace; CASCADE removes any tables/sequences.
  try {
    await k.raw(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
  } catch {
    // Ignore: the pool may already be invalid if the test failed catastrophically.
  }

  // Always destroy the pool last so we never leak Postgres connections.
  await k.destroy()
}

/**
 * @description Run a callback against a fully-migrated scratch database.
 * Performs `migrate.latest`, invokes the callback with the live Knex handle,
 * then rolls every migration back and tears the schema down — even if the
 * callback throws.
 * @param {(k: Knex) => Promise<void>} fn - Test body that receives the scratch Knex.
 * @returns {Promise<void>} Resolves after teardown completes.
 * @throws Re-throws any error raised by the callback after cleanup runs.
 */
export async function withScratchDb(fn: (k: Knex) => Promise<void>): Promise<void> {
  const schemaName = makeScratchSchemaName()
  const k = buildScratchKnex(schemaName)
  try {
    // Bring the schema to head before handing control to the test body.
    await k.migrate.latest()
    await fn(k)
  } finally {
    // Cleanup is unconditional so a failing assertion never leaks DDL state.
    await teardownScratch(k, schemaName)
  }
}

/**
 * @description Migrate up to (but not including) a named migration, run a
 * callback that may seed legacy fixtures, then complete the remaining
 * migrations and finally roll everything back. Used for verifying that a
 * specific migration handles pre-existing rows correctly.
 * @param {string} migrationFilename - Filename (or filename prefix) of the
 *   migration that should NOT yet have run when the callback fires.
 * @param {(k: Knex) => Promise<void>} fn - Callback executed against the
 *   partially-migrated scratch database.
 * @returns {Promise<void>} Resolves after the final teardown completes.
 * @throws Re-throws any error from the callback after teardown runs.
 */
export async function withScratchDbStoppingBefore(
  migrationFilename: string,
  fn: (k: Knex) => Promise<void>,
): Promise<void> {
  const schemaName = makeScratchSchemaName()
  const k = buildScratchKnex(schemaName)
  try {
    // Walk forward one migration at a time until the next pending entry
    // matches the requested target — then stop, leaving target un-applied.
    // `migrate.up()` with no args runs exactly one pending migration.
    // Loop guarded by a hard cap to avoid runaway loops on misconfigured input.
    const HARD_CAP = 1000
    for (let step = 0; step < HARD_CAP; step += 1) {
      const pending = (await k.migrate.list())[1] as Array<{ file: string } | string>
      if (pending.length === 0) break
      const nextName = typeof pending[0] === 'string' ? (pending[0] as string) : (pending[0] as { file: string }).file
      // Stop BEFORE running the target migration.
      if (nextName.includes(migrationFilename)) break
      await k.migrate.up()
    }

    // Hand the partially-migrated DB to the callback for fixture insertion.
    await fn(k)

    // Finish the remaining migrations so any later test phase has a complete schema.
    await k.migrate.latest()
  } finally {
    await teardownScratch(k, schemaName)
  }
}

/**
 * @description Snapshot of `information_schema` taken before a migration is rolled back.
 * Provided to {@link roundTripMigration} assertion callbacks so they can
 * inspect the legacy schema shape after the targeted migration is undone.
 */
export interface PreRollbackSnapshot {
  /** Knex handle bound to the scratch DB after the rollback step. */
  knex: Knex
  /** Rows from `information_schema.tables` captured before rollback. */
  tablesBefore: Array<{ table_name: string }>
  /** Rows from `information_schema.columns` captured before rollback. */
  columnsBefore: Array<{ table_name: string; column_name: string }>
}

/**
 * @description Run all migrations to head, capture an `information_schema`
 * snapshot, then roll back EXACTLY ONE named migration via Knex's
 * `migrate.down({ name })` API (Knex >= 0.95). The legacy-shape DB is handed
 * to an assertion callback, after which the same migration is re-applied via
 * `migrate.up({ name })`. This isolates the rollback of a single migration
 * instead of unwinding the whole batch the way `migrate.rollback()` does.
 * @param {string} migrationFilename - Basename of the migration whose
 *   round-trip is being verified (e.g.
 *   `20260407052129_phase1_rename_entity_permissions_to_resource_grants.ts`).
 * @param {(snapshot: PreRollbackSnapshot) => Promise<void>} assertions -
 *   Assertion callback receiving the post-rollback Knex plus the captured snapshot.
 * @returns {Promise<void>} Resolves after the final teardown completes.
 * @throws Re-throws any error from the assertion callback after teardown runs.
 */
export async function roundTripMigration(
  migrationFilename: string,
  assertions: (snapshot: PreRollbackSnapshot) => Promise<void>,
): Promise<void> {
  const schemaName = makeScratchSchemaName()
  const k = buildScratchKnex(schemaName)
  try {
    // Bring the scratch DB to head so the target migration is applied.
    await k.migrate.latest()

    // Snapshot the post-up schema for later comparison inside the assertions.
    const tablesBefore = (
      await k.raw(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
        [schemaName],
      )
    ).rows as Array<{ table_name: string }>

    const columnsBefore = (
      await k.raw(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ? ORDER BY table_name, column_name`,
        [schemaName],
      )
    ).rows as Array<{ table_name: string; column_name: string }>

    // Roll back EXACTLY the named migration (not the whole batch). Knex 0.95+
    // exposes `migrate.down({ name })` for this purpose; we use the basename
    // to be tolerant of absolute-vs-relative file path arguments.
    const targetName = migrationFilename.split('/').pop() as string
    await k.migrate.down({ name: targetName })

    // Hand the legacy-shape DB to the caller's assertions.
    await assertions({ knex: k, tablesBefore, columnsBefore })

    // Re-apply ONLY the same migration so we leave the DB at head state.
    await k.migrate.up({ name: targetName })
  } finally {
    await teardownScratch(k, schemaName)
  }
}
