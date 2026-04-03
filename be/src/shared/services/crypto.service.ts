/**
 * @fileoverview Cryptographic service for encrypting/decrypting sensitive data at rest.
 *
 * Implements AES-256-CBC encryption that is **byte-compatible** with the Python
 * `advance-rag/common/crypto_utils.py` implementation, allowing both Node.js
 * and Python components to read/write the same encrypted values.
 *
 * Wire format: RAGF (4-byte magic) + IV (16 bytes) + ciphertext
 * Key derivation: PBKDF2-SHA256, 100 000 iterations, fixed salt
 *
 * @module crypto.service
 */

import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto'

// ============================================================================
// CONSTANTS — must match Python crypto_utils.py exactly
// ============================================================================

/** Magic header identifying encrypted payloads */
const ENCRYPTED_MAGIC = Buffer.from('RAGF', 'ascii')

/** Fixed salt for PBKDF2 key derivation (matches Python) */
const PBKDF2_SALT = Buffer.from('ragflow_crypto_salt', 'utf-8')

/** PBKDF2 iteration count (matches Python) */
const PBKDF2_ITERATIONS = 100_000

/** Derived key length in bytes (AES-256 = 32 bytes) */
const KEY_LENGTH = 32

/** AES block / IV size in bytes */
const IV_LENGTH = 16

/** Cipher algorithm identifier */
const ALGORITHM = 'aes-256-cbc'

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * Singleton service for AES-256-CBC encryption/decryption at rest.
 *
 * @description
 * - When `ENCRYPTION_KEY` env var is set, all encrypt/decrypt calls use it.
 * - When unset, encryption is **disabled**: `encrypt()` returns plaintext and
 *   `decrypt()` returns the input unchanged. This keeps dev/test frictionless.
 * - The wire format includes a `RAGF` magic header so `decrypt()` can safely
 *   distinguish encrypted from plaintext data (backward compatibility).
 *
 * @example
 * import { cryptoService } from '@/shared/services/crypto.service.js'
 *
 * // Encrypt before DB write
 * const encrypted = cryptoService.encrypt('sk-abc123')
 *
 * // Decrypt after DB read
 * const plaintext = cryptoService.decrypt(encrypted) // 'sk-abc123'
 */
class CryptoService {
  /** Derived 256-bit key (null when encryption is disabled) */
  private derivedKey: Buffer | null = null

  constructor() {
    const rawKey = process.env['ENCRYPTION_KEY']

    if (rawKey) {
      // Derive a fixed AES-256 key from the user-supplied passphrase
      this.derivedKey = pbkdf2Sync(
        rawKey,
        PBKDF2_SALT,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        'sha256',
      )
    }
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Whether encryption is enabled (ENCRYPTION_KEY env var is set).
   *
   * @returns true if encryption is active
   */
  isEnabled(): boolean {
    return this.derivedKey !== null
  }

  /**
   * Encrypt a plaintext string for storage.
   *
   * When encryption is disabled, returns the input unchanged.
   *
   * @param plaintext - The sensitive value to encrypt
   * @returns Base64-encoded encrypted payload (or plaintext if disabled)
   */
  encrypt(plaintext: string): string {
    // Graceful degradation: no key → store plaintext
    if (!this.derivedKey) return plaintext

    // Generate a random IV for each encryption (critical for CBC security)
    const iv = randomBytes(IV_LENGTH)

    // Apply PKCS7 padding and encrypt
    const cipher = createCipheriv(ALGORITHM, this.derivedKey, iv)
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ])

    // Wire format: RAGF + IV + ciphertext → base64
    const payload = Buffer.concat([ENCRYPTED_MAGIC, iv, encrypted])
    return payload.toString('base64')
  }

  /**
   * Decrypt a value from storage.
   *
   * Automatically detects whether the value is encrypted (has `RAGF` magic
   * header after base64 decoding) or plaintext. Returns plaintext unchanged.
   *
   * @param encoded - Base64-encoded encrypted payload or raw plaintext
   * @returns Decrypted plaintext string
   */
  decrypt(encoded: string): string {
    // Graceful degradation: no key → assume stored plaintext
    if (!this.derivedKey) return encoded

    // Try to base64-decode and check for magic header
    let raw: Buffer
    try {
      raw = Buffer.from(encoded, 'base64')
    } catch {
      // Not valid base64 → definitely plaintext
      return encoded
    }

    // Check magic header to distinguish encrypted vs plaintext
    if (raw.length < ENCRYPTED_MAGIC.length + IV_LENGTH + 1) {
      return encoded
    }
    const magic = raw.subarray(0, ENCRYPTED_MAGIC.length)
    if (!magic.equals(ENCRYPTED_MAGIC)) {
      // No magic header → plaintext stored before encryption was enabled
      return encoded
    }

    // Extract IV and ciphertext
    const iv = raw.subarray(ENCRYPTED_MAGIC.length, ENCRYPTED_MAGIC.length + IV_LENGTH)
    const ciphertext = raw.subarray(ENCRYPTED_MAGIC.length + IV_LENGTH)

    // Decrypt with PKCS7 auto-unpadding
    const decipher = createDecipheriv(ALGORITHM, this.derivedKey, iv)
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])

    return decrypted.toString('utf-8')
  }
}

/** Singleton crypto service instance */
export const cryptoService = new CryptoService()
