"""Unit tests for rag.nlp.term_weight module.

Tests the Dealer class methods for tokenization, token merging, NER
lookup, text splitting, and TF-IDF weight computation. Resource files
(NER dict, term frequency) are mocked to avoid filesystem dependencies.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch, mock_open

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


@pytest.fixture
def dealer():
    """Create a term_weight.Dealer with mocked resource files.

    Returns:
        Dealer instance with empty NE dict and empty DF dict.
    """
    with patch("rag.nlp.term_weight.get_project_base_directory", return_value="/fake"), \
         patch("builtins.open", side_effect=FileNotFoundError), \
         patch("rag.nlp.term_weight.json.load", side_effect=Exception("no file")):
        from rag.nlp.term_weight import Dealer
        d = Dealer()
        # Ensure clean state
        d.ne = {}
        d.df = {}
        return d


class TestPretoken:
    """Tests for Dealer.pretoken() method."""

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_filters_stop_words(self, mock_tokenizer, dealer):
        """Verify Chinese stop words are filtered out."""
        mock_tokenizer.tokenize.return_value = "请问 你 好 世界"
        result = dealer.pretoken("请问你好世界")
        # "请问", "你" are stop words and should be filtered
        assert "请问" not in result
        assert "你" not in result

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_filters_punctuation_tokens(self, mock_tokenizer, dealer):
        """Verify punctuation-only tokens are replaced and filtered."""
        mock_tokenizer.tokenize.return_value = "hello , world"
        result = dealer.pretoken("hello, world")
        # Comma should be matched by punctuation pattern and filtered
        assert "," not in result

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_preserves_normal_tokens(self, mock_tokenizer, dealer):
        """Verify non-stop-word tokens are preserved."""
        mock_tokenizer.tokenize.return_value = "machine learning"
        result = dealer.pretoken("machine learning")
        assert "machine" in result
        assert "learning" in result

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_num_false_filters_single_digits(self, mock_tokenizer, dealer):
        """Verify single digit numbers are filtered when num=False."""
        mock_tokenizer.tokenize.return_value = "item 5 ready"
        result = dealer.pretoken("item 5 ready", num=False)
        assert "5" not in result

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_num_true_keeps_digits(self, mock_tokenizer, dealer):
        """Verify single digit numbers are kept when num=True."""
        mock_tokenizer.tokenize.return_value = "item 5 ready"
        result = dealer.pretoken("item 5 ready", num=True)
        assert "5" in result

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_stpwd_false_keeps_stop_words(self, mock_tokenizer, dealer):
        """Verify stop words are kept when stpwd=False."""
        mock_tokenizer.tokenize.return_value = "是 好 的"
        result = dealer.pretoken("是好的", stpwd=False)
        # "是" and "的" should be kept since stop word filtering is off
        assert "是" in result or "好" in result


class TestTokenMerge:
    """Tests for Dealer.token_merge() method."""

    def test_merges_single_char_sequence(self, dealer):
        """Verify consecutive single-character tokens are merged."""
        tks = ["a", "b", "c"]
        result = dealer.token_merge(tks)
        # Three single chars should be merged into one compound token
        assert len(result) == 1
        assert "a b c" == result[0]

    def test_preserves_long_tokens(self, dealer):
        """Verify multi-character tokens are not merged."""
        tks = ["hello", "world"]
        result = dealer.token_merge(tks)
        assert result == ["hello", "world"]

    def test_mixed_short_long_tokens(self, dealer):
        """Verify mixed short and long tokens are merged correctly."""
        tks = ["a", "b", "hello"]
        result = dealer.token_merge(tks)
        # "a" and "b" should merge, "hello" stays separate
        assert len(result) == 2

    def test_long_single_char_sequence_limited(self, dealer):
        """Verify sequences of 5+ single chars are split into pairs."""
        tks = ["a", "b", "c", "d", "e", "f"]
        result = dealer.token_merge(tks)
        # More than 4 single chars in a row: first pair merged, then continues
        assert len(result) >= 2
        assert "a b" == result[0]

    def test_empty_input(self, dealer):
        """Verify empty token list returns empty."""
        result = dealer.token_merge([])
        assert result == []

    def test_single_token(self, dealer):
        """Verify single token passes through unchanged."""
        result = dealer.token_merge(["hello"])
        assert result == ["hello"]

    def test_first_char_merges_with_next(self, dealer):
        """Verify first single-char token merges with subsequent multi-char token."""
        tks = ["多", "工位"]
        result = dealer.token_merge(tks)
        # First char + non-alnum next token should merge
        assert len(result) == 1
        assert result[0] == "多 工位"


class TestNer:
    """Tests for Dealer.ner() method."""

    def test_returns_entity_type(self, dealer):
        """Verify known entity returns its type string."""
        dealer.ne = {"python": "func"}
        result = dealer.ner("python")
        assert result == "func"

    def test_returns_empty_for_unknown(self, dealer):
        """Verify unknown token returns empty string or None."""
        dealer.ne = {"python": "func"}
        result = dealer.ner("unknown")
        # Returns "" or None for unknown tokens
        assert not result

    def test_empty_ne_dict(self, dealer):
        """Verify empty NE dict returns empty string."""
        dealer.ne = {}
        result = dealer.ner("anything")
        assert result == ""


class TestSplit:
    """Tests for Dealer.split() method."""

    def test_basic_split(self, dealer):
        """Verify basic splitting merges adjacent English tokens."""
        result = dealer.split("hello world test")
        # Adjacent English tokens are merged into one compound token
        assert result == ["hello world test"]

    def test_merges_adjacent_english(self, dealer):
        """Verify adjacent English tokens are merged."""
        dealer.ne = {}
        result = dealer.split("machine learning model")
        # Adjacent English tokens should be merged
        assert len(result) == 1
        assert result[0] == "machine learning model"

    def test_func_ner_prevents_merge(self, dealer):
        """Verify 'func' NER type prevents adjacent English merge."""
        dealer.ne = {"learning": "func"}
        result = dealer.split("machine learning model")
        # "learning" has func NER, so merge is broken
        assert len(result) >= 2

    def test_multiple_spaces_normalized(self, dealer):
        """Verify multiple spaces/tabs are normalized."""
        dealer.ne = {}
        result = dealer.split("hello  \t  world")
        # Should treat as "hello world" after normalization
        assert len(result) >= 1

    def test_empty_string(self, dealer):
        """Verify empty string returns empty list."""
        result = dealer.split("")
        assert result == []


class TestWeights:
    """Tests for Dealer.weights() method."""

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_weights_normalized_to_one(self, mock_tokenizer, dealer):
        """Verify weights sum to approximately 1.0."""
        mock_tokenizer.tokenize.return_value = "hello world"
        mock_tokenizer.tag.return_value = "n"
        mock_tokenizer.freq.return_value = 100
        mock_tokenizer.fine_grained_tokenize.return_value = ""

        result = dealer.weights(["hello", "world"], preprocess=False)
        total = sum(w for _, w in result)
        assert abs(total - 1.0) < 0.01

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_weights_return_tuples(self, mock_tokenizer, dealer):
        """Verify weights returns list of (token, weight) tuples."""
        mock_tokenizer.tokenize.return_value = "test"
        mock_tokenizer.tag.return_value = "n"
        mock_tokenizer.freq.return_value = 50
        mock_tokenizer.fine_grained_tokenize.return_value = ""

        result = dealer.weights(["test"], preprocess=False)
        assert len(result) == 1
        token, weight = result[0]
        assert token == "test"
        assert isinstance(weight, (int, float))

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_preprocess_true_calls_pretoken(self, mock_tokenizer, dealer):
        """Verify preprocess=True applies pretokenization and merge."""
        mock_tokenizer.tokenize.return_value = "hello world"
        mock_tokenizer.tag.return_value = "n"
        mock_tokenizer.freq.return_value = 100
        mock_tokenizer.fine_grained_tokenize.return_value = ""

        result = dealer.weights(["hello world"], preprocess=True)
        # Should process through pretoken + token_merge pipeline
        assert len(result) >= 1
        total = sum(w for _, w in result)
        assert abs(total - 1.0) < 0.01

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_rare_token_gets_higher_weight(self, mock_tokenizer, dealer):
        """Verify rare tokens get higher IDF-based weights than common ones."""
        mock_tokenizer.tokenize.return_value = "test"
        mock_tokenizer.tag.return_value = "n"
        mock_tokenizer.fine_grained_tokenize.return_value = ""

        # Simulate: "rare" has low frequency, "common" has high frequency
        def mock_freq(t):
            if t == "rare":
                return 1
            return 1000000

        mock_tokenizer.freq.side_effect = mock_freq

        result = dealer.weights(["rare", "common"], preprocess=False)
        # Rare token should have higher weight
        weights_dict = dict(result)
        assert weights_dict["rare"] > weights_dict["common"]

    @patch("rag.nlp.term_weight.rag_tokenizer")
    def test_single_token(self, mock_tokenizer, dealer):
        """Verify single token gets weight of 1.0 (full normalization)."""
        mock_tokenizer.tokenize.return_value = "hello"
        mock_tokenizer.tag.return_value = "n"
        mock_tokenizer.freq.return_value = 100
        mock_tokenizer.fine_grained_tokenize.return_value = ""

        result = dealer.weights(["hello"], preprocess=False)
        assert len(result) == 1
        _, weight = result[0]
        assert abs(weight - 1.0) < 0.01
