"""Tests for UUID standardization (UUID1 -> UUID4).

Validates that get_uuid() produces RFC 4122 UUID4 hex strings:
32 lowercase hex chars, version nibble '4' at index 12,
variant bits '8'/'9'/'a'/'b' at index 16.
"""
import re
from common.misc_utils import get_uuid


def test_get_uuid_returns_32_char_hex():
    """Verify get_uuid() output is exactly 32 lowercase hex characters."""
    uid = get_uuid()
    assert len(uid) == 32
    assert re.fullmatch(r'[0-9a-f]{32}', uid), f"Not valid hex: {uid}"


def test_get_uuid_is_uuid4():
    """Verify UUID4 version nibble: character at index 12 must be '4'."""
    uid = get_uuid()
    assert uid[12] == '4', f"Version nibble is '{uid[12]}', expected '4'"


def test_get_uuid_uniqueness():
    """Verify two consecutive calls produce different UUIDs."""
    assert get_uuid() != get_uuid()


def test_get_uuid_variant_bits():
    """Verify RFC 4122 variant: character at index 16 in {'8','9','a','b'}."""
    uid = get_uuid()
    assert uid[16] in ('8', '9', 'a', 'b'), f"Variant nibble is '{uid[16]}'"
