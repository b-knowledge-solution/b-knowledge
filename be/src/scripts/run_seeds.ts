/**
 * @fileoverview CLI script to execute all Knex database seed files.
 * Usage: npm run db:seed
 * @module scripts/run_seeds
 */
import knex from 'knex';
import dbConfig from '@/shared/db/knexfile.js';

/**
 * @description Execute all configured database seed files to populate initial data
 * @returns {Promise<void>}
 */
async function runSeeds() {
    console.log('Starting seed execution...');
    // Initialize Knex instance for seed tooling
    const db = knex(dbConfig);
    try {
        // Run all seed files in configured directory
        await db.seed.run();
        console.log('All seeds executed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Seed execution failed:', err);
        process.exit(1);
    } finally {
        // Clean up database connection
        await db.destroy();
    }
}

runSeeds();
