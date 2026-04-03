/**
 * @fileoverview Seed script for audit logs test data.
 *
 * Creates test audit log records spread over the past year
 * with randomized actions, users, IPs, and resource types.
 * Uses REAL user IDs and tenant IDs from the users table so that
 * tenant-scoped queries in the UI return data correctly.
 *
 * Useful for testing pagination, filtering, and export performance.
 *
 * @module db/seeds/01_audit_logs
 */

import { Knex } from 'knex';

/** Total number of audit log records to generate */
const TOTAL_RECORDS = 10_000;
/** Number of records per batch insert to balance memory vs. round-trips */
const BATCH_SIZE = 1_000;

/** Possible audit actions covering auth, CRUD, and config changes */
const ACTIONS = [
    'login', 'logout', 'login_failed', 'create_user', 'update_user',
    'delete_user', 'update_role', 'create_bucket', 'delete_bucket',
    'upload_document', 'delete_document', 'update_config', 'create_team',
    'update_team', 'delete_team', 'create_document_bucket',
    'download_document', 'reload_config', 'create_broadcast',
    'set_permission'
];

/** Resource types that audit logs can reference */
const RESOURCE_TYPES = [
    'user', 'session', 'bucket', 'file', 'config', 'system', 'role',
    'team', 'document', 'dataset', 'broadcast_message', 'permission'
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
            return { method: randomElement(['oauth', 'local-login', 'azure-ad']), browser: randomElement(['Chrome', 'Firefox', 'Edge', 'Safari']) };
        // Failed logins include reason and attempt count
        case 'login_failed':
            return { reason: randomElement(['invalid_password', 'account_locked', 'expired_token']), attempts: Math.floor(Math.random() * 5) + 1 };
        case 'create_user':
        case 'update_user':
        case 'delete_user':
            return { target_email: `user${Math.floor(Math.random() * 100)}@baoda.vn` };
        case 'upload_document':
        case 'delete_document':
        case 'download_document':
            return { filename: randomElement(['report.pdf', 'data.xlsx', 'presentation.pptx', 'notes.docx', 'image.png']) };
        case 'create_team':
        case 'update_team':
        case 'delete_team':
            return { team_name: randomElement(['Alpha Team', 'Beta Team', 'Gamma Team', 'Delta Team']) };
        case 'update_config':
        case 'reload_config':
            return { config_key: randomElement(['app.name', 'session.timeout', 'upload.maxSize', 'search.enabled']) };
        default:
            return { note: 'Audit log seed data' };
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
        case 'team': return `team-${Math.floor(Math.random() * 10)}`;
        default: return `res-${Math.floor(Math.random() * 1000)}`;
    }
}

/**
 * @description Seed audit log records into the database using batch inserts.
 * Reads real user IDs and tenant IDs from the users table so data
 * is visible under tenant-scoped queries in the audit log UI.
 * @param {Knex} knex - Knex instance for database operations
 * @returns {Promise<void>}
 */
export async function seed(knex: Knex): Promise<void> {
    console.log(`Starting audit log seed: ${TOTAL_RECORDS} records...`);
    const startTime = Date.now();

    // ── Fetch real users from the database so audit logs reference valid IDs ──
    // users table has no tenant_id; join user_tenant to get the org scope.
    // Fall back to the system tenant ID when user has no user_tenant entry yet
    // (this matches what wireAbilityOnLogin assigns on first login).
    const SYSTEM_TENANT_ID = (
        process.env['SYSTEM_TENANT_ID'] || '00000000000000000000000000000001'
    ).replace(/-/g, '');

    const realUsers = await knex('users')
        .leftJoin('user_tenant', 'users.id', 'user_tenant.user_id')
        .select(
            'users.id',
            'users.email',
            knex.raw(`COALESCE(user_tenant.tenant_id, ?) as tenant_id`, [SYSTEM_TENANT_ID])
        )
        .limit(50);

    if (realUsers.length === 0) {
        console.warn('No users found in database. Run 00_sample_users seed first!');
        return;
    }

    console.log(`Found ${realUsers.length} real users to attribute audit logs to.`);

    let insertedCount = 0;
    // Process in memory-friendly chunks, then batch-insert in groups of BATCH_SIZE
    while (insertedCount < TOTAL_RECORDS) {
        const batchSize = Math.min(BATCH_SIZE * 5, TOTAL_RECORDS - insertedCount);
        const batch = [];
        for (let i = 0; i < batchSize; i++) {
            // Pick a real user so user_id, user_email, and tenant_id are valid
            const user = randomElement(realUsers);
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
                // Use the user's tenant_id so the record appears under their org scope
                tenant_id: user.tenant_id || null,
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
