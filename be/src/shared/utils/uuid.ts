/**
 * @fileoverview Standardized UUID generation and validation utilities.
 *
 * Generates 32-character lowercase hex UUIDs (no hyphens) as the single UUID
 * format used throughout the application. This matches the Python advance-rag
 * convention and eliminates the need for hyphen stripping at service boundaries.
 *
 * Also exports Zod schemas for validating hex IDs in request payloads.
 *
 * @module shared/utils/uuid
 */

import { randomUUID } from 'crypto'
import { z } from 'zod'

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

/** Regex matching a 32-character lowercase hex string (no hyphens) */
const HEX_ID_REGEX = /^[0-9a-f]{32}$/

/**
 * @description Zod schema for a single 32-char hex UUID (no hyphens).
 * Use this instead of z.string().uuid() throughout the codebase.
 * @example
 * ```ts
 * const schema = z.object({ id: hexId })
 * ```
 */
export const hexId = z.string().regex(HEX_ID_REGEX, 'Invalid ID format (expected 32-char hex)')

/**
 * @description Factory for hexId with a custom error message.
 * @param {string} message - Custom validation error message
 * @returns {z.ZodString} Zod string schema with hex ID regex validation
 * @example
 * ```ts
 * const schema = z.object({ id: hexIdWith('Invalid assistant ID') })
 * ```
 */
export function hexIdWith(message: string) {
  return z.string().regex(HEX_ID_REGEX, message)
}
