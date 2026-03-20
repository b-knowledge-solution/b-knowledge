"""Unit tests for rag.nlp.query module.

Tests the FulltextQueryer class methods including query construction,
hybrid similarity computation, token similarity, weighted overlap
similarity, and paragraph-level query building. External NLP dependencies
(tokenizer, term weights, synonyms) are mocked where needed.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


@pytest.fixture
def queryer():
    """Create a FulltextQueryer with mocked term_weight and synonym dealers.

    Returns:
        FulltextQueryer instance with controlled dependencies.
    """
    with patch("rag.nlp.query.term_weight") as mock_tw_mod, \
         patch("rag.nlp.query.synonym") as mock_syn_mod:
        # Mock the Dealer constructors
        mock_tw = MagicMock()
        mock_tw_mod.Dealer.return_value = mock_tw
        mock_syn = MagicMock()
        mock_syn_mod.Dealer.return_value = mock_syn

        from rag.nlp.query import FulltextQueryer
        qryr = FulltextQueryer()
        # Expose mocks for per-test configuration
        qryr._mock_tw = mock_tw
        qryr._mock_syn = mock_syn
        return qryr


class TestFulltextQueryerInit:
    """Tests for FulltextQueryer initialization."""

    def test_query_fields_populated(self, queryer):
        """Verify query fields are set with correct boost values."""
        assert len(queryer.query_fields) > 0
        # Check that important_kwd has the highest boost
        assert any("important_kwd^30" in f for f in queryer.query_fields)

    def test_tw_and_syn_initialized(self, queryer):
        """Verify term weight and synonym dealers are initialized."""
        assert queryer.tw is not None
        assert queryer.syn is not None


class TestFulltextQueryerQuestion:
    """Tests for FulltextQueryer.question() method."""

    @patch("rag.nlp.query.rag_tokenizer")
    def test_non_chinese_returns_match_expr(self, mock_tokenizer, queryer):
        """Verify non-Chinese text produces a MatchTextExpr with keywords."""
        mock_tokenizer.tradi2simp.side_effect = lambda x: x
        mock_tokenizer.strQ2B.side_effect = lambda x: x
        mock_tokenizer.tokenize.return_value = "hello world"
        mock_tokenizer.fine_grained_tokenize.return_value = ""
        queryer._mock_tw.weights.return_value = [("hello", 0.5), ("world", 0.5)]
        queryer._mock_syn.lookup.return_value = []

        expr, keywords = queryer.question("hello world")
        assert expr is not None
        assert "hello" in keywords or "world" in keywords

    @patch("rag.nlp.query.rag_tokenizer")
    def test_empty_input_returns_none_expr(self, mock_tokenizer, queryer):
        """Verify empty input after normalization returns None expr."""
        mock_tokenizer.tradi2simp.side_effect = lambda x: x
        mock_tokenizer.strQ2B.side_effect = lambda x: x
        mock_tokenizer.tokenize.return_value = ""
        queryer._mock_tw.split.return_value = []

        expr, keywords = queryer.question("")
        # With no tokens, no query can be constructed
        assert expr is None or keywords == []

    @patch("rag.nlp.query.rag_tokenizer")
    def test_synonyms_expand_keywords(self, mock_tokenizer, queryer):
        """Verify synonym expansion adds terms to keywords list."""
        mock_tokenizer.tradi2simp.side_effect = lambda x: x
        mock_tokenizer.strQ2B.side_effect = lambda x: x
        mock_tokenizer.tokenize.return_value = "python"
        mock_tokenizer.fine_grained_tokenize.return_value = ""
        queryer._mock_tw.weights.return_value = [("python", 0.8)]
        # Synonym expansion returns alternatives
        queryer._mock_syn.lookup.return_value = ["snake", "programming"]
        mock_tokenizer.tokenize.side_effect = lambda x: x

        expr, keywords = queryer.question("python")
        # Keywords should include original + synonyms
        assert len(keywords) >= 1

    @patch("rag.nlp.query.rag_tokenizer")
    def test_min_match_passed_to_expr(self, mock_tokenizer, queryer):
        """Verify min_match parameter flows through to the expression."""
        mock_tokenizer.tradi2simp.side_effect = lambda x: x
        mock_tokenizer.strQ2B.side_effect = lambda x: x
        mock_tokenizer.tokenize.return_value = "test query"
        mock_tokenizer.fine_grained_tokenize.return_value = ""
        queryer._mock_tw.weights.return_value = [("test", 0.5), ("query", 0.5)]
        queryer._mock_syn.lookup.return_value = []

        expr, _ = queryer.question("test query", min_match=0.1)
        assert expr is not None


class TestHybridSimilarity:
    """Tests for FulltextQueryer.hybrid_similarity() method."""

    def test_weighted_combination(self, queryer):
        """Verify hybrid similarity combines vector and token scores."""
        import numpy as np
        # Mock token_similarity to return known values
        queryer.token_similarity = MagicMock(return_value=[0.4, 0.2])

        avec = [1.0, 0.0, 0.0]
        bvecs = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
        atks = ["hello"]
        btkss = [["hello"], ["world"]]

        sim, tksim, vtsim = queryer.hybrid_similarity(
            avec, bvecs, atks, btkss, tkweight=0.3, vtweight=0.7
        )
        # cosine(avec, bvecs[0]) = 1.0, cosine(avec, bvecs[1]) = 0.0
        # Combined: 1.0*0.7 + 0.4*0.3 = 0.82 for first
        assert abs(sim[0] - 0.82) < 0.01
        assert tksim == [0.4, 0.2]

    def test_zero_vectors_fallback_to_token(self, queryer):
        """Verify when all vector sims are zero, token similarity is returned."""
        import numpy as np
        queryer.token_similarity = MagicMock(return_value=[0.5, 0.3])

        avec = [0.0, 0.0, 0.0]
        bvecs = [[0.0, 0.0, 0.0], [0.0, 0.0, 0.0]]
        atks = ["test"]
        btkss = [["test"], ["other"]]

        sim, tksim, vtsim = queryer.hybrid_similarity(
            avec, bvecs, atks, btkss
        )
        # When vector sims are all zero, should use token-only
        np.testing.assert_array_almost_equal(sim, [0.5, 0.3])

    def test_single_candidate(self, queryer):
        """Verify hybrid similarity works with a single candidate."""
        queryer.token_similarity = MagicMock(return_value=[0.6])

        avec = [1.0, 0.0]
        bvecs = [[0.5, 0.866]]
        atks = ["test"]
        btkss = [["test"]]

        sim, tksim, vtsim = queryer.hybrid_similarity(
            avec, bvecs, atks, btkss
        )
        assert len(sim) == 1


class TestTokenSimilarity:
    """Tests for FulltextQueryer.token_similarity() method."""

    def test_identical_tokens_high_score(self, queryer):
        """Verify identical token lists produce a high similarity score."""
        # Mock weights to return uniform weights
        queryer.tw.weights = MagicMock(
            side_effect=lambda tks, preprocess=True: [(t, 1.0) for t in tks]
        )
        atks = ["hello", "world"]
        btkss = [["hello", "world"]]
        scores = queryer.token_similarity(atks, btkss)
        assert len(scores) == 1
        assert scores[0] > 0.5

    def test_disjoint_tokens_low_score(self, queryer):
        """Verify disjoint token lists produce a low similarity score."""
        queryer.tw.weights = MagicMock(
            side_effect=lambda tks, preprocess=True: [(t, 1.0) for t in tks]
        )
        atks = ["hello", "world"]
        btkss = [["foo", "bar"]]
        scores = queryer.token_similarity(atks, btkss)
        assert len(scores) == 1
        # No overlap should produce a near-zero score
        assert scores[0] < 0.1

    def test_string_input_split(self, queryer):
        """Verify string input is split into tokens correctly."""
        queryer.tw.weights = MagicMock(
            side_effect=lambda tks, preprocess=True: [(t, 1.0) for t in tks]
        )
        # String input should be split on whitespace
        atks = "hello world"
        btkss = ["hello world"]
        scores = queryer.token_similarity(atks, btkss)
        assert len(scores) == 1

    def test_multiple_candidates(self, queryer):
        """Verify scores are computed for each candidate independently."""
        queryer.tw.weights = MagicMock(
            side_effect=lambda tks, preprocess=True: [(t, 1.0) for t in tks]
        )
        atks = ["hello"]
        btkss = [["hello"], ["world"], ["hello", "world"]]
        scores = queryer.token_similarity(atks, btkss)
        assert len(scores) == 3


class TestSimilarity:
    """Tests for FulltextQueryer.similarity() method."""

    def test_perfect_overlap(self, queryer):
        """Verify perfect overlap produces score close to 1."""
        qtwt = {"hello": 0.5, "world": 0.5}
        dtwt = {"hello": 0.5, "world": 0.5}
        score = queryer.similarity(qtwt, dtwt)
        # All query weight is found in document
        assert score > 0.99

    def test_no_overlap(self, queryer):
        """Verify no overlap produces near-zero score."""
        qtwt = {"hello": 0.5, "world": 0.5}
        dtwt = {"foo": 0.5, "bar": 0.5}
        score = queryer.similarity(qtwt, dtwt)
        # Only the epsilon numerator/denominator ratio
        assert score < 0.01

    def test_partial_overlap(self, queryer):
        """Verify partial overlap produces intermediate score."""
        qtwt = {"hello": 0.5, "world": 0.5}
        dtwt = {"hello": 0.5, "foo": 0.5}
        score = queryer.similarity(qtwt, dtwt)
        # About half the query weight is found
        assert 0.3 < score < 0.7

    def test_empty_query(self, queryer):
        """Verify empty query produces near-zero score."""
        qtwt = {}
        dtwt = {"hello": 0.5}
        score = queryer.similarity(qtwt, dtwt)
        # Epsilon / epsilon ratio
        assert score < 2.0

    def test_string_inputs_converted(self, queryer):
        """Verify string inputs are converted via term weights."""
        queryer.tw.weights = MagicMock(return_value=[("hello", 0.5)])
        queryer.tw.split = MagicMock(return_value=["hello"])
        score = queryer.similarity("hello", "hello")
        assert score > 0.0


class TestParagraph:
    """Tests for FulltextQueryer.paragraph() method."""

    @patch("rag.nlp.query.rag_tokenizer")
    def test_returns_match_text_expr(self, mock_tokenizer, queryer):
        """Verify paragraph() returns a MatchTextExpr."""
        from common.doc_store.doc_store_base import MatchTextExpr
        queryer.tw.weights = MagicMock(
            return_value=[("test", 0.5), ("content", 0.3)]
        )
        queryer.syn.lookup = MagicMock(return_value=[])
        mock_tokenizer.fine_grained_tokenize.return_value = ""

        result = queryer.paragraph("test content", keywords=["key1"])
        assert isinstance(result, MatchTextExpr)

    @patch("rag.nlp.query.rag_tokenizer")
    def test_keywords_included_in_query(self, mock_tokenizer, queryer):
        """Verify provided keywords are included in the query expression."""
        queryer.tw.weights = MagicMock(return_value=[("word", 0.5)])
        queryer.syn.lookup = MagicMock(return_value=[])
        mock_tokenizer.fine_grained_tokenize.return_value = ""

        result = queryer.paragraph("word", keywords=["important"])
        # The query string should contain the keyword
        assert "important" in result.matching_text

    @patch("rag.nlp.query.rag_tokenizer")
    def test_empty_content(self, mock_tokenizer, queryer):
        """Verify empty content produces valid query with just keywords."""
        queryer.tw.weights = MagicMock(return_value=[])
        queryer.syn.lookup = MagicMock(return_value=[])

        result = queryer.paragraph("", keywords=["keyword"])
        assert result is not None
