"""Unit tests for common.token_utils module.

Tests token counting, truncation, and LLM response token extraction
using the tiktoken cl100k_base encoding. The tiktoken encoder is used
directly (no mocking) since it is a pure computation dependency.
"""
import os
import sys
import types

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestNumTokensFromString:
    """Tests for num_tokens_from_string() function."""

    def test_empty_string_returns_zero(self):
        """Verify an empty string produces zero tokens."""
        from common.token_utils import num_tokens_from_string
        assert num_tokens_from_string("") == 0

    def test_single_word(self):
        """Verify a single word produces at least one token."""
        from common.token_utils import num_tokens_from_string
        result = num_tokens_from_string("hello")
        assert result >= 1

    def test_longer_text_produces_more_tokens(self):
        """Verify longer text produces more tokens than shorter text."""
        from common.token_utils import num_tokens_from_string
        short = num_tokens_from_string("hi")
        long = num_tokens_from_string("This is a much longer sentence with many words in it.")
        assert long > short

    def test_known_token_count(self):
        """Verify a known phrase produces the expected token count.

        'hello world' with cl100k_base yields 2 tokens.
        """
        from common.token_utils import num_tokens_from_string
        assert num_tokens_from_string("hello world") == 2

    def test_unicode_text(self):
        """Verify Unicode text is tokenized without error."""
        from common.token_utils import num_tokens_from_string
        result = num_tokens_from_string("こんにちは世界")
        assert result > 0

    def test_whitespace_only(self):
        """Verify whitespace-only strings produce tokens."""
        from common.token_utils import num_tokens_from_string
        # Spaces are tokenized by tiktoken
        result = num_tokens_from_string("   ")
        assert result >= 1


class TestTotalTokenCountFromResponse:
    """Tests for total_token_count_from_response() function."""

    def test_none_response_returns_zero(self):
        """Verify None response returns 0."""
        from common.token_utils import total_token_count_from_response
        assert total_token_count_from_response(None) == 0

    def test_openai_style_response(self):
        """Verify OpenAI-style response with usage.total_tokens is extracted."""
        from common.token_utils import total_token_count_from_response

        # Build a mock response object with nested attributes
        resp = types.SimpleNamespace()
        resp.usage = types.SimpleNamespace()
        resp.usage.total_tokens = 42
        assert total_token_count_from_response(resp) == 42

    def test_google_style_response(self):
        """Verify Google-style response with usage_metadata.total_tokens is extracted."""
        from common.token_utils import total_token_count_from_response

        resp = types.SimpleNamespace()
        resp.usage_metadata = types.SimpleNamespace()
        resp.usage_metadata.total_tokens = 100
        assert total_token_count_from_response(resp) == 100

    def test_cohere_style_response(self):
        """Verify Cohere-style response with meta.billed_units.input_tokens is extracted."""
        from common.token_utils import total_token_count_from_response

        resp = types.SimpleNamespace()
        resp.meta = types.SimpleNamespace()
        resp.meta.billed_units = types.SimpleNamespace()
        resp.meta.billed_units.input_tokens = 55
        assert total_token_count_from_response(resp) == 55

    def test_dict_usage_total_tokens(self):
        """Verify dict-based response with usage.total_tokens is extracted."""
        from common.token_utils import total_token_count_from_response

        resp = {"usage": {"total_tokens": 77}}
        assert total_token_count_from_response(resp) == 77

    def test_dict_usage_input_output_tokens(self):
        """Verify dict-based response with separate input/output token counts is summed."""
        from common.token_utils import total_token_count_from_response

        resp = {"usage": {"input_tokens": 30, "output_tokens": 20}}
        assert total_token_count_from_response(resp) == 50

    def test_dict_cohere_meta_tokens(self):
        """Verify dict-based Cohere response with meta.tokens is summed."""
        from common.token_utils import total_token_count_from_response

        resp = {"meta": {"tokens": {"input_tokens": 10, "output_tokens": 5}}}
        assert total_token_count_from_response(resp) == 15

    def test_unrecognized_response_returns_zero(self):
        """Verify unrecognized response format returns 0."""
        from common.token_utils import total_token_count_from_response

        assert total_token_count_from_response("just a string") == 0
        assert total_token_count_from_response({"random": "data"}) == 0
        assert total_token_count_from_response(42) == 0

    def test_empty_dict_returns_zero(self):
        """Verify empty dict returns 0."""
        from common.token_utils import total_token_count_from_response
        assert total_token_count_from_response({}) == 0


class TestTruncate:
    """Tests for truncate() function."""

    def test_truncate_to_fewer_tokens(self):
        """Verify truncation reduces token count to max_len."""
        from common.token_utils import truncate, num_tokens_from_string

        text = "This is a sentence with several tokens that should be truncated."
        result = truncate(text, 3)
        assert num_tokens_from_string(result) <= 3

    def test_truncate_with_zero_returns_empty(self):
        """Verify truncating to 0 tokens returns an empty string."""
        from common.token_utils import truncate
        assert truncate("hello world", 0) == ""

    def test_truncate_preserves_short_text(self):
        """Verify text shorter than max_len is preserved."""
        from common.token_utils import truncate

        text = "hi"
        result = truncate(text, 100)
        assert result == text

    def test_truncate_empty_string(self):
        """Verify truncating an empty string returns empty."""
        from common.token_utils import truncate
        assert truncate("", 10) == ""

    def test_truncate_unicode(self):
        """Verify Unicode text is truncated and decoded correctly."""
        from common.token_utils import truncate, num_tokens_from_string

        text = "日本語のテキスト " * 20
        result = truncate(text, 5)
        assert num_tokens_from_string(result) <= 5
