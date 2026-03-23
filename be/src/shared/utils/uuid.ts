/**
 * @fileoverview Standardized UUID generation utility.
 *
 * Generates 32-character lowercase hex UUIDs (no hyphens) as the single UUID
 * format used throughout the application. This matches the Python advance-rag
 * convention and eliminates the need for hyphen stripping at service boundaries.
 *
 * @module shared/utils/uuid
 */

import { randomUUID } from 'crypto'

/**
 * @description Generate a 32-char hex UUID string without hyphens.
 * Uses crypto.randomUUID() (UUID v4) and strips hyphens for a compact format
 * that is consistent across Node.js and Python services.
 * @returns {string} 32-character lowercase hex UUID string
 * @example
 * ```ts
 * getUuid() // → '550e8400e29b41d4a716446655440000'
 * ```
 */
export function getUuid(): string {
  return randomUUID().replace(/-/g, '')
}
