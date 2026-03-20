"""Unit tests for rag.nlp.search module.

Tests the Dealer class methods including index name generation, filter
extraction, result conversion, rank feature scoring, heuristic reranking,
and model-based reranking. External dependencies (OpenSearch, embedding
models, Redis) are fully mocked.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch, AsyncMock

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestIndexName:
    """Tests for the index_name() helper function."""

    def test_prefixes_uid_with_knowledge(self):
        """Verify UID is prefixed with 'knowledge_'."""
        from rag.nlp.search import index_name
        assert index_name("abc123") == "knowledge_abc123"

    def test_empty_uid(self):
        """Verify empty UID produces 'knowledge_' prefix only."""
        from rag.nlp.search import index_name
        assert index_name("") == "knowledge_"

    def test_uuid_format(self):
        """Verify UUID-style input is handled correctly."""
        from rag.nlp.search import index_name
        uid = "550e8400-e29b-41d4-a716-446655440000"
        assert index_name(uid) == f"knowledge_{uid}"


class TestDealerGetFilters:
    """Tests for Dealer.get_filters() method."""

    def _make_dealer(self):
        """Create a Dealer with a mocked dataStore.

        Returns:
            Dealer instance with mocked dependencies.
        """
        with patch("rag.nlp.search.query.FulltextQueryer"):
            from rag.nlp.search import Dealer
            mock_store = MagicMock()
            return Dealer(mock_store)

    def test_maps_kb_ids_to_kb_id(self):
        """Verify kb_ids request key maps to kb_id filter field."""
        dealer = self._make_dealer()
        req = {"kb_ids": ["kb1", "kb2"]}
        filters = dealer.get_filters(req)
        assert filters["kb_id"] == ["kb1", "kb2"]

    def test_maps_doc_ids_to_doc_id(self):
        """Verify doc_ids request key maps to doc_id filter field."""
        dealer = self._make_dealer()
        req = {"doc_ids": ["d1"]}
        filters = dealer.get_filters(req)
        assert filters["doc_id"] == ["d1"]

    def test_includes_optional_keys(self):
        """Verify optional filter keys are included when present."""
        dealer = self._make_dealer()
        req = {"knowledge_graph_kwd": "entity", "available_int": 1}
        filters = dealer.get_filters(req)
        assert filters["knowledge_graph_kwd"] == "entity"
        assert filters["available_int"] == 1

    def test_ignores_none_values(self):
        """Verify None values are excluded from filters."""
        dealer = self._make_dealer()
        req = {"kb_ids": None, "doc_ids": None, "knowledge_graph_kwd": None}
        filters = dealer.get_filters(req)
        assert "kb_id" not in filters
        assert "doc_id" not in filters
        assert "knowledge_graph_kwd" not in filters

    def test_empty_request(self):
        """Verify empty request produces empty filters."""
        dealer = self._make_dealer()
        filters = dealer.get_filters({})
        assert filters == {}

    def test_extra_keys_ignored(self):
        """Verify unknown request keys are not passed through."""
        dealer = self._make_dealer()
        req = {"unknown_key": "value", "kb_ids": ["kb1"]}
        filters = dealer.get_filters(req)
        assert "unknown_key" not in filters
        assert "kb_id" in filters


class TestDealerTrans2Floats:
    """Tests for Dealer.trans2floats() static method."""

    def test_single_value(self):
        """Verify single tab-separated value converts."""
        from rag.nlp.search import Dealer
        result = Dealer.trans2floats("3.14")
        assert len(result) == 1
        assert abs(result[0] - 3.14) < 1e-6

    def test_multiple_values(self):
        """Verify multiple tab-separated values convert."""
        from rag.nlp.search import Dealer
        result = Dealer.trans2floats("1.0\t2.0\t3.0")
        assert len(result) == 3
        assert result == [1.0, 2.0, 3.0]

    def test_empty_string(self):
        """Verify empty string produces a list with one element (neg inf)."""
        from rag.nlp.search import Dealer
        result = Dealer.trans2floats("")
        # get_float("") returns -inf
        assert len(result) == 1


class TestDealerRankFeatureScores:
    """Tests for Dealer._rank_feature_scores() method."""

    def _make_dealer(self):
        """Create a Dealer with mocked dependencies.

        Returns:
            Dealer instance.
        """
        with patch("rag.nlp.search.query.FulltextQueryer"):
            from rag.nlp.search import Dealer
            mock_store = MagicMock()
            return Dealer(mock_store)

    def _make_search_result(self, ids, fields):
        """Create a mock SearchResult for testing.

        Args:
            ids: List of chunk ID strings.
            fields: Dict mapping chunk IDs to field dicts.

        Returns:
            Mock SearchResult dataclass.
        """
        from rag.nlp.search import Dealer
        sres = MagicMock()
        sres.ids = ids
        sres.field = fields
        return sres

    def test_no_query_rfea_returns_pageranks(self):
        """Verify empty query_rfea returns only pagerank scores."""
        dealer = self._make_dealer()
        sres = self._make_search_result(
            ["c1", "c2"],
            {
                "c1": {"pagerank_fea": 0.5},
                "c2": {"pagerank_fea": 0.3},
            },
        )
        result = dealer._rank_feature_scores(None, sres)
        # When query_rfea is falsy, returns zeros + pageranks
        assert len(result) == 2

    def test_with_query_rfea_and_matching_tags(self):
        """Verify tag features are computed when query and chunk tags overlap."""
        dealer = self._make_dealer()
        sres = self._make_search_result(
            ["c1"],
            {
                "c1": {
                    "pagerank_fea": 0.0,
                    "tag_feas": '{"python": 2.0, "ai": 1.0}',
                },
            },
        )
        query_rfea = {"python": 3.0, "ai": 1.0}
        result = dealer._rank_feature_scores(query_rfea, sres)
        # Should produce a nonzero tag feature score
        assert len(result) == 1
        assert result[0] > 0

    def test_no_tag_field_returns_zero_score(self):
        """Verify chunks without tag_feas get zero tag score."""
        dealer = self._make_dealer()
        sres = self._make_search_result(
            ["c1"],
            {"c1": {"pagerank_fea": 0.0}},
        )
        query_rfea = {"python": 3.0}
        result = dealer._rank_feature_scores(query_rfea, sres)
        assert len(result) == 1
        # Only pagerank contributes (which is 0)
        assert result[0] == 0.0


class TestDealerRerank:
    """Tests for Dealer.rerank() heuristic reranking method."""

    def _make_dealer(self):
        """Create a Dealer with mocked FulltextQueryer.

        Returns:
            Dealer instance with mocked queryer.
        """
        with patch("rag.nlp.search.query.FulltextQueryer") as MockQryr:
            from rag.nlp.search import Dealer
            mock_store = MagicMock()
            dealer = Dealer(mock_store)
            return dealer

    def test_empty_ids_returns_empty(self):
        """Verify empty search results produce empty reranked lists."""
        dealer = self._make_dealer()
        # Mock the question method to return keywords
        dealer.qryr.question = MagicMock(return_value=(None, ["test"]))
        sres = MagicMock()
        sres.ids = []
        sres.query_vector = [0.1, 0.2]
        sres.field = {}
        sim, tksim, vtsim = dealer.rerank(sres, "test query")
        assert sim == []
        assert tksim == []
        assert vtsim == []

    def test_rerank_produces_scores(self):
        """Verify rerank produces score arrays matching chunk count."""
        import numpy as np
        dealer = self._make_dealer()
        dealer.qryr.question = MagicMock(return_value=(None, ["test", "query"]))
        # Mock hybrid_similarity to return numpy arrays
        dealer.qryr.hybrid_similarity = MagicMock(
            return_value=(np.array([0.8, 0.6]), [0.3, 0.2], np.array([0.9, 0.7]))
        )
        sres = MagicMock()
        sres.ids = ["c1", "c2"]
        sres.query_vector = [0.1] * 128
        sres.field = {
            "c1": {
                "content_ltks": "test query tokens",
                "title_tks": "title",
                "question_tks": "",
                "important_kwd": [],
                "q_128_vec": [0.1] * 128,
                "pagerank_flt": 0,
            },
            "c2": {
                "content_ltks": "other tokens here",
                "title_tks": "",
                "question_tks": "",
                "important_kwd": [],
                "q_128_vec": [0.2] * 128,
                "pagerank_flt": 0,
            },
        }
        sim, tksim, vtsim = dealer.rerank(sres, "test query")
        assert len(sim) == 2
        assert len(tksim) == 2
        assert len(vtsim) == 2


class TestDealerRerankByModel:
    """Tests for Dealer.rerank_by_model() method."""

    def _make_dealer(self):
        """Create a Dealer with mocked queryer.

        Returns:
            Dealer instance.
        """
        with patch("rag.nlp.search.query.FulltextQueryer") as MockQryr:
            from rag.nlp.search import Dealer
            mock_store = MagicMock()
            dealer = Dealer(mock_store)
            return dealer

    def test_rerank_by_model_uses_model_similarity(self):
        """Verify model-based reranking uses the rerank model's similarity."""
        import numpy as np
        dealer = self._make_dealer()
        dealer.qryr.question = MagicMock(return_value=(None, ["test"]))
        dealer.qryr.token_similarity = MagicMock(return_value=[0.3, 0.2])

        # Mock rerank model
        rerank_mdl = MagicMock()
        rerank_mdl.similarity = MagicMock(
            return_value=(np.array([0.9, 0.7]), None)
        )

        sres = MagicMock()
        sres.ids = ["c1", "c2"]
        sres.field = {
            "c1": {
                "content_ltks": "test tokens",
                "title_tks": "",
                "important_kwd": [],
                "pagerank_flt": 0,
            },
            "c2": {
                "content_ltks": "other tokens",
                "title_tks": "",
                "important_kwd": [],
                "pagerank_flt": 0,
            },
        }

        sim, tksim, vtsim = dealer.rerank_by_model(
            rerank_mdl, sres, "test query"
        )
        # Rerank model's similarity method should have been called
        rerank_mdl.similarity.assert_called_once()
        assert len(sim) == 2

    def test_important_kwd_string_converted_to_list(self):
        """Verify string important_kwd is converted to list."""
        import numpy as np
        dealer = self._make_dealer()
        dealer.qryr.question = MagicMock(return_value=(None, ["test"]))
        dealer.qryr.token_similarity = MagicMock(return_value=[0.5])
        rerank_mdl = MagicMock()
        rerank_mdl.similarity = MagicMock(
            return_value=(np.array([0.8]), None)
        )
        sres = MagicMock()
        sres.ids = ["c1"]
        sres.field = {
            "c1": {
                "content_ltks": "test",
                "title_tks": "",
                # String instead of list — should be auto-converted
                "important_kwd": "keyword",
                "pagerank_flt": 0,
            },
        }
        sim, _, _ = dealer.rerank_by_model(rerank_mdl, sres, "test")
        # After conversion, important_kwd should be a list
        assert isinstance(sres.field["c1"]["important_kwd"], list)


class TestSearchResult:
    """Tests for the SearchResult dataclass."""

    def test_defaults(self):
        """Verify SearchResult default field values."""
        from rag.nlp.search import Dealer
        sr = Dealer.SearchResult(total=10, ids=["a", "b"])
        assert sr.total == 10
        assert sr.ids == ["a", "b"]
        assert sr.query_vector is None
        assert sr.field is None
        assert sr.highlight is None
        assert sr.aggregation is None
        assert sr.keywords is None
        assert sr.group_docs is None

    def test_all_fields_set(self):
        """Verify SearchResult with all fields populated."""
        from rag.nlp.search import Dealer
        sr = Dealer.SearchResult(
            total=5,
            ids=["x"],
            query_vector=[0.1, 0.2],
            field={"x": {"content": "hello"}},
            highlight={"x": "highlighted"},
            aggregation=[("doc.pdf", 3)],
            keywords=["hello"],
            group_docs=[["x"]],
        )
        assert sr.total == 5
        assert sr.query_vector == [0.1, 0.2]
        assert sr.keywords == ["hello"]
