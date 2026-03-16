/**
 * @fileoverview Seed script for audit logs test data.
 *
 * Creates 1 million test audit log records spread over the past year
 * with randomized actions, users, IPs, and resource types.
 * Useful for testing pagination, filtering, and export performance.
 *
 * @module db/seeds/01_audit_logs
 */

import { Knex } from 'knex';

/** Total number of audit log records to generate */
const TOTAL_RECORDS = 1_000_000;
/** Number of records per batch insert to balance memory vs. round-trips */
const BATCH_SIZE = 1_000;

/** Possible audit actions covering auth, CRUD, and config changes */
const ACTIONS = [
    'login', 'logout', 'login_failed', 'create_user', 'update_user',
    'delete_user', 'update_role', 'create_bucket', 'delete_bucket',
    'upload_file', 'delete_file', 'update_config'
];

/** Resource types that audit logs can reference */
const RESOURCE_TYPES = [
    'user', 'session', 'bucket', 'file', 'config', 'system', 'role'
];

/** Sample user identities for log attribution */
const SAMPLE_USERS = [
    { id: 'user-001', email: 'admin@baoda.vn' },
    { id: 'user-002', email: 'manager@baoda.vn' },
    { id: 'user-003', email: 'user1@baoda.vn' },
    { id: 'user-004', email: 'user2@baoda.vn' },
    { id: 'user-005', email: 'developer@baoda.vn' },
    { id: 'user-006', email: 'tester@baoda.vn' },
    { id: 'user-007', email: 'analyst@baoda.vn' },
    { id: 'user-008', email: 'support@baoda.vn' },
    { id: 'user-009', email: 'hr@baoda.vn' },
    { id: 'user-010', email: 'finance@baoda.vn' },
];

/** Sample IP addresses including null for actions without network context */
const SAMPLE_IPS = [
    '192.168.1.100', '192.168.1.101', '192.168.1.102', '10.0.0.50',
    '10.0.0.51', '172.16.0.10', '172.16.0.11', '203.113.152.1',
    '113.190.232.5', null
];

/**
 * @description Pick a random element from an array.
 * @template T
 * @param {T[]} arr - Source array
 * @returns {T} Random element
 */
function randomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)]!;
}

/**
 * @description Generate a random date within the past year.
 * @returns {Date} Random date between now and 365 days ago
 */
function randomDate(): Date {
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    return new Date(oneYearAgo.getTime() + Math.random() * (now.getTime() - oneYearAgo.getTime()));
}

/**
 * @description Generate realistic detail JSON for an audit log entry based on its action type.
 * @param {string} action - Audit action (e.g. 'login', 'login_failed')
 * @param {string} resourceType - Resource type for context
 * @returns {Record<string, unknown>} Detail object to be serialized as JSON
 */
function generateDetails(action: string, resourceType: string): any {
    // Auth actions include method and browser info
    switch (action) {
        case 'login':
        case 'logout':
            return { method: randomElement(['oauth', 'dev-login', 'root']), browser: randomElement(['Chrome', 'Firefox', 'Edge']) };
        // Failed logins include reason and attempt count
        case 'login_failed':
            return { reason: randomElement(['invalid_password', 'account_locked', 'expired_token']), attempts: Math.floor(Math.random() * 5) + 1 };
        default:
            return { note: 'Test data' };
    }
}

/**
 * @description Generate a random resource ID appropriate for the given resource type.
 * Returns null ~10% of the time to simulate actions without a specific resource.
 * @param {string} resourceType - Resource type (user, bucket, etc.)
 * @returns {string | null} Generated resource ID or null
 */
function generateResourceId(resourceType: string): string | null {
    // 10% chance of null to simulate system-level actions
    if (Math.random() < 0.1) return null;
    switch (resourceType) {
        case 'user': return `user-${Math.floor(Math.random() * 100).toString().padStart(3, '0')}`;
        case 'bucket': return `bucket-${Math.floor(Math.random() * 20)}`;
        default: return `res-${Math.floor(Math.random() * 1000)}`;
    }
}

/**
 * @description Seed 1 million audit log records into the database using batch inserts.
 * @param {Knex} knex - Knex instance for database operations
 * @returns {Promise<void>}
 */
export async function seed(knex: Knex): Promise<void> {
    console.log(`Starting audit log seed: ${TOTAL_RECORDS} records...`);
    const startTime = Date.now();

    let insertedCount = 0;
    // Process in memory-friendly chunks of 5000 records, then batch-insert in groups of BATCH_SIZE
    while (insertedCount < TOTAL_RECORDS) {
        // Use 5x BATCH_SIZE for memory batch to reduce loop overhead
        const batchSize = Math.min(BATCH_SIZE * 5, TOTAL_RECORDS - insertedCount);
        const batch = [];
        for (let i = 0; i < batchSize; i++) {
            const user = randomElement(SAMPLE_USERS);
            const action = randomElement(ACTIONS);
            const resourceType = randomElement(RESOURCE_TYPES);
            const details = generateDetails(action, resourceType);
            const resourceId = generateResourceId(resourceType);
            const ip = randomElement(SAMPLE_IPS);
            const createdAt = randomDate();

            batch.push({
                user_id: user.id,
                user_email: user.email,
                action,
                resource_type: resourceType,
                resource_id: resourceId,
                // Explicitly stringify JSON to avoid driver-level serialization differences
                details: JSON.stringify(details),
                ip_address: ip,
                created_at: createdAt
            });
        }

        // batchInsert splits the array into chunks of BATCH_SIZE for PostgreSQL multi-row INSERT
        await knex.batchInsert('audit_logs', batch, BATCH_SIZE);
        insertedCount += batchSize;
        process.stdout.write(`\rInserted ${insertedCount}/${TOTAL_RECORDS} audit logs...`);
    }

    console.log(`\nAudit log seed completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}
