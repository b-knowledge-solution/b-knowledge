"""Unit tests for common.crypto_utils module.

Tests AES-128-CBC, AES-256-CBC, SM4-CBC encryption/decryption,
the CryptoUtil factory, and the convenience decrypt() function.
All crypto operations are tested in-process without external dependencies.
"""
import os
import sys

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from common.crypto_utils import (
    BaseCrypto,
    AESCrypto,
    AES128CBC,
    AES256CBC,
    SM4CBC,
    CryptoUtil,
    decrypt,
)


# ── BaseCrypto ────────────────────────────────────────────────────────

class TestBaseCrypto:
    """Tests for BaseCrypto key normalization and template methods."""

    def test_normalize_key_from_string(self):
        """Verify string key is derived via PBKDF2 to correct length."""
        crypto = AES256CBC(key="my_secret_key")
        assert isinstance(crypto.key, bytes)
        assert len(crypto.key) == 32

    def test_normalize_key_from_bytes(self):
        """Verify bytes key is derived via PBKDF2 to correct length."""
        crypto = AES256CBC(key=b"my_secret_key")
        assert len(crypto.key) == 32

    def test_deterministic_key_derivation(self):
        """Verify the same input key always produces the same derived key."""
        c1 = AES256CBC(key="test")
        c2 = AES256CBC(key="test")
        assert c1.key == c2.key

    def test_different_keys_produce_different_derived_keys(self):
        """Verify different input keys produce different derived keys."""
        c1 = AES256CBC(key="key_a")
        c2 = AES256CBC(key="key_b")
        assert c1.key != c2.key

    def test_magic_header_present(self):
        """Verify ENCRYPTED_MAGIC is the expected 4-byte header."""
        assert BaseCrypto.ENCRYPTED_MAGIC == b"RAGF"

    def test_decrypt_unencrypted_data_passes_through(self):
        """Verify data without the magic header is returned as-is."""
        crypto = AES256CBC(key="test_key")
        plain = b"not encrypted data"
        assert crypto.decrypt(plain) == plain

    def test_base_encrypt_raises_not_implemented(self):
        """Verify BaseCrypto._encrypt raises NotImplementedError."""
        crypto = BaseCrypto.__new__(BaseCrypto)
        crypto.block_size = 16
        crypto.key_length = 32
        crypto.iv_length = 16
        crypto.key = b"x" * 32
        crypto.iv = None
        with pytest.raises(NotImplementedError):
            crypto.encrypt(b"data")

    def test_base_decrypt_raises_not_implemented(self):
        """Verify BaseCrypto._decrypt raises NotImplementedError."""
        crypto = BaseCrypto.__new__(BaseCrypto)
        with pytest.raises(NotImplementedError):
            crypto._decrypt(b"data", b"iv")


# ── AES128CBC ─────────────────────────────────────────────────────────

class TestAES128CBC:
    """Tests for AES-128-CBC encryption and decryption."""

    def test_encrypt_decrypt_roundtrip(self):
        """Verify data survives encrypt-then-decrypt roundtrip."""
        crypto = AES128CBC(key="test_key_128")
        plaintext = b"Hello, AES-128!"
        encrypted = crypto.encrypt(plaintext)
        decrypted = crypto.decrypt(encrypted)
        assert decrypted == plaintext

    def test_key_length_is_16(self):
        """Verify derived key is 16 bytes for AES-128."""
        crypto = AES128CBC(key="any_key")
        assert len(crypto.key) == 16

    def test_encrypted_starts_with_magic(self):
        """Verify encrypted output starts with RAGF magic header."""
        crypto = AES128CBC(key="key")
        encrypted = crypto.encrypt(b"data")
        assert encrypted[:4] == b"RAGF"

    def test_encrypted_contains_iv(self):
        """Verify encrypted output contains the IV after the magic header."""
        crypto = AES128CBC(key="key")
        encrypted = crypto.encrypt(b"data")
        # Magic (4) + IV (16) + ciphertext
        assert len(encrypted) > 20

    def test_empty_data(self):
        """Verify empty data encrypts and decrypts correctly (PKCS7 pads)."""
        crypto = AES128CBC(key="key")
        encrypted = crypto.encrypt(b"")
        decrypted = crypto.decrypt(encrypted)
        assert decrypted == b""

    def test_large_data(self):
        """Verify large data (multiple blocks) encrypts and decrypts correctly."""
        crypto = AES128CBC(key="key")
        plaintext = b"A" * 10000
        encrypted = crypto.encrypt(plaintext)
        decrypted = crypto.decrypt(encrypted)
        assert decrypted == plaintext


# ── AES256CBC ─────────────────────────────────────────────────────────

class TestAES256CBC:
    """Tests for AES-256-CBC encryption and decryption."""

    def test_encrypt_decrypt_roundtrip(self):
        """Verify data survives encrypt-then-decrypt roundtrip."""
        crypto = AES256CBC(key="test_key_256")
        plaintext = b"Hello, AES-256!"
        encrypted = crypto.encrypt(plaintext)
        decrypted = crypto.decrypt(encrypted)
        assert decrypted == plaintext

    def test_key_length_is_32(self):
        """Verify derived key is 32 bytes for AES-256."""
        crypto = AES256CBC(key="any_key")
        assert len(crypto.key) == 32

    def test_different_encryptions_differ(self):
        """Verify two encryptions of the same data produce different ciphertexts (random IV)."""
        crypto = AES256CBC(key="key")
        e1 = crypto.encrypt(b"same data")
        e2 = crypto.encrypt(b"same data")
        # IVs are random, so ciphertexts should differ
        assert e1 != e2

    def test_unicode_data_as_bytes(self):
        """Verify UTF-8 encoded Unicode data roundtrips correctly."""
        crypto = AES256CBC(key="key")
        plaintext = "日本語テスト".encode("utf-8")
        encrypted = crypto.encrypt(plaintext)
        decrypted = crypto.decrypt(encrypted)
        assert decrypted.decode("utf-8") == "日本語テスト"

    def test_fixed_iv_produces_same_ciphertext(self):
        """Verify fixed IV produces identical ciphertexts for identical data."""
        iv = b"\x00" * 16
        c1 = AES256CBC(key="key", iv=iv)
        c2 = AES256CBC(key="key", iv=iv)
        e1 = c1.encrypt(b"test")
        e2 = c2.encrypt(b"test")
        assert e1 == e2


# ── SM4CBC ────────────────────────────────────────────────────────────

class TestSM4CBC:
    """Tests for SM4-CBC encryption and decryption."""

    def test_encrypt_decrypt_roundtrip(self):
        """Verify data survives encrypt-then-decrypt roundtrip."""
        crypto = SM4CBC(key="test_key_sm4")
        plaintext = b"Hello, SM4!"
        encrypted = crypto.encrypt(plaintext)
        decrypted = crypto.decrypt(encrypted)
        assert decrypted == plaintext

    def test_key_length_is_16(self):
        """Verify derived key is 16 bytes for SM4."""
        crypto = SM4CBC(key="any_key")
        assert len(crypto.key) == 16

    def test_encrypted_starts_with_magic(self):
        """Verify encrypted output starts with RAGF magic header."""
        crypto = SM4CBC(key="key")
        encrypted = crypto.encrypt(b"data")
        assert encrypted[:4] == b"RAGF"

    def test_large_data(self):
        """Verify large data roundtrips correctly."""
        crypto = SM4CBC(key="key")
        plaintext = b"B" * 5000
        encrypted = crypto.encrypt(plaintext)
        decrypted = crypto.decrypt(encrypted)
        assert decrypted == plaintext


# ── CryptoUtil ────────────────────────────────────────────────────────

class TestCryptoUtil:
    """Tests for CryptoUtil factory class."""

    def test_aes_256_cbc_default(self):
        """Verify default algorithm creates AES-256-CBC instance."""
        util = CryptoUtil(key="my_key")
        assert util.algorithm_name == "aes-256-cbc"
        assert isinstance(util.crypto, AES256CBC)

    def test_aes_128_cbc(self):
        """Verify aes-128-cbc algorithm creates AES128CBC instance."""
        util = CryptoUtil(algorithm="aes-128-cbc", key="my_key")
        assert isinstance(util.crypto, AES128CBC)

    def test_sm4_cbc(self):
        """Verify sm4-cbc algorithm creates SM4CBC instance."""
        util = CryptoUtil(algorithm="sm4-cbc", key="my_key")
        assert isinstance(util.crypto, SM4CBC)

    def test_unsupported_algorithm_raises(self):
        """Verify unsupported algorithm name raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported algorithm"):
            CryptoUtil(algorithm="des-cbc", key="key")

    def test_no_key_raises(self):
        """Verify missing key raises ValueError."""
        with pytest.raises(ValueError, match="Encryption key not provided"):
            CryptoUtil(key=None)

    def test_encrypt_decrypt_roundtrip(self):
        """Verify CryptoUtil encrypt/decrypt roundtrip works."""
        util = CryptoUtil(key="factory_key")
        plaintext = b"factory test data"
        encrypted = util.encrypt(plaintext)
        decrypted = util.decrypt(encrypted)
        assert decrypted == plaintext

    def test_cross_instance_decrypt(self):
        """Verify data encrypted by one instance can be decrypted by another with the same key."""
        u1 = CryptoUtil(key="shared_key")
        u2 = CryptoUtil(key="shared_key")
        encrypted = u1.encrypt(b"cross instance")
        decrypted = u2.decrypt(encrypted)
        assert decrypted == b"cross instance"

    def test_wrong_key_fails(self):
        """Verify decryption with wrong key raises or produces garbage."""
        u1 = CryptoUtil(key="correct_key")
        u2 = CryptoUtil(key="wrong_key")
        encrypted = u1.encrypt(b"secret data")
        # Decryption with wrong key should raise due to bad padding
        with pytest.raises(Exception):
            u2.decrypt(encrypted)


# ── decrypt convenience function ──────────────────────────────────────

class TestDecryptFunction:
    """Tests for the module-level decrypt() convenience function."""

    def test_empty_value_returns_as_is(self):
        """Verify empty string returns empty string."""
        assert decrypt("") == ""

    def test_none_value_returns_none(self):
        """Verify None returns None (falsy passthrough)."""
        assert decrypt(None) is None

    def test_crypto_disabled_returns_value(self):
        """Verify value is returned unchanged when crypto is disabled."""
        # Ensure RAGFLOW_CRYPTO_ENABLED is not set to 'true'
        os.environ.pop("RAGFLOW_CRYPTO_ENABLED", None)
        result = decrypt("plain_api_key")
        assert result == "plain_api_key"

    def test_crypto_enabled_but_no_key_returns_value(self):
        """Verify value is returned unchanged when crypto key is missing."""
        os.environ["RAGFLOW_CRYPTO_ENABLED"] = "true"
        os.environ.pop("RAGFLOW_CRYPTO_KEY", None)
        try:
            result = decrypt("some_value")
            assert result == "some_value"
        finally:
            os.environ.pop("RAGFLOW_CRYPTO_ENABLED", None)

    def test_crypto_enabled_with_key_decrypts(self):
        """Verify encrypted value is properly decrypted when crypto is enabled."""
        key = "test_decrypt_key"
        os.environ["RAGFLOW_CRYPTO_ENABLED"] = "true"
        os.environ["RAGFLOW_CRYPTO_KEY"] = key
        os.environ["RAGFLOW_CRYPTO_ALGORITHM"] = "aes-256-cbc"
        try:
            # Encrypt a value first
            util = CryptoUtil(key=key)
            plaintext = "my_secret_api_key"
            encrypted_bytes = util.encrypt(plaintext.encode("utf-8"))
            # Store as latin-1 string (how the decrypt function expects it)
            encrypted_str = encrypted_bytes.decode("latin-1")

            result = decrypt(encrypted_str)
            assert result == plaintext
        finally:
            os.environ.pop("RAGFLOW_CRYPTO_ENABLED", None)
            os.environ.pop("RAGFLOW_CRYPTO_KEY", None)
            os.environ.pop("RAGFLOW_CRYPTO_ALGORITHM", None)

    def test_not_encrypted_value_with_crypto_enabled(self):
        """Verify non-encrypted value is returned as-is even when crypto is enabled."""
        os.environ["RAGFLOW_CRYPTO_ENABLED"] = "true"
        os.environ["RAGFLOW_CRYPTO_KEY"] = "some_key"
        try:
            # Value doesn't start with RAGF magic, so decrypt returns as-is
            result = decrypt("plain_text_value")
            assert result == "plain_text_value"
        finally:
            os.environ.pop("RAGFLOW_CRYPTO_ENABLED", None)
            os.environ.pop("RAGFLOW_CRYPTO_KEY", None)
