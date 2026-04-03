/**
 * @fileoverview CLI script to create a new Knex migration file with a timestamp prefix.
 * Usage: npm run db:migrate:make <migration_name>
 * @module scripts/make_migration
 */
import knex from 'knex';
import dbConfig from '@/shared/db/knexfile.js';

/**
 * @description Create a new migration file with TypeScript extension
 * @returns {Promise<void>}
 */
async function makeMigration() {
    const name = process.argv[2];
    // Guard: migration name argument is required
    if (!name) {
        console.error('Error: Migration name is required.');
        console.error('Usage: npm run db:migrate:make <migration_name>');
        process.exit(1);
    }

    // Initialize Knex instance for migration tooling
    const db = knex(dbConfig);
    try {
        // Generate migration file with .ts extension
        const res = await db.migrate.make(name, { extension: 'ts' });
        console.log(`Migration created: ${res}`);
        process.exit(0);
    } catch (err) {
        console.error('Failed to create migration:', err);
        process.exit(1);
    } finally {
        // Clean up database connection
        await db.destroy();
    }
}

makeMigration();
