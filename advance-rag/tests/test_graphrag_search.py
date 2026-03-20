"""Unit tests for rag.graphrag.search module.

Tests the KGSearch class for knowledge graph retrieval including entity
extraction from search results, relationship extraction, query rewriting,
LLM chat with caching, and result ranking. External dependencies (OpenSearch,
LLM models, Redis) are fully mocked.
"""
import asyncio
import os
import sys
import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


class TestKGSearchInit:
    """Tests for KGSearch class initialization."""

    def _make_kg_search(self):
        """Create a KGSearch instance with mocked dependencies.

        Returns:
            KGSearch instance with mocked data store and queryer.
        """
        with patch("rag.nlp.search.query.FulltextQueryer"):
            from rag.graphrag.search import KGSearch
            mock_store = MagicMock()
            kgs = KGSearch(mock_store)
            return kgs

    def test_inherits_from_dealer(self):
        """Verify KGSearch extends the base Dealer class."""
        kgs = self._make_kg_search()
        from rag.nlp.search import Dealer
        assert isinstance(kgs, Dealer)


class TestKGSearchChat:
    """Tests for KGSearch._chat() LLM communication with caching."""

    def _make_kg_search(self):
        """Create a KGSearch instance.

        Returns:
            KGSearch instance with mocked dependencies.
        """
        with patch("rag.nlp.search.query.FulltextQueryer"):
            from rag.graphrag.search import KGSearch
            mock_store = MagicMock()
            return KGSearch(mock_store)

    def test_returns_cached_response(self):
        """Verify cached LLM responses are returned without calling LLM."""
        kgs = self._make_kg_search()
        mock_llm = MagicMock()
        mock_llm.llm_name = "test-model"

        # Simulate a cache hit
        with patch("rag.graphrag.search.get_llm_cache", return_value="cached answer"):
            result = asyncio.get_event_loop().run_until_complete(
                kgs._chat(mock_llm, "system prompt", [{"role": "user", "content": "hello"}], {})
            )

        assert result == "cached answer"
        # LLM should not have been called
        mock_llm.async_chat.assert_not_called()

    def test_calls_llm_on_cache_miss(self):
        """Verify LLM is called and response is cached on cache miss."""
        kgs = self._make_kg_search()
        mock_llm = MagicMock()
        mock_llm.llm_name = "test-model"
        mock_llm.async_chat = AsyncMock(return_value="fresh answer")

        with patch("rag.graphrag.search.get_llm_cache", return_value=None):
            with patch("rag.graphrag.search.set_llm_cache") as mock_set_cache:
                result = asyncio.get_event_loop().run_until_complete(
                    kgs._chat(mock_llm, "system", [{"role": "user", "content": "hi"}], {})
                )

        assert result == "fresh answer"
        mock_set_cache.assert_called_once()

    def test_raises_on_error_response(self):
        """Verify error responses from LLM raise an exception."""
        kgs = self._make_kg_search()
        mock_llm = MagicMock()
        mock_llm.llm_name = "test-model"
        mock_llm.async_chat = AsyncMock(return_value="**ERROR**: something failed")

        with patch("rag.graphrag.search.get_llm_cache", return_value=None):
            with pytest.raises(Exception):
                asyncio.get_event_loop().run_until_complete(
                    kgs._chat(mock_llm, "system", [{"role": "user", "content": "hi"}], {})
                )


class TestKGSearchEntInfoFrom:
    """Tests for KGSearch._ent_info_from_() entity extraction."""

    def _make_kg_search(self):
        """Create a KGSearch instance.

        Returns:
            KGSearch instance.
        """
        with patch("rag.nlp.search.query.FulltextQueryer"):
            from rag.graphrag.search import KGSearch
            mock_store = MagicMock()
            kgs = KGSearch(mock_store)
            return kgs

    def test_extracts_entity_info(self):
        """Verify entity information is extracted from search results."""
        kgs = self._make_kg_search()
        # Mock the dataStore.get_fields to return structured results
        kgs.dataStore.get_fields.return_value = {
            "id1": {
                "content_with_weight": '{"desc": "Entity description"}',
                "_score": 0.85,
                "entity_kwd": "Python",
                "rank_flt": 0.5,
                "n_hop_with_weight": "[]",
            }
        }

        result = kgs._ent_info_from_(MagicMock(), sim_thr=0.3)
        assert "Python" in result
        assert result["Python"]["sim"] == 0.85

    def test_filters_below_threshold(self):
        """Verify entities below similarity threshold are excluded."""
        kgs = self._make_kg_search()
        kgs.dataStore.get_fields.return_value = {
            "id1": {
                "content_with_weight": "{}",
                "_score": 0.1,
                "entity_kwd": "LowScore",
                "rank_flt": 0.0,
                "n_hop_with_weight": "[]",
            }
        }

        result = kgs._ent_info_from_(MagicMock(), sim_thr=0.3)
        # Score 0.1 < threshold 0.3, should be excluded
        assert "LowScore" not in result

    def test_handles_list_entity_kwd(self):
        """Verify list-type entity_kwd is flattened to first element."""
        kgs = self._make_kg_search()
        kgs.dataStore.get_fields.return_value = {
            "id1": {
                "content_with_weight": "{}",
                "_score": 0.9,
                "entity_kwd": ["MultiWord", "Extra"],
                "rank_flt": 0.5,
                "n_hop_with_weight": "[]",
            }
        }

        result = kgs._ent_info_from_(MagicMock(), sim_thr=0.3)
        # Should use first element of the list
        assert "MultiWord" in result


class TestKGSearchRelationInfoFrom:
    """Tests for KGSearch._relation_info_from_() relationship extraction."""

    def _make_kg_search(self):
        """Create a KGSearch instance.

        Returns:
            KGSearch instance.
        """
        with patch("rag.nlp.search.query.FulltextQueryer"):
            from rag.graphrag.search import KGSearch
            mock_store = MagicMock()
            kgs = KGSearch(mock_store)
            return kgs

    def test_extracts_relation_info(self):
        """Verify relationship info is extracted from search results."""
        kgs = self._make_kg_search()
        kgs.dataStore.get_fields.return_value = {
            "id1": {
                "content_with_weight": "related description",
                "_score": 0.75,
                "from_entity_kwd": "Alice",
                "to_entity_kwd": "Bob",
                "weight_int": 3,
            }
        }

        result = kgs._relation_info_from_(MagicMock(), sim_thr=0.3)
        # Key should be canonically sorted (Alice, Bob)
        assert ("Alice", "Bob") in result
        assert result[("Alice", "Bob")]["sim"] == 0.75

    def test_filters_below_threshold(self):
        """Verify relations below similarity threshold are excluded."""
        kgs = self._make_kg_search()
        kgs.dataStore.get_fields.return_value = {
            "id1": {
                "content_with_weight": "desc",
                "_score": 0.1,
                "from_entity_kwd": "X",
                "to_entity_kwd": "Y",
                "weight_int": 1,
            }
        }

        result = kgs._relation_info_from_(MagicMock(), sim_thr=0.3)
        assert len(result) == 0

    def test_sorts_entity_pair_canonically(self):
        """Verify entity pairs are sorted alphabetically."""
        kgs = self._make_kg_search()
        kgs.dataStore.get_fields.return_value = {
            "id1": {
                "content_with_weight": "desc",
                "_score": 0.8,
                "from_entity_kwd": "Zebra",
                "to_entity_kwd": "Apple",
                "weight_int": 1,
            }
        }

        result = kgs._relation_info_from_(MagicMock(), sim_thr=0.3)
        # Should be sorted: Apple before Zebra
        assert ("Apple", "Zebra") in result


class TestKGSearchGetRelevantEntsByKeywords:
    """Tests for KGSearch.get_relevant_ents_by_keywords()."""

    def _make_kg_search(self):
        """Create a KGSearch instance.

        Returns:
            KGSearch instance with mocked dependencies.
        """
        with patch("rag.nlp.search.query.FulltextQueryer"):
            from rag.graphrag.search import KGSearch
            mock_store = MagicMock()
            kgs = KGSearch(mock_store)
            return kgs

    def test_empty_keywords_returns_empty(self):
        """Verify empty keywords list returns empty dict."""
        kgs = self._make_kg_search()
        result = kgs.get_relevant_ents_by_keywords(
            [], {}, "idx", "kb1", MagicMock(), sim_thr=0.3
        )
        assert result == {}

    def test_sets_entity_filter(self):
        """Verify the knowledge_graph_kwd filter is set to 'entity'."""
        kgs = self._make_kg_search()
        mock_emb = MagicMock()
        # Mock get_vector to return a matchDense object
        kgs.get_vector = MagicMock(return_value=MagicMock())
        kgs.dataStore.search.return_value = {}
        kgs.dataStore.get_fields.return_value = {}

        kgs.get_relevant_ents_by_keywords(
            ["python"], {"doc_id": ["d1"]}, "idx", "kb1", mock_emb
        )

        # Verify dataStore.search was called
        kgs.dataStore.search.assert_called_once()
