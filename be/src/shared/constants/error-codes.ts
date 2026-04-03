/**
 * @description External service error code constants
 */

/** PostgreSQL error codes */
export const PgErrorCode = {
  UNIQUE_VIOLATION: '23505',
} as const

/** S3/MinIO error codes */
export const S3ErrorCode = {
  NO_SUCH_KEY: 'NoSuchKey',
  NO_SUCH_BUCKET: 'NoSuchBucket',
} as const
