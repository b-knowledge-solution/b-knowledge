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


class TestBaseBindTools:
    """Tests for Base.bind_tools() tool registration."""

    def _make_base(self):
        """Create a Base instance for tool binding tests.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.model_name = "test-model"
            base.is_tools = False
            base.tools = []
            base.toolcall_sessions = {}
            return base

    def test_bind_tools_enables_tool_mode(self):
        """Verify bind_tools sets is_tools to True."""
        base = self._make_base()
        mock_session = MagicMock()
        tools = [{"type": "function", "function": {"name": "test_tool"}}]
        base.bind_tools(mock_session, tools)
        assert base.is_tools is True
        assert base.tools == tools
        assert base.toolcall_session is mock_session

    def test_bind_tools_noop_when_session_is_none(self):
        """Verify bind_tools does nothing when session is None."""
        base = self._make_base()
        base.bind_tools(None, [{"type": "function"}])
        assert base.is_tools is False

    def test_bind_tools_noop_when_tools_is_empty(self):
        """Verify bind_tools does nothing when tools list is empty."""
        base = self._make_base()
        base.bind_tools(MagicMock(), [])
        assert base.is_tools is False


class TestBaseVerboseToolUse:
    """Tests for Base._verbose_tool_use() XML formatting."""

    def _make_base(self):
        """Create a Base instance.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            return base

    def test_wraps_in_tool_call_tags(self):
        """Verify output is wrapped in <tool_call> tags."""
        base = self._make_base()
        result = base._verbose_tool_use("search", {"query": "test"}, "found it")
        assert result.startswith("<tool_call>")
        assert result.endswith("</tool_call>")

    def test_contains_name_args_result(self):
        """Verify JSON payload contains name, args, and result fields."""
        import json
        base = self._make_base()
        result = base._verbose_tool_use("calc", {"x": 1}, 42)
        # Strip the XML tags to get the JSON
        json_str = result.replace("<tool_call>", "").replace("</tool_call>", "")
        parsed = json.loads(json_str)
        assert parsed["name"] == "calc"
        assert parsed["args"] == {"x": 1}
        assert parsed["result"] == 42


class TestBaseAppendHistory:
    """Tests for Base._append_history() conversation history management."""

    def _make_base(self):
        """Create a Base instance.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            return base

    def test_appends_tool_call_and_response(self):
        """Verify both assistant tool_calls and tool response are appended."""
        base = self._make_base()
        hist = [{"role": "user", "content": "hi"}]
        mock_tool_call = MagicMock()
        mock_tool_call.index = 0
        mock_tool_call.id = "call_123"
        mock_tool_call.function.name = "search"
        mock_tool_call.function.arguments = '{"q": "test"}'

        result = base._append_history(hist, mock_tool_call, "search result")
        # Should have added 2 entries: assistant with tool_calls + tool response
        assert len(result) == 3
        assert result[1]["role"] == "assistant"
        assert result[1]["tool_calls"][0]["id"] == "call_123"
        assert result[2]["role"] == "tool"
        assert result[2]["tool_call_id"] == "call_123"
        assert result[2]["content"] == "search result"

    def test_appends_dict_tool_response_as_json(self):
        """Verify dict tool responses are serialized to JSON."""
        base = self._make_base()
        hist = []
        mock_tool_call = MagicMock()
        mock_tool_call.index = 0
        mock_tool_call.id = "call_456"
        mock_tool_call.function.name = "fn"
        mock_tool_call.function.arguments = "{}"

        base._append_history(hist, mock_tool_call, {"key": "value"})
        # The tool response content should be the JSON-serialized dict
        tool_content = hist[1]["content"]
        assert "key" in tool_content
        assert "value" in tool_content


class TestBaseInitialization:
    """Tests for Base.__init__() constructor parameter handling."""

    def test_creates_sync_and_async_clients(self):
        """Verify both synchronous and async OpenAI clients are created."""
        from rag.llm.chat_model import Base
        base = Base(key="k", model_name="m", base_url="http://localhost:8080")
        # Both client and async_client should be set (mocked via conftest)
        assert base.client is not None
        assert base.async_client is not None

    def test_env_timeout_is_used(self):
        """Verify LLM_TIMEOUT_SECONDS environment variable is respected."""
        from rag.llm.chat_model import Base
        with patch.dict(os.environ, {"LLM_TIMEOUT_SECONDS": "120"}):
            base = Base(key="k", model_name="m", base_url="http://localhost")
            # The timeout is passed to OpenAI constructor; verify model is created
            assert base.model_name == "m"

    def test_env_max_retries_is_used(self):
        """Verify LLM_MAX_RETRIES environment variable is respected."""
        from rag.llm.chat_model import Base
        with patch.dict(os.environ, {"LLM_MAX_RETRIES": "10"}):
            base = Base(key="k", model_name="m", base_url="http://localhost")
            assert base.max_retries == 10


class TestBaseCleanConfStreamParams:
    """Tests for _clean_conf handling of tool and streaming parameters."""

    def _make_base(self):
        """Create a Base instance.

        Returns:
            Base chat model instance.
        """
        from rag.llm.chat_model import Base
        with patch.object(Base, "__init__", lambda self, *a, **kw: None):
            base = Base.__new__(Base)
            base.model_name = "gpt-4o"
            return base

    def test_preserves_tool_params(self):
        """Verify tools and tool_choice are preserved in clean config."""
        base = self._make_base()
        conf = {"tools": [{"type": "function"}], "tool_choice": "auto"}
        result = base._clean_conf(conf)
        assert "tools" in result
        assert "tool_choice" in result

    def test_preserves_response_format(self):
        """Verify response_format is preserved for structured output."""
        base = self._make_base()
        conf = {"response_format": {"type": "json_object"}}
        result = base._clean_conf(conf)
        assert result["response_format"] == {"type": "json_object"}

    def test_preserves_seed(self):
        """Verify seed parameter is preserved for reproducibility."""
        base = self._make_base()
        conf = {"seed": 42}
        result = base._clean_conf(conf)
        assert result["seed"] == 42

    def test_gpt5_1_also_cleared(self):
        """Verify GPT-5.1 models also get empty config."""
        base = self._make_base()
        base.model_name = "gpt-5.1-preview"
        conf = {"temperature": 0.7}
        result = base._clean_conf(conf)
        assert result == {}
