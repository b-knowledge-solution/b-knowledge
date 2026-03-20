"""Unit tests for common.encoding_utils module.

Tests string/bytes conversion, xxhash hashing, and Base64 encoding.
"""
import os
import sys

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from common.encoding_utils import (
    string_to_bytes,
    bytes_to_string,
    hash128,
    encode_to_base64,
)


class TestStringToBytes:
    """Tests for string_to_bytes() function."""

    def test_converts_string_to_bytes(self):
        """Verify a plain string is encoded to UTF-8 bytes."""
        result = string_to_bytes("hello")
        assert result == b"hello"
        assert isinstance(result, bytes)

    def test_passes_through_bytes(self):
        """Verify bytes input is returned unchanged."""
        data = b"already bytes"
        result = string_to_bytes(data)
        assert result is data

    def test_unicode_string(self):
        """Verify Unicode string is correctly encoded to UTF-8 bytes."""
        result = string_to_bytes("日本語")
        assert isinstance(result, bytes)
        assert result.decode("utf-8") == "日本語"

    def test_empty_string(self):
        """Verify empty string converts to empty bytes."""
        result = string_to_bytes("")
        assert result == b""


class TestBytesToString:
    """Tests for bytes_to_string() function."""

    def test_converts_bytes_to_string(self):
        """Verify UTF-8 bytes are decoded to a string."""
        result = bytes_to_string(b"hello")
        assert result == "hello"
        assert isinstance(result, str)

    def test_unicode_bytes(self):
        """Verify Unicode bytes are decoded correctly."""
        data = "こんにちは".encode("utf-8")
        result = bytes_to_string(data)
        assert result == "こんにちは"

    def test_empty_bytes(self):
        """Verify empty bytes decode to empty string."""
        result = bytes_to_string(b"")
        assert result == ""


class TestHash128:
    """Tests for hash128() function."""

    def test_returns_hex_string(self):
        """Verify the result is a 32-character hex string."""
        result = hash128("test data")
        assert isinstance(result, str)
        # 128 bits = 32 hex characters
        assert len(result) == 32
        # Only hex characters
        assert all(c in "0123456789abcdef" for c in result)

    def test_deterministic(self):
        """Verify the same input always produces the same hash."""
        assert hash128("hello") == hash128("hello")

    def test_different_inputs_differ(self):
        """Verify different inputs produce different hashes."""
        assert hash128("hello") != hash128("world")

    def test_empty_string(self):
        """Verify empty string produces a valid hash."""
        result = hash128("")
        assert len(result) == 32

    def test_unicode_input(self):
        """Verify Unicode input produces a valid hash."""
        result = hash128("データ")
        assert len(result) == 32


class TestEncodeToBase64:
    """Tests for encode_to_base64() function."""

    def test_basic_encoding(self):
        """Verify basic string is Base64-encoded correctly."""
        import base64
        result = encode_to_base64("hello")
        # Decode and verify round-trip
        decoded = base64.b64decode(result).decode("utf-8")
        assert decoded == "hello"

    def test_returns_string(self):
        """Verify the result is a string, not bytes."""
        result = encode_to_base64("test")
        assert isinstance(result, str)

    def test_known_encoding(self):
        """Verify a known Base64 encoding result."""
        # base64("hello") = "aGVsbG8="
        assert encode_to_base64("hello") == "aGVsbG8="

    def test_empty_string(self):
        """Verify empty string encodes to empty Base64."""
        assert encode_to_base64("") == ""

    def test_unicode_encoding(self):
        """Verify Unicode string is Base64-encoded through UTF-8."""
        import base64
        result = encode_to_base64("café")
        decoded = base64.b64decode(result).decode("utf-8")
        assert decoded == "café"
