/**
 * @fileoverview CLI script to run all pending Knex database migrations.
 * Usage: npm run db:migrate
 * @module scripts/migrate
 */
import knex from 'knex';
import dbConfig from '@/shared/db/knexfile.js';

/**
 * @description Execute all pending database migrations to bring schema up to date
 * @returns {Promise<void>}
 */
async function migrate() {
    console.log('Starting migration...');
    // Initialize Knex instance for migration tooling
    const db = knex(dbConfig);
    try {
        // Run all pending migrations in order
        await db.migrate.latest();
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        // Clean up database connection
        await db.destroy();
    }
}

migrate();
