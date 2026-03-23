/**
 * @fileoverview Unit tests for the AES-256-CBC crypto service.
 *
 * Tests encryption/decryption roundtrips, disabled mode (no ENCRYPTION_KEY),
 * wire format validation, and edge cases (plaintext passthrough, invalid data).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('CryptoService', () => {
  /**
   * @description Helper to dynamically import a fresh CryptoService instance.
   * Each import creates a new singleton that reads ENCRYPTION_KEY from env.
   * @returns {Promise<any>} The crypto service module
   */
  async function importFresh() {
    // Clear module cache to force re-evaluation with current env
    vi.resetModules()
    return await import('../../../src/shared/services/crypto.service.js')
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('when ENCRYPTION_KEY is not set', () => {
    it('isEnabled() should return false', async () => {
      // Ensure no encryption key is present
      vi.stubEnv('ENCRYPTION_KEY', '')
      const { cryptoService } = await importFresh()

      expect(cryptoService.isEnabled()).toBe(false)
    })

    it('encrypt() should return plaintext unchanged', async () => {
      vi.stubEnv('ENCRYPTION_KEY', '')
      const { cryptoService } = await importFresh()

      const plaintext = 'sk-secret-api-key-12345'
      const result = cryptoService.encrypt(plaintext)

      // No encryption applied — output equals input
      expect(result).toBe(plaintext)
    })

    it('decrypt() should return input unchanged', async () => {
      vi.stubEnv('ENCRYPTION_KEY', '')
      const { cryptoService } = await importFresh()

      const input = 'some-plaintext-value'
      const result = cryptoService.decrypt(input)

      expect(result).toBe(input)
    })
  })

  describe('when ENCRYPTION_KEY is set', () => {
    const TEST_KEY = 'test-encryption-passphrase-32chars!'

    beforeEach(() => {
      vi.stubEnv('ENCRYPTION_KEY', TEST_KEY)
    })

    it('isEnabled() should return true', async () => {
      const { cryptoService } = await importFresh()

      expect(cryptoService.isEnabled()).toBe(true)
    })

    it('encrypt/decrypt roundtrip should recover original plaintext', async () => {
      const { cryptoService } = await importFresh()

      const plaintext = 'sk-abc123-secret-api-key'
      const encrypted = cryptoService.encrypt(plaintext)

      // Encrypted value should differ from plaintext
      expect(encrypted).not.toBe(plaintext)

      const decrypted = cryptoService.decrypt(encrypted)
      expect(decrypted).toBe(plaintext)
    })

    it('encrypt should produce different ciphertext for same plaintext (random IV)', async () => {
      const { cryptoService } = await importFresh()

      const plaintext = 'deterministic-test'
      const enc1 = cryptoService.encrypt(plaintext)
      const enc2 = cryptoService.encrypt(plaintext)

      // Different random IVs should produce different outputs
      expect(enc1).not.toBe(enc2)

      // Both should decrypt to the same value
      expect(cryptoService.decrypt(enc1)).toBe(plaintext)
      expect(cryptoService.decrypt(enc2)).toBe(plaintext)
    })

    it('wire format should include RAGF magic header', async () => {
      const { cryptoService } = await importFresh()

      const encrypted = cryptoService.encrypt('test-value')
      const raw = Buffer.from(encrypted, 'base64')

      // First 4 bytes should be the RAGF magic header
      const magic = raw.subarray(0, 4).toString('ascii')
      expect(magic).toBe('RAGF')
    })

    it('decrypt should handle non-encrypted plaintext strings gracefully', async () => {
      const { cryptoService } = await importFresh()

      // Plain string that is not valid base64 with RAGF header
      const plaintext = 'just-a-regular-api-key'
      const result = cryptoService.decrypt(plaintext)

      // Should return the input unchanged since it lacks RAGF magic
      expect(result).toBe(plaintext)
    })

    it('decrypt should handle too-short data by returning input', async () => {
      const { cryptoService } = await importFresh()

      // Create a base64 string that is too short (less than magic + IV + 1 byte)
      const tooShort = Buffer.from('RAGF').toString('base64')
      const result = cryptoService.decrypt(tooShort)

      // Should return input unchanged because payload is too short
      expect(result).toBe(tooShort)
    })

    it('decrypt should handle empty string', async () => {
      const { cryptoService } = await importFresh()

      const result = cryptoService.decrypt('')

      // Empty string lacks RAGF header — returned as-is
      expect(result).toBe('')
    })

    it('encrypt/decrypt should handle unicode content', async () => {
      const { cryptoService } = await importFresh()

      const unicode = 'Hello \u{1F600} World \u4E16\u754C'
      const encrypted = cryptoService.encrypt(unicode)
      const decrypted = cryptoService.decrypt(encrypted)

      expect(decrypted).toBe(unicode)
    })

    it('encrypt/decrypt should handle empty plaintext', async () => {
      const { cryptoService } = await importFresh()

      const encrypted = cryptoService.encrypt('')
      const decrypted = cryptoService.decrypt(encrypted)

      expect(decrypted).toBe('')
    })
  })
})
