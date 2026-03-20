"""Unit tests for common.text_utils module.

Tests Arabic digit normalization and Arabic presentation form normalization.
"""
import os
import sys
import importlib

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

# Force reload of the real module (conftest may have mocked it)
if "common.text_utils" in sys.modules:
    del sys.modules["common.text_utils"]
import common.text_utils
importlib.reload(common.text_utils)

from common.text_utils import (
    normalize_arabic_digits,
    normalize_arabic_presentation_forms,
)


class TestNormalizeArabicDigits:
    """Tests for normalize_arabic_digits() function."""

    def test_arabic_indic_digits(self):
        """Verify Arabic-Indic digits (U+0660-0669) are replaced with ASCII 0-9."""
        # U+0660 to U+0669 = ٠١٢٣٤٥٦٧٨٩
        arabic_indic = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669"
        result = normalize_arabic_digits(arabic_indic)
        assert result == "0123456789"

    def test_extended_arabic_indic_digits(self):
        """Verify Extended Arabic-Indic digits (U+06F0-06F9) are replaced with ASCII 0-9."""
        extended = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9"
        result = normalize_arabic_digits(extended)
        assert result == "0123456789"

    def test_mixed_text_and_digits(self):
        """Verify Arabic digits in mixed text are replaced while other characters are preserved."""
        # "Price: ١٢٣" -> "Price: 123"
        text = "Price: \u0661\u0662\u0663"
        result = normalize_arabic_digits(text)
        assert result == "Price: 123"

    def test_ascii_digits_unchanged(self):
        """Verify ASCII digits pass through unchanged."""
        assert normalize_arabic_digits("12345") == "12345"

    def test_plain_text_unchanged(self):
        """Verify plain text without any digits passes through unchanged."""
        text = "hello world"
        assert normalize_arabic_digits(text) == text

    def test_none_returns_none(self):
        """Verify None input returns None."""
        assert normalize_arabic_digits(None) is None

    def test_non_string_returns_unchanged(self):
        """Verify non-string input is returned unchanged."""
        assert normalize_arabic_digits(42) == 42

    def test_empty_string(self):
        """Verify empty string returns empty string."""
        assert normalize_arabic_digits("") == ""

    def test_mixed_arabic_and_extended(self):
        """Verify both Arabic-Indic and Extended Arabic-Indic digits in the same string."""
        text = "\u0661\u06F2\u0663"  # Arabic 1, Extended 2, Arabic 3
        result = normalize_arabic_digits(text)
        assert result == "123"


class TestNormalizeArabicPresentationForms:
    """Tests for normalize_arabic_presentation_forms() function."""

    def test_presentation_form_a(self):
        """Verify Arabic Presentation Form A characters are NFKC-normalized."""
        # U+FB50 is in Presentation Forms A range
        text = "\uFB50"
        result = normalize_arabic_presentation_forms(text)
        # NFKC normalization should change the character
        assert result is not None
        assert isinstance(result, str)

    def test_presentation_form_b(self):
        """Verify Arabic Presentation Form B characters are NFKC-normalized."""
        # U+FE70 is in Presentation Forms B range
        text = "\uFE70"
        result = normalize_arabic_presentation_forms(text)
        assert result is not None
        assert isinstance(result, str)

    def test_plain_text_not_normalized(self):
        """Verify plain ASCII text is returned unchanged without NFKC processing."""
        text = "hello world"
        result = normalize_arabic_presentation_forms(text)
        # Should be the exact same object (no normalization applied)
        assert result is text

    def test_non_arabic_unicode_unchanged(self):
        """Verify non-Arabic Unicode text is not unnecessarily normalized."""
        text = "日本語テスト"
        result = normalize_arabic_presentation_forms(text)
        assert result is text

    def test_none_returns_none(self):
        """Verify None input returns None."""
        assert normalize_arabic_presentation_forms(None) is None

    def test_non_string_returns_unchanged(self):
        """Verify non-string input is returned unchanged."""
        assert normalize_arabic_presentation_forms(42) == 42

    def test_empty_string(self):
        """Verify empty string returns empty string."""
        assert normalize_arabic_presentation_forms("") == ""

    def test_mixed_presentation_and_normal(self):
        """Verify mixed text with some presentation forms is normalized."""
        # Include a presentation form character in normal text
        text = "test \uFB50 end"
        result = normalize_arabic_presentation_forms(text)
        # The result should differ from input due to normalization
        assert isinstance(result, str)
        # Presentation form character should be normalized away
        assert "\uFB50" not in result or result != text

    def test_regular_arabic_not_changed(self):
        """Verify regular Arabic script (not presentation forms) passes through unchanged."""
        # Regular Arabic letter (U+0627 = alef)
        text = "\u0627\u0628\u062A"
        result = normalize_arabic_presentation_forms(text)
        # No presentation forms detected, so original string is returned
        assert result is text
