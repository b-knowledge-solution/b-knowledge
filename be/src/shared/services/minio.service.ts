
/**
 * @fileoverview Singleton MinIO client configured from environment for reuse across services.
 *
 * Provides S3-compatible object storage access via the MinIO SDK.
 * Uses a singleton pattern to ensure a single client instance is shared.
 *
 * @module shared/services/minio
 */
import * as Minio from 'minio'

/**
 * @description Wrapper class to ensure a single instance of the MinIO client
 * is shared across all services. Reads S3-compatible credentials from
 * environment variables.
 */
class MinioSingleton {
  /** Static instance holder */
  private static instance: Minio.Client

  /** Private constructor to prevent direct instantiation */
  private constructor() { }

  /**
   * @description Lazily create or reuse the MinIO client using environment variables.
   * @returns {Minio.Client} The singleton MinIO client instance
   */
  public static getInstance(): Minio.Client {
    // Check if instance already exists
    if (!MinioSingleton.instance) {
      // Create new instance if not, using env vars or defaults
      MinioSingleton.instance = new Minio.Client({
        endPoint: process.env.S3_ENDPOINT || 'localhost',
        port: parseInt(process.env.S3_PORT || '9000', 10),
        useSSL: process.env.S3_USE_SSL === 'true',
        accessKey: process.env.S3_ACCESS_KEY || '',
        secretKey: process.env.S3_SECRET_KEY || '',
      })
    }
    // Return the singleton instance
    return MinioSingleton.instance
  }
}

/** Export the singleton instance directly */
export const minioClient = MinioSingleton.getInstance()
