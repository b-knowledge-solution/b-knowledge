"""Unit tests for rag.graphrag.entity_resolution module.

Tests entity resolution functionality including entity deduplication,
entity merging, similarity matching pre-filters, LLM response parsing,
and the _has_digit_in_2gram_diff helper. All LLM calls are mocked.
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


class TestEntityResolutionResult:
    """Tests for the EntityResolutionResult dataclass."""

    def test_result_holds_graph_and_change(self):
        """Verify EntityResolutionResult stores graph and change objects."""
        from rag.graphrag.entity_resolution import EntityResolutionResult
        from rag.graphrag.utils import GraphChange
        import networkx as nx

        graph = nx.Graph()
        change = GraphChange()
        result = EntityResolutionResult(graph=graph, change=change)

        assert result.graph is graph
        assert result.change is change


class TestEntityResolutionInit:
    """Tests for EntityResolution initialization."""

    def test_stores_llm_invoker(self):
        """Verify the LLM invoker is stored during initialization."""
        from rag.graphrag.entity_resolution import EntityResolution
        mock_llm = MagicMock()
        er = EntityResolution(llm_invoker=mock_llm)
        assert er._llm is mock_llm

    def test_sets_default_delimiters(self):
        """Verify default delimiter keys are set."""
        from rag.graphrag.entity_resolution import EntityResolution
        mock_llm = MagicMock()
        er = EntityResolution(llm_invoker=mock_llm)
        assert er._record_delimiter_key == "record_delimiter"
        assert er._entity_index_delimiter_key == "entity_index_delimiter"
        assert er._resolution_result_delimiter_key == "resolution_result_delimiter"

    def test_stores_resolution_prompt(self):
        """Verify the resolution prompt template is set."""
        from rag.graphrag.entity_resolution import EntityResolution
        mock_llm = MagicMock()
        er = EntityResolution(llm_invoker=mock_llm)
        assert er._resolution_prompt is not None
        assert isinstance(er._resolution_prompt, str)


class TestProcessResults:
    """Tests for EntityResolution._process_results() LLM response parsing."""

    def _make_resolver(self):
        """Create an EntityResolution instance with mocked LLM.

        Returns:
            EntityResolution instance.
        """
        from rag.graphrag.entity_resolution import EntityResolution
        mock_llm = MagicMock()
        return EntityResolution(llm_invoker=mock_llm)

    def test_parses_yes_answer(self):
        """Verify 'yes' answers are extracted as confirmed duplicates."""
        er = self._make_resolver()
        # Simulate LLM response with question-index and yes/no format
        results = "<|>1<|> &&yes&& ## <|>2<|> &&no&&"
        parsed = er._process_results(2, results, "##", "<|>", "&&")
        # Only question 1 (yes) should be in the result
        assert len(parsed) == 1
        assert parsed[0] == (1, "yes")

    def test_parses_multiple_yes_answers(self):
        """Verify multiple 'yes' answers are all captured."""
        er = self._make_resolver()
        results = "<|>1<|> &&Yes&& ## <|>2<|> &&Yes&& ## <|>3<|> &&No&&"
        parsed = er._process_results(3, results, "##", "<|>", "&&")
        assert len(parsed) == 2
        # Both question 1 and 2 should be yes
        indices = [p[0] for p in parsed]
        assert 1 in indices
        assert 2 in indices

    def test_ignores_invalid_index(self):
        """Verify out-of-range question indices are ignored."""
        er = self._make_resolver()
        # Index 5 exceeds records_length=2
        results = "<|>5<|> &&yes&& ## <|>1<|> &&yes&&"
        parsed = er._process_results(2, results, "##", "<|>", "&&")
        # Only index 1 should be accepted
        assert len(parsed) == 1
        assert parsed[0][0] == 1

    def test_empty_response(self):
        """Verify empty LLM response produces no results."""
        er = self._make_resolver()
        parsed = er._process_results(3, "", "##", "<|>", "&&")
        assert len(parsed) == 0

    def test_malformed_response(self):
        """Verify malformed response is handled gracefully."""
        er = self._make_resolver()
        parsed = er._process_results(2, "This is not a structured response at all", "##", "<|>", "&&")
        # No valid indices or answers to extract
        assert len(parsed) == 0


class TestIsSimilarity:
    """Tests for EntityResolution.is_similarity() pre-filter."""

    def _make_resolver(self):
        """Create an EntityResolution instance.

        Returns:
            EntityResolution instance.
        """
        from rag.graphrag.entity_resolution import EntityResolution
        mock_llm = MagicMock()
        return EntityResolution(llm_invoker=mock_llm)

    def test_identical_names_are_similar(self):
        """Verify identical names pass the similarity pre-filter."""
        er = self._make_resolver()
        # Identical names should always be considered similar
        # (edit distance = 0, which is <= half of length)
        assert er.is_similarity("Machine Learning", "Machine Learning") is True

    def test_very_different_names_not_similar(self):
        """Verify very different names fail the similarity pre-filter."""
        er = self._make_resolver()
        # Completely different names should fail
        result = er.is_similarity("Apple", "Xylophone")
        assert result is False

    def test_similar_names_pass(self):
        """Verify names differing by small edit distance pass the filter."""
        er = self._make_resolver()
        # "Python" vs "Pythn" — edit distance 1, which is <= half of min(6,5)=2
        result = er.is_similarity("Python", "Pythn")
        assert result is True

    def test_digit_difference_rejects(self):
        """Verify names differing in digits are rejected."""
        er = self._make_resolver()
        # "Model 3" vs "Model 5" — digit in 2-gram diff should reject
        result = er.is_similarity("Model 3", "Model 5")
        assert result is False


class TestHasDigitIn2gramDiff:
    """Tests for EntityResolution._has_digit_in_2gram_diff() helper."""

    def _make_resolver(self):
        """Create an EntityResolution instance.

        Returns:
            EntityResolution instance.
        """
        from rag.graphrag.entity_resolution import EntityResolution
        mock_llm = MagicMock()
        return EntityResolution(llm_invoker=mock_llm)

    def test_no_digit_difference(self):
        """Verify returns False when diff contains no digits."""
        er = self._make_resolver()
        # "abc" vs "abd" — diff is in 'c' vs 'd', no digits
        result = er._has_digit_in_2gram_diff("abc", "abd")
        assert result is False

    def test_digit_in_difference(self):
        """Verify returns True when diff contains digits."""
        er = self._make_resolver()
        # "item1" vs "item2" — the digit portion differs
        result = er._has_digit_in_2gram_diff("item1", "item2")
        assert result is True

    def test_identical_strings(self):
        """Verify returns False for identical strings (no diff)."""
        er = self._make_resolver()
        result = er._has_digit_in_2gram_diff("same", "same")
        assert result is False

    def test_single_char_strings(self):
        """Verify single-char strings produce no 2-grams (empty diff)."""
        er = self._make_resolver()
        # Single char => empty 2-gram set => empty diff => no digits
        result = er._has_digit_in_2gram_diff("a", "b")
        assert result is False


class TestDefaultDelimiters:
    """Tests for module-level delimiter constants."""

    def test_record_delimiter(self):
        """Verify the default record delimiter value."""
        from rag.graphrag.entity_resolution import DEFAULT_RECORD_DELIMITER
        assert DEFAULT_RECORD_DELIMITER == "##"

    def test_entity_index_delimiter(self):
        """Verify the default entity index delimiter value."""
        from rag.graphrag.entity_resolution import DEFAULT_ENTITY_INDEX_DELIMITER
        assert DEFAULT_ENTITY_INDEX_DELIMITER == "<|>"

    def test_resolution_result_delimiter(self):
        """Verify the default resolution result delimiter value."""
        from rag.graphrag.entity_resolution import DEFAULT_RESOLUTION_RESULT_DELIMITER
        assert DEFAULT_RESOLUTION_RESULT_DELIMITER == "&&"
