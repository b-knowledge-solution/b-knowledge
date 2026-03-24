"""Unit tests for the retry_deadlock_operation decorator in common_service.py.

Tests that the decorator retries on deadlock OperationalError (code 1213),
gives up after max retries, passes through on success, and re-raises
non-deadlock OperationalError immediately.

Because conftest.py replaces db.services.common_service with a stub, this
module force-reloads the real module under a private alias to test the
actual decorator logic.
"""

import os
import sys
import types
import time
import importlib
import pytest
from unittest.mock import MagicMock, patch
from peewee import OperationalError

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Force-load the real common_service module to access the decorator under test.
# The conftest stubs this module, so we reload it via importlib from disk.
# ---------------------------------------------------------------------------
_real_common_service_path = os.path.join(_ADVANCE_RAG_ROOT, "db", "services", "common_service.py")
_spec = importlib.util.spec_from_file_location("_real_common_service", _real_common_service_path)
_real_common_service = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_real_common_service)

retry_deadlock_operation = _real_common_service.retry_deadlock_operation
_is_deadlock_error = _real_common_service._is_deadlock_error


def _make_deadlock_error() -> OperationalError:
    """Create an OperationalError that mimics a MySQL deadlock (code 1213).

    Returns:
        OperationalError with args[0] == 1213.
    """
    return OperationalError(1213, "Deadlock found when trying to get lock")


def _make_non_deadlock_error() -> OperationalError:
    """Create a non-deadlock OperationalError.

    Returns:
        OperationalError with a non-deadlock error code.
    """
    return OperationalError(1205, "Lock wait timeout exceeded")


class TestIsDeadlockError:
    """Tests for the _is_deadlock_error helper function."""

    def test_returns_true_for_deadlock_code(self) -> None:
        """Should return True when error code is 1213."""
        err = _make_deadlock_error()
        assert _is_deadlock_error(err) is True

    def test_returns_false_for_non_deadlock_code(self) -> None:
        """Should return False for a different error code."""
        err = _make_non_deadlock_error()
        assert _is_deadlock_error(err) is False

    def test_returns_false_for_no_args(self) -> None:
        """Should return False when OperationalError has no args."""
        err = OperationalError()
        assert _is_deadlock_error(err) is False


class TestRetryDeadlockOperation:
    """Tests for the retry_deadlock_operation decorator."""

    @patch.object(_real_common_service.time, "sleep")
    def test_retries_on_deadlock_then_succeeds(self, mock_sleep: MagicMock) -> None:
        """Should retry on deadlock and return success on subsequent attempt."""
        call_count = 0

        @retry_deadlock_operation(max_retries=3, retry_delay=0.1)
        def flaky_operation():
            """Simulated operation that fails once then succeeds."""
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise _make_deadlock_error()
            return "success"

        result = flaky_operation()

        assert result == "success"
        assert call_count == 2
        mock_sleep.assert_called_once()

    @patch.object(_real_common_service.time, "sleep")
    def test_gives_up_after_max_retries(self, mock_sleep: MagicMock) -> None:
        """Should raise OperationalError after exhausting all retry attempts."""
        call_count = 0

        @retry_deadlock_operation(max_retries=3, retry_delay=0.1)
        def always_deadlocks():
            """Simulated operation that always deadlocks."""
            nonlocal call_count
            call_count += 1
            raise _make_deadlock_error()

        with pytest.raises(OperationalError):
            always_deadlocks()

        assert call_count == 3

    @patch.object(_real_common_service.time, "sleep")
    def test_passes_through_on_success(self, mock_sleep: MagicMock) -> None:
        """Should return immediately on success without any retries."""
        @retry_deadlock_operation(max_retries=3, retry_delay=0.1)
        def immediate_success():
            """Simulated operation that succeeds on first attempt."""
            return 42

        result = immediate_success()

        assert result == 42
        mock_sleep.assert_not_called()

    @patch.object(_real_common_service.time, "sleep")
    def test_non_deadlock_error_not_retried(self, mock_sleep: MagicMock) -> None:
        """Should re-raise non-deadlock OperationalError without retrying."""
        call_count = 0

        @retry_deadlock_operation(max_retries=3, retry_delay=0.1)
        def non_deadlock_failure():
            """Simulated operation that fails with a non-deadlock error."""
            nonlocal call_count
            call_count += 1
            raise _make_non_deadlock_error()

        with pytest.raises(OperationalError):
            non_deadlock_failure()

        assert call_count == 1
        mock_sleep.assert_not_called()

    @patch.object(_real_common_service.time, "sleep")
    def test_exponential_backoff_delay(self, mock_sleep: MagicMock) -> None:
        """Should use exponential backoff between retries."""
        call_count = 0

        @retry_deadlock_operation(max_retries=4, retry_delay=0.5)
        def fails_three_times():
            """Simulated operation that fails three times before succeeding."""
            nonlocal call_count
            call_count += 1
            if call_count < 4:
                raise _make_deadlock_error()
            return "ok"

        result = fails_three_times()

        assert result == "ok"
        # Verify exponential backoff: 0.5 * 2^0, 0.5 * 2^1, 0.5 * 2^2
        delays = [c.args[0] for c in mock_sleep.call_args_list]
        assert delays == [0.5, 1.0, 2.0]

    @patch.object(_real_common_service.time, "sleep")
    def test_preserves_function_args(self, mock_sleep: MagicMock) -> None:
        """Should pass through all positional and keyword args to the wrapped function."""
        @retry_deadlock_operation(max_retries=2, retry_delay=0.1)
        def add(a, b, extra=0):
            """Simulated addition function."""
            return a + b + extra

        assert add(1, 2, extra=10) == 13
