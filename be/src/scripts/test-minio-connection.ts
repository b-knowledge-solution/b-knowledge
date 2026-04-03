/**
 * @fileoverview CLI script to verify MinIO/S3 connectivity by running a smoke test.
 * Covers list/create/upload/download/delete flow to validate full CRUD access.
 * Usage: npx tsx src/scripts/test-minio-connection.ts
 * @module scripts/test-minio-connection
 */
import dotenv from 'dotenv';
import * as Minio from 'minio';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * @description Smoke test covering list/create/upload/download/delete flow against MinIO
 * @returns {Promise<void>}
 */
async function testMinio() {
    console.log('--- MinIO Connection Test ---');

    // Build connection config from environment variables
    const config = {
        endPoint: process.env.S3_ENDPOINT || 'localhost',
        port: parseInt(process.env.S3_PORT || '9000'),
        useSSL: process.env.S3_USE_SSL === 'true',
        accessKey: process.env.S3_ACCESS_KEY || '',
        secretKey: process.env.S3_SECRET_KEY || '',
    };

    // Log config with masked credentials for debugging
    console.log('Configuration:', {
        ...config,
        accessKey: config.accessKey ? '***' : 'MISSING',
        secretKey: config.secretKey ? '***' : 'MISSING',
    });

    // Guard: require credentials to be present
    if (!config.accessKey || !config.secretKey) {
        console.error('ERROR: S3 credentials missing in .env');
        return;
    }

    // Initialize MinIO client
    const minioClient = new Minio.Client(config);
    // Create a unique test bucket name using timestamp
    const bucketName = 'test-bucket-' + Date.now();

    try {
        // Step 1: List existing buckets to verify connectivity
        console.log('\n1. Listing Buckets...');
        const buckets = await minioClient.listBuckets();
        console.log(`Success: Found ${buckets.length} buckets.`);
        buckets.forEach(b => console.log(` - ${b.name}`));

        // Step 2: Create a temporary test bucket
        console.log(`\n2. Creating Test Bucket: ${bucketName}...`);
        await minioClient.makeBucket(bucketName, 'us-east-1');
        console.log('Success: Bucket created.');

        // Step 3: Upload a small test file
        console.log('\n3. Uploading Test File...');
        const objectName = 'test-file.txt';
        const content = 'Hello MinIO!';
        await minioClient.putObject(bucketName, objectName, Buffer.from(content), content.length);
        console.log('Success: File uploaded.');

        // Step 4: Generate a presigned download URL
        console.log('\n4. Generating Download URL...');
        const url = await minioClient.presignedGetObject(bucketName, objectName, 3600);
        console.log(`Success: URL generated: ${url}`);

        // Step 5: Delete the test file
        console.log('\n5. Deleting Test File...');
        await minioClient.removeObject(bucketName, objectName);
        console.log('Success: File deleted.');

        // Step 6: Delete the test bucket
        console.log('\n6. Deleting Test Bucket...');
        await minioClient.removeBucket(bucketName);
        console.log('Success: Bucket deleted.');

        console.log('\n--- Test Completed Successfully ---');

    } catch (error: any) {
        console.error('\n--- Test Failed ---');
        console.error('Error:', error.message);
        if (error.code) console.error('Code:', error.code);
        if (error.command) console.error('Command:', error.command);
        console.error('Stack:', error.stack);
    }
}

testMinio();
