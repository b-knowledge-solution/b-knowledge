"""Unit tests for rag.graphrag.utils module.

Tests graph RAG utility functions including variable replacement, string cleaning,
graph change tracking, LLM/embedding caching, graph merge operations,
node/edge manipulation, hash computation, and entity/relationship parsing.
External dependencies (Redis, OpenSearch, networkx) are fully mocked.
"""
import os
import sys
import json
import pytest
from unittest.mock import MagicMock, patch

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

# Delete the pre-mocked module so we can import the real one
if "rag.graphrag.utils" in sys.modules and not hasattr(sys.modules["rag.graphrag.utils"], "GraphChange"):
    del sys.modules["rag.graphrag.utils"]


class TestGraphChange:
    """Tests for the GraphChange dataclass."""

    def test_default_fields_are_empty_sets(self):
        """Verify all default fields are empty sets."""
        from rag.graphrag.utils import GraphChange
        gc = GraphChange()
        assert gc.removed_nodes == set()
        assert gc.added_updated_nodes == set()
        assert gc.removed_edges == set()
        assert gc.added_updated_edges == set()

    def test_tracks_added_nodes(self):
        """Verify nodes can be added to the tracking set."""
        from rag.graphrag.utils import GraphChange
        gc = GraphChange()
        gc.added_updated_nodes.add("node_a")
        gc.added_updated_nodes.add("node_b")
        assert "node_a" in gc.added_updated_nodes
        assert "node_b" in gc.added_updated_nodes
        assert len(gc.added_updated_nodes) == 2

    def test_tracks_removed_edges(self):
        """Verify edge tuples can be added to the removed set."""
        from rag.graphrag.utils import GraphChange
        gc = GraphChange()
        gc.removed_edges.add(("src", "tgt"))
        assert ("src", "tgt") in gc.removed_edges

    def test_independent_instances(self):
        """Verify separate instances do not share mutable state."""
        from rag.graphrag.utils import GraphChange
        gc1 = GraphChange()
        gc2 = GraphChange()
        gc1.added_updated_nodes.add("only_in_gc1")
        assert "only_in_gc1" not in gc2.added_updated_nodes


class TestPerformVariableReplacements:
    """Tests for perform_variable_replacements() template substitution."""

    def test_basic_replacement(self):
        """Verify simple variable substitution in template string."""
        from rag.graphrag.utils import perform_variable_replacements
        result = perform_variable_replacements(
            "Hello {name}, welcome to {place}",
            variables={"name": "Alice", "place": "Wonderland"}
        )
        assert result == "Hello Alice, welcome to Wonderland"

    def test_no_variables_returns_original(self):
        """Verify input is returned unchanged when no variables are provided."""
        from rag.graphrag.utils import perform_variable_replacements
        result = perform_variable_replacements("No placeholders here")
        assert result == "No placeholders here"

    def test_replaces_in_system_history(self):
        """Verify variables are replaced in system-role history entries."""
        from rag.graphrag.utils import perform_variable_replacements
        history = [
            {"role": "system", "content": "You are {role}"},
            {"role": "user", "content": "Hello {role}"},
        ]
        perform_variable_replacements(
            "Input {role}",
            history=history,
            variables={"role": "assistant"}
        )
        # System message should be replaced
        assert history[0]["content"] == "You are assistant"
        # User message should NOT be replaced (only system role)
        assert history[1]["content"] == "Hello {role}"

    def test_empty_variables_dict(self):
        """Verify empty variables dict leaves template unchanged."""
        from rag.graphrag.utils import perform_variable_replacements
        result = perform_variable_replacements("{unchanged}", variables={})
        assert result == "{unchanged}"

    def test_none_history_handled(self):
        """Verify None history does not cause errors."""
        from rag.graphrag.utils import perform_variable_replacements
        result = perform_variable_replacements("test {x}", history=None, variables={"x": "val"})
        assert result == "test val"


class TestCleanStr:
    """Tests for clean_str() HTML/control character cleaning."""

    def test_removes_html_entities(self):
        """Verify HTML entities are unescaped."""
        from rag.graphrag.utils import clean_str
        result = clean_str("Hello &amp; World")
        assert result == "Hello & World"

    def test_removes_control_characters(self):
        """Verify control characters (0x00-0x1f) are removed."""
        from rag.graphrag.utils import clean_str
        result = clean_str("Hello\x00World\x01Test")
        assert result == "HelloWorldTest"

    def test_strips_whitespace(self):
        """Verify leading/trailing whitespace is stripped."""
        from rag.graphrag.utils import clean_str
        result = clean_str("  hello world  ")
        assert result == "hello world"

    def test_non_string_passthrough(self):
        """Verify non-string inputs are returned as-is."""
        from rag.graphrag.utils import clean_str
        assert clean_str(42) == 42
        assert clean_str(None) is None

    def test_removes_quotes(self):
        """Verify double quotes are removed."""
        from rag.graphrag.utils import clean_str
        result = clean_str('"quoted text"')
        assert result == "quoted text"


class TestDictHasKeysWithTypes:
    """Tests for dict_has_keys_with_types() validation helper."""

    def test_valid_dict(self):
        """Verify returns True when all keys exist with correct types."""
        from rag.graphrag.utils import dict_has_keys_with_types
        data = {"name": "Alice", "age": 30}
        assert dict_has_keys_with_types(data, [("name", str), ("age", int)]) is True

    def test_missing_key(self):
        """Verify returns False when a required key is missing."""
        from rag.graphrag.utils import dict_has_keys_with_types
        data = {"name": "Alice"}
        assert dict_has_keys_with_types(data, [("name", str), ("age", int)]) is False

    def test_wrong_type(self):
        """Verify returns False when a key has the wrong type."""
        from rag.graphrag.utils import dict_has_keys_with_types
        data = {"name": "Alice", "age": "thirty"}
        assert dict_has_keys_with_types(data, [("name", str), ("age", int)]) is False

    def test_empty_expectations(self):
        """Verify returns True when no fields are expected."""
        from rag.graphrag.utils import dict_has_keys_with_types
        assert dict_has_keys_with_types({}, []) is True

    def test_extra_keys_ignored(self):
        """Verify extra keys in dict do not cause failure."""
        from rag.graphrag.utils import dict_has_keys_with_types
        data = {"name": "Alice", "extra": True}
        assert dict_has_keys_with_types(data, [("name", str)]) is True


class TestGetFromTo:
    """Tests for get_from_to() canonical edge ordering."""

    def test_already_ordered(self):
        """Verify already-ordered pair is returned as-is."""
        from rag.graphrag.utils import get_from_to
        assert get_from_to("a", "b") == ("a", "b")

    def test_reverse_order(self):
        """Verify reverse-ordered pair is swapped."""
        from rag.graphrag.utils import get_from_to
        assert get_from_to("b", "a") == ("a", "b")

    def test_same_node(self):
        """Verify self-loop returns the same node pair."""
        from rag.graphrag.utils import get_from_to
        assert get_from_to("x", "x") == ("x", "x")


class TestComputeArgsHash:
    """Tests for compute_args_hash() MD5 hashing."""

    def test_deterministic(self):
        """Verify same args always produce the same hash."""
        from rag.graphrag.utils import compute_args_hash
        h1 = compute_args_hash("arg1", "arg2", 42)
        h2 = compute_args_hash("arg1", "arg2", 42)
        assert h1 == h2

    def test_different_args_different_hash(self):
        """Verify different args produce different hashes."""
        from rag.graphrag.utils import compute_args_hash
        h1 = compute_args_hash("a", "b")
        h2 = compute_args_hash("c", "d")
        assert h1 != h2

    def test_returns_hex_string(self):
        """Verify hash is a valid hex digest string."""
        from rag.graphrag.utils import compute_args_hash
        h = compute_args_hash("test")
        assert isinstance(h, str)
        assert len(h) == 32  # MD5 hex digest is 32 chars
        # Verify it's valid hex
        int(h, 16)


class TestGraphMerge:
    """Tests for graph_merge() combining two graphs."""

    def _make_graph(self):
        """Create a mock networkx Graph with minimal required interface.

        Returns:
            MagicMock configured as a networkx Graph.
        """
        import networkx as nx
        return nx.Graph()

    def test_merge_adds_new_nodes(self):
        """Verify new nodes from g2 are added to g1."""
        from rag.graphrag.utils import graph_merge, GraphChange
        g1 = self._make_graph()
        g2 = self._make_graph()

        g1.add_node("A", description="desc_a", source_id="s1", rank=0)
        g2.add_node("B", description="desc_b", source_id="s2", rank=0)
        g1.graph["source_id"] = ["doc1"]
        g2.graph["source_id"] = ["doc2"]

        change = GraphChange()
        result = graph_merge(g1, g2, change)

        assert result.has_node("A")
        assert result.has_node("B")
        assert "B" in change.added_updated_nodes

    def test_merge_concatenates_descriptions(self):
        """Verify overlapping nodes have descriptions concatenated."""
        from rag.graphrag.utils import graph_merge, GraphChange, GRAPH_FIELD_SEP
        g1 = self._make_graph()
        g2 = self._make_graph()

        g1.add_node("A", description="first", source_id="s1", rank=0)
        g2.add_node("A", description="second", source_id="s2", rank=0)
        g1.graph["source_id"] = []
        g2.graph["source_id"] = []

        change = GraphChange()
        graph_merge(g1, g2, change)

        # Description should be concatenated with separator
        assert "first" in g1.nodes["A"]["description"]
        assert "second" in g1.nodes["A"]["description"]
        assert GRAPH_FIELD_SEP in g1.nodes["A"]["description"]

    def test_merge_adds_new_edges(self):
        """Verify new edges from g2 are added to g1."""
        from rag.graphrag.utils import graph_merge, GraphChange
        g1 = self._make_graph()
        g2 = self._make_graph()

        g1.add_node("A", description="a", source_id="s1", rank=0)
        g1.add_node("B", description="b", source_id="s1", rank=0)
        g2.add_node("A", description="a2", source_id="s2", rank=0)
        g2.add_node("B", description="b2", source_id="s2", rank=0)
        g2.add_edge("A", "B", description="edge_ab", weight=1.0, keywords=["k1"], source_id="s2")
        g1.graph["source_id"] = []
        g2.graph["source_id"] = []

        change = GraphChange()
        graph_merge(g1, g2, change)

        assert g1.has_edge("A", "B")
        assert ("A", "B") in change.added_updated_edges

    def test_merge_sums_edge_weights(self):
        """Verify overlapping edges have weights summed."""
        from rag.graphrag.utils import graph_merge, GraphChange
        g1 = self._make_graph()
        g2 = self._make_graph()

        g1.add_node("A", description="a", source_id="s1", rank=0)
        g1.add_node("B", description="b", source_id="s1", rank=0)
        g1.add_edge("A", "B", description="e1", weight=2.0, keywords=["k1"], source_id="s1")

        g2.add_node("A", description="a2", source_id="s2", rank=0)
        g2.add_node("B", description="b2", source_id="s2", rank=0)
        g2.add_edge("A", "B", description="e2", weight=3.0, keywords=["k2"], source_id="s2")
        g1.graph["source_id"] = []
        g2.graph["source_id"] = []

        change = GraphChange()
        graph_merge(g1, g2, change)

        edge_data = g1.get_edge_data("A", "B")
        assert edge_data["weight"] == 5.0


class TestTidyGraph:
    """Tests for tidy_graph() graph cleanup."""

    def test_removes_nodes_missing_description(self):
        """Verify nodes without 'description' attribute are removed."""
        from rag.graphrag.utils import tidy_graph
        import networkx as nx
        graph = nx.Graph()
        # Node with required attributes
        graph.add_node("good", description="valid", source_id="s1")
        # Node missing description
        graph.add_node("bad", source_id="s1")

        callback = MagicMock()
        tidy_graph(graph, callback, check_attribute=True)

        assert graph.has_node("good")
        assert not graph.has_node("bad")

    def test_removes_nodes_missing_source_id(self):
        """Verify nodes without 'source_id' attribute are removed."""
        from rag.graphrag.utils import tidy_graph
        import networkx as nx
        graph = nx.Graph()
        graph.add_node("good", description="valid", source_id="s1")
        graph.add_node("bad", description="valid")

        callback = MagicMock()
        tidy_graph(graph, callback, check_attribute=True)

        assert graph.has_node("good")
        assert not graph.has_node("bad")

    def test_adds_empty_keywords_to_edges(self):
        """Verify edges without 'keywords' get an empty list added."""
        from rag.graphrag.utils import tidy_graph
        import networkx as nx
        graph = nx.Graph()
        graph.add_node("A", description="a", source_id="s1")
        graph.add_node("B", description="b", source_id="s1")
        graph.add_edge("A", "B", description="edge", source_id="s1")

        callback = MagicMock()
        tidy_graph(graph, callback, check_attribute=True)

        edge_data = graph.get_edge_data("A", "B")
        assert "keywords" in edge_data
        assert edge_data["keywords"] == []

    def test_skip_attribute_check(self):
        """Verify nodes are preserved when check_attribute is False."""
        from rag.graphrag.utils import tidy_graph
        import networkx as nx
        graph = nx.Graph()
        # Node without required attributes — should survive with check_attribute=False
        graph.add_node("incomplete")

        callback = MagicMock()
        tidy_graph(graph, callback, check_attribute=False)

        assert graph.has_node("incomplete")


class TestGraphFieldSep:
    """Tests for the GRAPH_FIELD_SEP constant."""

    def test_separator_value(self):
        """Verify the graph field separator is the expected string."""
        from rag.graphrag.utils import GRAPH_FIELD_SEP
        assert GRAPH_FIELD_SEP == "<SEP>"


class TestHandleSingleEntityExtraction:
    """Tests for handle_single_entity_extraction() LLM output parsing."""

    def test_valid_entity_record(self):
        """Verify a valid entity record is parsed correctly."""
        from rag.graphrag.utils import handle_single_entity_extraction
        result = handle_single_entity_extraction(
            ['"entity"', 'python', 'programming language', 'A popular language'],
            "chunk_1"
        )
        assert result is not None
        assert result["entity_name"] == "PYTHON"
        assert result["entity_type"] == "PROGRAMMING LANGUAGE"
        assert "popular language" in result["description"]
        assert result["source_id"] == "chunk_1"

    def test_invalid_record_type(self):
        """Verify non-entity records return None."""
        from rag.graphrag.utils import handle_single_entity_extraction
        result = handle_single_entity_extraction(
            ['"relationship"', 'a', 'b', 'desc'],
            "chunk_1"
        )
        assert result is None

    def test_too_few_attributes(self):
        """Verify records with fewer than 4 attributes return None."""
        from rag.graphrag.utils import handle_single_entity_extraction
        result = handle_single_entity_extraction(
            ['"entity"', 'name', 'type'],
            "chunk_1"
        )
        assert result is None

    def test_empty_entity_name_returns_none(self):
        """Verify empty entity name (after cleaning) returns None."""
        from rag.graphrag.utils import handle_single_entity_extraction
        # Entity name that becomes empty after clean_str
        result = handle_single_entity_extraction(
            ['"entity"', '   ', 'type', 'desc'],
            "chunk_1"
        )
        assert result is None

    def test_entity_name_uppercased(self):
        """Verify entity names are uppercased in the result."""
        from rag.graphrag.utils import handle_single_entity_extraction
        result = handle_single_entity_extraction(
            ['"entity"', 'MixedCase', 'some type', 'description'],
            "chunk_1"
        )
        assert result["entity_name"] == "MIXEDCASE"


class TestHandleSingleRelationshipExtraction:
    """Tests for handle_single_relationship_extraction() LLM output parsing."""

    def test_valid_relationship_record(self):
        """Verify a valid relationship record is parsed correctly."""
        from rag.graphrag.utils import handle_single_relationship_extraction
        result = handle_single_relationship_extraction(
            ['"relationship"', 'Alice', 'Bob', 'friends', 'social', '0.8'],
            "chunk_2"
        )
        assert result is not None
        # Source and target should be canonically sorted and uppercased
        assert result["src_id"] == "ALICE"
        assert result["tgt_id"] == "BOB"
        assert result["weight"] == 0.8
        assert result["source_id"] == "chunk_2"
        assert "metadata" in result

    def test_invalid_record_type(self):
        """Verify non-relationship records return None."""
        from rag.graphrag.utils import handle_single_relationship_extraction
        result = handle_single_relationship_extraction(
            ['"entity"', 'a', 'b', 'desc', 'kw'],
            "chunk_1"
        )
        assert result is None

    def test_too_few_attributes(self):
        """Verify records with fewer than 5 attributes return None."""
        from rag.graphrag.utils import handle_single_relationship_extraction
        result = handle_single_relationship_extraction(
            ['"relationship"', 'a', 'b', 'desc'],
            "chunk_1"
        )
        assert result is None

    def test_default_weight_when_not_float(self):
        """Verify default weight of 1.0 when last field is not a number."""
        from rag.graphrag.utils import handle_single_relationship_extraction
        result = handle_single_relationship_extraction(
            ['"relationship"', 'X', 'Y', 'desc', 'keywords', 'not_a_number'],
            "chunk_1"
        )
        assert result["weight"] == 1.0

    def test_canonical_edge_ordering(self):
        """Verify source/target are sorted alphabetically."""
        from rag.graphrag.utils import handle_single_relationship_extraction
        result = handle_single_relationship_extraction(
            ['"relationship"', 'Zebra', 'Apple', 'desc', 'kw', '1.0'],
            "chunk_1"
        )
        # Apple < Zebra alphabetically
        assert result["src_id"] == "APPLE"
        assert result["tgt_id"] == "ZEBRA"


class TestPackUserAssToOpenAIMessages:
    """Tests for pack_user_ass_to_openai_messages() message formatting."""

    def test_single_user_message(self):
        """Verify single argument creates one user message."""
        from rag.graphrag.utils import pack_user_ass_to_openai_messages
        result = pack_user_ass_to_openai_messages("hello")
        assert len(result) == 1
        assert result[0]["role"] == "user"
        assert result[0]["content"] == "hello"

    def test_alternating_roles(self):
        """Verify arguments alternate between user and assistant roles."""
        from rag.graphrag.utils import pack_user_ass_to_openai_messages
        result = pack_user_ass_to_openai_messages("q1", "a1", "q2", "a2")
        assert result[0]["role"] == "user"
        assert result[1]["role"] == "assistant"
        assert result[2]["role"] == "user"
        assert result[3]["role"] == "assistant"

    def test_empty_args(self):
        """Verify no arguments returns empty list."""
        from rag.graphrag.utils import pack_user_ass_to_openai_messages
        result = pack_user_ass_to_openai_messages()
        assert result == []


class TestSplitStringByMultiMarkers:
    """Tests for split_string_by_multi_markers() multi-delimiter splitting."""

    def test_single_marker(self):
        """Verify splitting by a single marker."""
        from rag.graphrag.utils import split_string_by_multi_markers
        result = split_string_by_multi_markers("a##b##c", ["##"])
        assert result == ["a", "b", "c"]

    def test_multiple_markers(self):
        """Verify splitting by multiple markers."""
        from rag.graphrag.utils import split_string_by_multi_markers
        result = split_string_by_multi_markers("a##b<|>c&&d", ["##", "<|>", "&&"])
        assert result == ["a", "b", "c", "d"]

    def test_empty_markers_returns_original(self):
        """Verify empty markers list returns original content."""
        from rag.graphrag.utils import split_string_by_multi_markers
        result = split_string_by_multi_markers("no split", [])
        assert result == ["no split"]

    def test_strips_whitespace(self):
        """Verify results are stripped of whitespace."""
        from rag.graphrag.utils import split_string_by_multi_markers
        result = split_string_by_multi_markers("  a  ##  b  ", ["##"])
        assert result == ["a", "b"]

    def test_removes_empty_results(self):
        """Verify empty strings from consecutive markers are removed."""
        from rag.graphrag.utils import split_string_by_multi_markers
        result = split_string_by_multi_markers("a####b", ["##"])
        assert "" not in result


class TestIsFloatRegex:
    """Tests for is_float_regex() numeric string validation."""

    def test_valid_float(self):
        """Verify valid float strings return True."""
        from rag.graphrag.utils import is_float_regex
        assert is_float_regex("3.14") is True
        assert is_float_regex("0.5") is True
        assert is_float_regex("-1.0") is True
        assert is_float_regex("+2.5") is True

    def test_valid_integer(self):
        """Verify integer strings also match."""
        from rag.graphrag.utils import is_float_regex
        assert is_float_regex("42") is True
        assert is_float_regex("-7") is True

    def test_invalid_strings(self):
        """Verify non-numeric strings return False."""
        from rag.graphrag.utils import is_float_regex
        assert is_float_regex("abc") is False
        assert is_float_regex("") is False
        assert is_float_regex("1.2.3") is False


class TestGraphMergeSourceIds:
    """Tests for graph_merge() source_id propagation."""

    def test_merges_graph_source_ids(self):
        """Verify graph-level source_ids are combined."""
        from rag.graphrag.utils import graph_merge, GraphChange
        import networkx as nx
        g1 = nx.Graph()
        g2 = nx.Graph()
        g1.graph["source_id"] = ["doc1"]
        g2.graph["source_id"] = ["doc2"]
        # Add a node so merge has something to do
        g2.add_node("A", description="a", source_id="s", rank=0)

        change = GraphChange()
        graph_merge(g1, g2, change)
        assert "doc1" in g1.graph["source_id"]
        assert "doc2" in g1.graph["source_id"]

    def test_initializes_source_id_if_missing(self):
        """Verify source_id is initialized on g1 if absent."""
        from rag.graphrag.utils import graph_merge, GraphChange
        import networkx as nx
        g1 = nx.Graph()
        g2 = nx.Graph()
        # g1 has no source_id
        g2.graph["source_id"] = ["doc1"]
        g2.add_node("A", description="a", source_id="s", rank=0)

        change = GraphChange()
        graph_merge(g1, g2, change)
        assert "source_id" in g1.graph
        assert "doc1" in g1.graph["source_id"]
