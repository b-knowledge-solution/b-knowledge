/**
 * @fileoverview CLI script to rollback the last batch of Knex database migrations.
 * Usage: npm run db:migrate:rollback
 * @module scripts/rollback_migration
 */
import knex from 'knex';
import dbConfig from '@/shared/db/knexfile.js';

/**
 * @description Rollback the last batch of applied database migrations
 * @returns {Promise<void>}
 */
async function rollbackMigration() {
    console.log('Starting rollback...');
    // Initialize Knex instance for migration tooling
    const db = knex(dbConfig);
    try {
        // Rollback the most recent migration batch
        await db.migrate.rollback();
        console.log('Rollback completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Rollback failed:', err);
        process.exit(1);
    } finally {
        // Clean up database connection
        await db.destroy();
    }
}

rollbackMigration();
