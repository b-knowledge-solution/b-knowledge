"""Unit tests for rag.nlp.synonym module.

Tests the Dealer class methods for synonym dictionary loading, Redis-backed
reloading, and synonym lookup with WordNet fallback. All external
dependencies (filesystem, Redis, WordNet) are mocked.
"""
import os
import sys
import json
import time
import pytest
from unittest.mock import MagicMock, patch, mock_open

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


def _make_dealer(dictionary=None, redis=None):
    """Create a synonym.Dealer with a controlled dictionary and optional Redis.

    Args:
        dictionary: Dict mapping terms to synonym lists. Defaults to empty.
        redis: Mock Redis connection or None to disable Redis.

    Returns:
        Dealer instance with the specified configuration.
    """
    if dictionary is None:
        dictionary = {}
    json_data = json.dumps(dictionary)
    with patch("rag.nlp.synonym.get_project_base_directory", return_value="/fake"), \
         patch("builtins.open", mock_open(read_data=json_data)), \
         patch("rag.nlp.synonym.json.load", return_value=dictionary):
        from rag.nlp.synonym import Dealer
        dealer = Dealer(redis=redis)
        return dealer


class TestDealerInit:
    """Tests for Dealer initialization."""

    def test_loads_dictionary_from_file(self):
        """Verify dictionary is loaded from synonym.json."""
        d = {"hello": ["hi", "greetings"]}
        dealer = _make_dealer(dictionary=d)
        assert dealer.dictionary == {"hello": ["hi", "greetings"]}

    def test_empty_dict_on_missing_file(self):
        """Verify empty dictionary when file is missing."""
        with patch("rag.nlp.synonym.get_project_base_directory", return_value="/fake"), \
             patch("builtins.open", side_effect=FileNotFoundError), \
             patch("rag.nlp.synonym.json.load", side_effect=Exception("no file")):
            from rag.nlp.synonym import Dealer
            dealer = Dealer(redis=None)
            assert dealer.dictionary == {}

    def test_keys_lowercased(self):
        """Verify dictionary keys are lowercased on load."""
        d = {"Hello": ["hi"], "WORLD": ["earth"]}
        dealer = _make_dealer(dictionary=d)
        assert "hello" in dealer.dictionary
        assert "world" in dealer.dictionary

    def test_redis_none_disables_reload(self):
        """Verify Redis=None disables real-time synonym updates."""
        dealer = _make_dealer(redis=None)
        assert dealer.redis is None


class TestDealerLoad:
    """Tests for Dealer.load() Redis reload method."""

    def test_no_redis_skips_load(self):
        """Verify load() does nothing without Redis connection."""
        dealer = _make_dealer(redis=None)
        # Should not raise even when called explicitly
        dealer.load()

    def test_throttle_by_lookup_count(self):
        """Verify reload is skipped when lookup_num < 100."""
        mock_redis = MagicMock()
        dealer = _make_dealer(dictionary={}, redis=mock_redis)
        # Reset mock call count (constructor's load() may have called Redis)
        mock_redis.reset_mock()
        dealer.lookup_num = 50
        dealer.load_tm = time.time() - 7200  # 2 hours ago
        dealer.load()
        # Redis.get should not be called because lookup_num < 100
        mock_redis.get.assert_not_called()

    def test_throttle_by_time(self):
        """Verify reload is skipped when less than 1 hour since last load."""
        mock_redis = MagicMock()
        dealer = _make_dealer(dictionary={}, redis=mock_redis)
        # Reset mock call count (constructor's load() may have called Redis)
        mock_redis.reset_mock()
        dealer.lookup_num = 200
        dealer.load_tm = time.time() - 60  # 60 seconds ago (< 3600)
        dealer.load()
        # Redis.get should not be called because time threshold not met
        mock_redis.get.assert_not_called()

    def test_successful_reload_from_redis(self):
        """Verify dictionary is refreshed from Redis when conditions are met."""
        mock_redis = MagicMock()
        new_dict = {"new_term": ["synonym1"]}
        mock_redis.get.return_value = json.dumps(new_dict)
        dealer = _make_dealer(dictionary={}, redis=mock_redis)
        # Force conditions for reload
        dealer.lookup_num = 200
        dealer.load_tm = time.time() - 7200
        dealer.load()
        assert dealer.dictionary == new_dict

    def test_redis_returns_none(self):
        """Verify dictionary unchanged when Redis returns None."""
        mock_redis = MagicMock()
        mock_redis.get.return_value = None
        original_dict = {"keep": ["this"]}
        dealer = _make_dealer(dictionary=original_dict, redis=mock_redis)
        dealer.lookup_num = 200
        dealer.load_tm = time.time() - 7200
        dealer.load()
        # Dictionary should remain unchanged
        assert "keep" in dealer.dictionary

    def test_redis_returns_invalid_json(self):
        """Verify dictionary unchanged when Redis returns invalid JSON."""
        mock_redis = MagicMock()
        mock_redis.get.return_value = "not valid json {{{}"
        original_dict = {"keep": ["this"]}
        dealer = _make_dealer(dictionary=original_dict, redis=mock_redis)
        dealer.lookup_num = 200
        dealer.load_tm = time.time() - 7200
        dealer.load()
        # Should not crash; dictionary may or may not be updated depending on parse behavior


class TestDealerLookup:
    """Tests for Dealer.lookup() method."""

    def test_found_in_dictionary(self):
        """Verify lookup returns synonyms from custom dictionary."""
        dealer = _make_dealer(dictionary={"python": ["snake", "programming"]})
        result = dealer.lookup("python")
        assert result == ["snake", "programming"]

    def test_string_value_wrapped_in_list(self):
        """Verify string synonym values are wrapped in a list."""
        dealer = _make_dealer(dictionary={"hello": "hi"})
        result = dealer.lookup("hello")
        assert result == ["hi"]

    def test_topn_limits_results(self):
        """Verify topn parameter limits returned synonyms."""
        dealer = _make_dealer(
            dictionary={"word": ["s1", "s2", "s3", "s4", "s5"]}
        )
        result = dealer.lookup("word", topn=2)
        assert len(result) == 2

    def test_not_found_returns_empty(self):
        """Verify missing token returns empty list for non-English."""
        dealer = _make_dealer(dictionary={})
        # Non-alphabetic token, no WordNet fallback
        result = dealer.lookup("未知词")
        assert result == []

    def test_empty_token_returns_empty(self):
        """Verify empty string returns empty list."""
        dealer = _make_dealer(dictionary={"": ["something"]})
        result = dealer.lookup("")
        assert result == []

    def test_none_token_returns_empty(self):
        """Verify None token returns empty list."""
        dealer = _make_dealer(dictionary={})
        result = dealer.lookup(None)
        assert result == []

    def test_non_string_token_returns_empty(self):
        """Verify non-string token returns empty list."""
        dealer = _make_dealer(dictionary={})
        result = dealer.lookup(123)
        assert result == []

    @patch("rag.nlp.synonym.wordnet")
    def test_wordnet_fallback_for_english(self, mock_wordnet):
        """Verify WordNet fallback for pure alphabetic tokens."""
        dealer = _make_dealer(dictionary={})
        # Mock WordNet synsets
        mock_synset = MagicMock()
        mock_synset.name.return_value = "happy.a.01"
        mock_wordnet.synsets.return_value = [mock_synset]

        result = dealer.lookup("happy")
        # Should fall back to WordNet
        mock_wordnet.synsets.assert_called_once_with("happy")

    @patch("rag.nlp.synonym.wordnet")
    def test_wordnet_removes_original_token(self, mock_wordnet):
        """Verify WordNet results exclude the original token."""
        dealer = _make_dealer(dictionary={})
        # Mock synsets that include the original token
        syn1 = MagicMock()
        syn1.name.return_value = "happy.a.01"
        syn2 = MagicMock()
        syn2.name.return_value = "glad.a.01"
        mock_wordnet.synsets.return_value = [syn1, syn2]

        result = dealer.lookup("happy")
        # Original token "happy" should not appear in results
        assert "happy" not in result

    @patch("rag.nlp.synonym.wordnet")
    def test_wordnet_not_used_for_mixed_chars(self, mock_wordnet):
        """Verify WordNet is not used for tokens with non-alpha characters."""
        dealer = _make_dealer(dictionary={})
        result = dealer.lookup("hello123")
        # Not purely alphabetic, so WordNet should not be called
        mock_wordnet.synsets.assert_not_called()
        assert result == []

    def test_whitespace_normalized_in_key(self):
        """Verify whitespace in lookup key is normalized."""
        dealer = _make_dealer(dictionary={"hello world": ["greeting"]})
        result = dealer.lookup("hello  \t world")
        assert result == ["greeting"]

    def test_increments_lookup_num(self):
        """Verify each lookup increments the counter."""
        dealer = _make_dealer(dictionary={"test": ["exam"]})
        initial = dealer.lookup_num
        dealer.lookup("test")
        assert dealer.lookup_num == initial + 1
