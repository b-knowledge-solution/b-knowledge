"""Unit tests for common.float_utils module.

Tests safe float conversion and overlap percentage normalization.
"""
import os
import sys
import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestGetFloat:
    """Tests for get_float() function."""

    def test_converts_string_number(self):
        """Verify string number converts to float."""
        from common.float_utils import get_float
        assert get_float("3.14") == 3.14

    def test_converts_integer(self):
        """Verify integer converts to float."""
        from common.float_utils import get_float
        assert get_float(42) == 42.0

    def test_none_returns_neg_inf(self):
        """Verify None returns negative infinity."""
        from common.float_utils import get_float
        assert get_float(None) == float("-inf")

    def test_invalid_string_returns_neg_inf(self):
        """Verify invalid string returns negative infinity."""
        from common.float_utils import get_float
        assert get_float("invalid") == float("-inf")

    def test_zero_converts(self):
        """Verify zero converts correctly."""
        from common.float_utils import get_float
        assert get_float(0) == 0.0

    def test_negative_number(self):
        """Verify negative numbers convert."""
        from common.float_utils import get_float
        assert get_float(-5.5) == -5.5


class TestNormalizeOverlappedPercent:
    """Tests for normalize_overlapped_percent() function."""

    def test_normal_percentage(self):
        """Verify normal percentage passes through."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(50) == 50

    def test_fractional_input_scaled(self):
        """Verify values between 0 and 1 are scaled by 100."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(0.5) == 50

    def test_clamps_above_90(self):
        """Verify values above 90 are clamped."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(95) == 90

    def test_clamps_below_zero(self):
        """Verify negative values are clamped to 0."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(-10) == 0

    def test_none_returns_zero(self):
        """Verify None returns 0."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(None) == 0

    def test_string_number(self):
        """Verify string number is parsed."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent("75") == 75

    def test_invalid_string_returns_zero(self):
        """Verify invalid string returns 0."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent("invalid") == 0

    def test_zero_value(self):
        """Verify zero passes through."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(0) == 0

    def test_boundary_90(self):
        """Verify exactly 90 passes through."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(90) == 90

    def test_fractional_boundary(self):
        """Verify 0.9 is scaled to 90."""
        from common.float_utils import normalize_overlapped_percent
        assert normalize_overlapped_percent(0.9) == 90
