
/**
 * @fileoverview Singleton MinIO client configured from centralized config for reuse across services.
 *
 * Provides S3-compatible object storage access via the MinIO SDK.
 * Uses a singleton pattern to ensure a single client instance is shared.
 *
 * @module shared/services/minio
 */
import * as Minio from 'minio'
import { config } from '@/shared/config/index.js'

/**
 * @description Wrapper class to ensure a single instance of the MinIO client
 * is shared across all services. Reads S3-compatible credentials from
 * the centralized config object.
 */
class MinioSingleton {
  /** Static instance holder */
  private static instance: Minio.Client

  /** Private constructor to prevent direct instantiation */
  private constructor() { }

  /**
   * @description Lazily create or reuse the MinIO client using centralized config.
   * @returns {Minio.Client} The singleton MinIO client instance
   */
  public static getInstance(): Minio.Client {
    // Check if instance already exists
    if (!MinioSingleton.instance) {
      // Create new instance using centralized S3 config
      MinioSingleton.instance = new Minio.Client({
        endPoint: config.s3.endpoint,
        port: config.s3.port,
        useSSL: config.s3.useSSL,
        accessKey: config.s3.accessKey,
        secretKey: config.s3.secretKey,
      })
    }
    // Return the singleton instance
    return MinioSingleton.instance
  }
}

/** Export the singleton instance directly */
export const minioClient = MinioSingleton.getInstance()
