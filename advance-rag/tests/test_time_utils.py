"""Unit tests for common.time_utils module.

Tests timestamp conversion, date formatting, and time delta calculations
without requiring heavy ML dependencies.
"""
import datetime
import os
import sys
import time
import types
import importlib
import pytest
from unittest.mock import MagicMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

# Force reload of the real modules (conftest may have mocked them)
# dateutil is used by format_iso_8601_to_ymd_hms
for _mod in ["dateutil", "dateutil.parser", "common.time_utils"]:
    if _mod in sys.modules:
        del sys.modules[_mod]
import common.time_utils
importlib.reload(common.time_utils)


class TestCurrentTimestamp:
    """Tests for current_timestamp() function."""

    def test_returns_millisecond_timestamp(self):
        """Verify timestamp is in milliseconds (13 digits)."""
        from common.time_utils import current_timestamp
        ts = current_timestamp()
        assert isinstance(ts, int)
        assert len(str(ts)) == 13

    def test_timestamp_is_close_to_now(self):
        """Verify timestamp is within 1 second of current time."""
        from common.time_utils import current_timestamp
        now_ms = int(time.time() * 1000)
        ts = current_timestamp()
        assert abs(ts - now_ms) < 1000


class TestTimestampToDate:
    """Tests for timestamp_to_date() function."""

    def test_converts_millisecond_timestamp(self):
        """Verify conversion from millisecond timestamp to formatted string."""
        from common.time_utils import timestamp_to_date
        # Use a known timestamp
        result = timestamp_to_date(1704067200000)
        assert isinstance(result, str)
        # Should match YYYY-MM-DD HH:MM:SS format
        assert len(result) == 19

    def test_none_timestamp_uses_current_time(self):
        """Verify None input defaults to current time."""
        from common.time_utils import timestamp_to_date
        result = timestamp_to_date(None)
        assert isinstance(result, str)

    def test_custom_format_string(self):
        """Verify custom format string is applied."""
        from common.time_utils import timestamp_to_date
        result = timestamp_to_date(1704067200000, "%Y-%m-%d")
        assert len(result) == 10


class TestDateStringToTimestamp:
    """Tests for date_string_to_timestamp() function."""

    def test_converts_date_string(self):
        """Verify date string conversion to millisecond timestamp."""
        from common.time_utils import date_string_to_timestamp
        ts = date_string_to_timestamp("2024-01-01 00:00:00")
        assert isinstance(ts, int)
        assert len(str(ts)) == 13

    def test_roundtrip_conversion(self):
        """Verify timestamp -> date -> timestamp roundtrip."""
        from common.time_utils import timestamp_to_date, date_string_to_timestamp
        original = 1704067200000
        date_str = timestamp_to_date(original)
        result = date_string_to_timestamp(date_str)
        assert result == original


class TestDatetimeFormat:
    """Tests for datetime_format() function."""

    def test_removes_microseconds(self):
        """Verify microseconds are stripped."""
        from common.time_utils import datetime_format
        dt = datetime.datetime(2024, 1, 1, 12, 30, 45, 123456)
        result = datetime_format(dt)
        assert result.microsecond == 0
        assert result.second == 45

    def test_preserves_other_fields(self):
        """Verify year, month, day, hour, minute, second are preserved."""
        from common.time_utils import datetime_format
        dt = datetime.datetime(2024, 6, 15, 14, 30, 45, 999999)
        result = datetime_format(dt)
        assert result.year == 2024
        assert result.month == 6
        assert result.day == 15
        assert result.hour == 14
        assert result.minute == 30


class TestGetFormatTime:
    """Tests for get_format_time() function."""

    def test_returns_datetime_without_microseconds(self):
        """Verify current datetime has no microseconds."""
        from common.time_utils import get_format_time
        result = get_format_time()
        assert isinstance(result, datetime.datetime)
        assert result.microsecond == 0


class TestDeltaSeconds:
    """Tests for delta_seconds() function."""

    def test_returns_positive_for_past_date(self):
        """Verify positive result for a date in the past."""
        from common.time_utils import delta_seconds
        past = (datetime.datetime.now() - datetime.timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S")
        result = delta_seconds(past)
        assert result > 3500  # roughly 1 hour

    def test_returns_near_zero_for_now(self):
        """Verify near-zero result for current time."""
        from common.time_utils import delta_seconds
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        result = delta_seconds(now)
        assert abs(result) < 2


class TestFormatIso8601ToYmdHms:
    """Tests for format_iso_8601_to_ymd_hms() function."""

    def test_converts_iso_string(self):
        """Verify ISO 8601 string conversion."""
        from common.time_utils import format_iso_8601_to_ymd_hms
        result = format_iso_8601_to_ymd_hms("2024-01-01T12:00:00Z")
        assert "2024-01-01" in result
        assert "12:00:00" in result

    def test_invalid_string_returns_input(self):
        """Verify invalid input is returned unchanged."""
        from common.time_utils import format_iso_8601_to_ymd_hms
        result = format_iso_8601_to_ymd_hms("not-a-date")
        assert result == "not-a-date"
