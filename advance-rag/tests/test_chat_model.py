"""Unit tests for rag.llm.chat_model module.

Tests the LLM chat model wrappers including error classification, configuration
cleaning, retry logic, provider selection, streaming vs non-streaming response
handling, and model-specific parameter mapping. All HTTP/API calls are mocked.
"""
import asyncio
import os
import sys
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestLLMErrorCode:
    """Tests for LLMErrorCode enum values."""

    def test_error_code_values_exist(self):
        """Verify all expected error code values are defined."""
        from rag.llm.chat_model import LLMErrorCode

        expected_codes = [
            "ERROR_RATE_LIMIT", "ERROR_AUTHENTICATION", "ERROR_INVALID_REQUEST",
            "ERROR_SERVER", "ERROR_TIMEOUT", "ERROR_CONNECTION", "ERROR_MODEL",
            "ERROR_MAX_ROUNDS", "ERROR_CONTENT_FILTER", "ERROR_QUOTA",
            "ERROR_MAX_RETRIES", "ERROR_GENERIC",
        ]
        for code in expected_codes:
            assert hasattr(LLMErrorCode, code), f"Missing error code: {code}"

    def test_rate_limit_value(self):
        """Verify RATE_LIMIT error code has expected string value."""
        from rag.llm.chat_model import LLMErrorCode
        assert LLMErrorCode.ERROR_RATE_LIMIT == "RATE_LIMIT_EXCEEDED"


class TestReActMode:
    """Tests for ReActMode enum values."""

    def test_function_call_mode(self):
        """Verify FUNCTION_CALL mode value."""
        from rag.llm.chat_model import ReActMode
        assert ReActMode.FUNCTION_CALL == "function_call"

    def test_react_mode(self):
        """Verify REACT mode value."""
        from rag.llm.chat_model import ReActMode
        assert ReActMode.REACT == "react"


class TestBaseClassifyError:
    """Tests for Base._classify_error() error classification."""

    def _make_base(self):
        """Create a Base instance with mocked OpenAI clients.

        Returns:
            Base chat model instance with mocked dependencies.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.client = MagicMock()
            base.async_client = MagicMock()
            base.model_name = "test-model"
            base.max_retries = 3
            base.base_delay = 0.01
            base.max_rounds = 5
            base.is_tools = False
            base.tools = []
            base.toolcall_sessions = {}
            return base

    def test_classify_rate_limit_error(self):
        """Verify rate limit errors are classified correctly."""
        base = self._make_base()
        error = Exception("Error: rate limit exceeded, try again later")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_RATE_LIMIT

    def test_classify_429_error(self):
        """Verify HTTP 429 errors map to rate limit."""
        base = self._make_base()
        error = Exception("HTTP 429 Too Many Requests")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_RATE_LIMIT

    def test_classify_auth_error(self):
        """Verify authentication errors are classified correctly."""
        base = self._make_base()
        error = Exception("Invalid API key provided: sk-...")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_AUTHENTICATION

    def test_classify_server_error(self):
        """Verify server errors (500/502/503) are classified correctly."""
        base = self._make_base()
        error = Exception("503 Service Unavailable")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_SERVER

    def test_classify_timeout_error(self):
        """Verify timeout errors are classified correctly."""
        base = self._make_base()
        error = Exception("Request timed out after 600 seconds")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_TIMEOUT

    def test_classify_connection_error(self):
        """Verify connection/network errors are classified correctly."""
        base = self._make_base()
        error = Exception("Connection refused: network unreachable")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_CONNECTION

    def test_classify_quota_error(self):
        """Verify quota/billing errors are classified correctly."""
        base = self._make_base()
        error = Exception("Insufficient quota, please check your billing plan")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_QUOTA

    def test_classify_content_filter_error(self):
        """Verify content filter errors are classified correctly."""
        base = self._make_base()
        error = Exception("Content blocked by safety policy")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_CONTENT_FILTER

    def test_classify_model_not_found_error(self):
        """Verify model not found errors are classified correctly."""
        base = self._make_base()
        error = Exception("Model gpt-99 does not exist")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_MODEL

    def test_classify_generic_error(self):
        """Verify unrecognized errors fall back to GENERIC."""
        base = self._make_base()
        error = Exception("Something completely unexpected happened")
        from rag.llm.chat_model import LLMErrorCode
        assert base._classify_error(error) == LLMErrorCode.ERROR_GENERIC


class TestBaseCleanConf:
    """Tests for Base._clean_conf() configuration sanitization."""

    def _make_base(self):
        """Create a Base instance with mocked clients.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.model_name = "gpt-4o"
            return base

    def test_removes_max_tokens(self):
        """Verify max_tokens is removed from config."""
        base = self._make_base()
        conf = {"max_tokens": 1000, "temperature": 0.7}
        result = base._clean_conf(conf)
        assert "max_tokens" not in result
        assert "temperature" in result

    def test_filters_unsupported_params(self):
        """Verify unknown parameters are filtered out."""
        base = self._make_base()
        conf = {"temperature": 0.7, "unsupported_param": True, "random_key": 42}
        result = base._clean_conf(conf)
        assert "temperature" in result
        assert "unsupported_param" not in result
        assert "random_key" not in result

    def test_gpt5_clears_all_params(self):
        """Verify GPT-5 models get empty generation config."""
        base = self._make_base()
        base.model_name = "gpt-5-turbo"
        conf = {"temperature": 0.7, "top_p": 0.9}
        result = base._clean_conf(conf)
        # GPT-5 returns empty dict to prevent parameter issues
        assert result == {}

    def test_allows_whitelisted_params(self):
        """Verify whitelisted parameters are preserved."""
        base = self._make_base()
        conf = {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_completion_tokens": 2000,
            "stop": ["\n"],
            "presence_penalty": 0.5,
            "frequency_penalty": 0.3,
            "seed": 42,
        }
        result = base._clean_conf(conf)
        # All of these should be in the allowed list
        for key in conf:
            assert key in result


class TestBaseShouldRetry:
    """Tests for Base._should_retry() retry decision logic."""

    def _make_base(self):
        """Create a Base instance.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.model_name = "test-model"
            return base

    def test_retries_on_rate_limit(self):
        """Verify rate limit errors trigger retry."""
        base = self._make_base()
        from rag.llm.chat_model import LLMErrorCode
        assert base._should_retry(LLMErrorCode.ERROR_RATE_LIMIT) is True

    def test_retries_on_server_error(self):
        """Verify server errors trigger retry."""
        base = self._make_base()
        from rag.llm.chat_model import LLMErrorCode
        assert base._should_retry(LLMErrorCode.ERROR_SERVER) is True

    def test_no_retry_on_auth_error(self):
        """Verify authentication errors do not trigger retry."""
        base = self._make_base()
        from rag.llm.chat_model import LLMErrorCode
        assert base._should_retry(LLMErrorCode.ERROR_AUTHENTICATION) is False

    def test_no_retry_on_content_filter(self):
        """Verify content filter errors do not trigger retry."""
        base = self._make_base()
        from rag.llm.chat_model import LLMErrorCode
        assert base._should_retry(LLMErrorCode.ERROR_CONTENT_FILTER) is False

    def test_no_retry_on_model_error(self):
        """Verify model errors do not trigger retry."""
        base = self._make_base()
        from rag.llm.chat_model import LLMErrorCode
        assert base._should_retry(LLMErrorCode.ERROR_MODEL) is False


class TestBaseExceptions:
    """Tests for Base._exceptions() synchronous error handling."""

    def _make_base(self):
        """Create a Base instance with short retry delays.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.model_name = "test-model"
            base.max_retries = 2
            # Use very small delay to keep tests fast
            base.base_delay = 0.0001
            return base

    def test_returns_none_for_retryable_error(self):
        """Verify retryable errors return None (indicating retry)."""
        base = self._make_base()
        error = Exception("503 server error, service unavailable")
        # Attempt 0 (not last attempt) should return None for retryable error
        result = base._exceptions(error, 0)
        assert result is None

    def test_returns_error_message_on_max_retries(self):
        """Verify max retries returns an error message string."""
        base = self._make_base()
        error = Exception("503 server error")
        # Last attempt returns error message instead of None
        result = base._exceptions(error, base.max_retries)
        from rag.llm.chat_model import ERROR_PREFIX
        assert result is not None
        assert ERROR_PREFIX in result

    def test_returns_error_for_non_retryable(self):
        """Verify non-retryable errors return error message immediately."""
        base = self._make_base()
        error = Exception("Invalid API key provided")
        result = base._exceptions(error, 0)
        from rag.llm.chat_model import ERROR_PREFIX
        assert result is not None
        assert ERROR_PREFIX in result


class TestBaseGetDelay:
    """Tests for Base._get_delay() jittered backoff."""

    def _make_base(self):
        """Create a Base instance.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.base_delay = 2.0
            return base

    def test_delay_is_positive(self):
        """Verify delay is always positive."""
        base = self._make_base()
        for _ in range(10):
            assert base._get_delay() > 0

    def test_delay_within_expected_range(self):
        """Verify delay falls within the jittered range [10x, 150x] of base_delay."""
        base = self._make_base()
        for _ in range(50):
            delay = base._get_delay()
            # base_delay * 10 to base_delay * 150
            assert delay >= base.base_delay * 10
            assert delay <= base.base_delay * 150


class TestLengthNotifications:
    """Tests for truncation notification constants."""

    def test_chinese_notification_contains_chinese(self):
        """Verify Chinese truncation notice uses Chinese characters."""
        from rag.llm.chat_model import LENGTH_NOTIFICATION_CN
        # Should contain Chinese characters
        assert "截断" in LENGTH_NOTIFICATION_CN

    def test_english_notification_contains_english(self):
        """Verify English truncation notice uses English text."""
        from rag.llm.chat_model import LENGTH_NOTIFICATION_EN
        assert "truncated" in LENGTH_NOTIFICATION_EN

    def test_error_prefix_format(self):
        """Verify error prefix is the expected sentinel string."""
        from rag.llm.chat_model import ERROR_PREFIX
        assert ERROR_PREFIX == "**ERROR**"


class TestBaseAsyncExceptions:
    """Tests for Base._exceptions_async() asynchronous error handling."""

    def _make_base(self):
        """Create a Base instance for async exception testing.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.model_name = "test-model"
            base.max_retries = 2
            base.base_delay = 0.0001
            return base

    def test_async_returns_none_for_retryable(self):
        """Verify async retryable errors return None for retry."""
        base = self._make_base()
        error = Exception("rate limit exceeded")
        result = asyncio.get_event_loop().run_until_complete(
            base._exceptions_async(error, 0)
        )
        assert result is None

    def test_async_returns_error_on_max_retries(self):
        """Verify async max retries returns an error message."""
        base = self._make_base()
        error = Exception("rate limit exceeded")
        result = asyncio.get_event_loop().run_until_complete(
            base._exceptions_async(error, base.max_retries)
        )
        assert result is not None


class TestBaseLengthStop:
    """Tests for Base._length_stop() truncation notification."""

    def _make_base(self):
        """Create a Base instance.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            return base

    def test_english_text_gets_english_notification(self):
        """Verify English text receives English truncation notification."""
        base = self._make_base()
        from rag.llm.chat_model import LENGTH_NOTIFICATION_EN
        result = base._length_stop("This is an English response")
        assert LENGTH_NOTIFICATION_EN in result

    def test_original_text_preserved(self):
        """Verify original text is preserved in the result."""
        base = self._make_base()
        original = "Some answer text"
        result = base._length_stop(original)
        assert original in result
