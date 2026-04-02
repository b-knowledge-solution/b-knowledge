"""Unit tests for common.metadata_utils module.

Tests metadata filtering, schema conversion, condition mapping,
deduplication, and metadata merging utilities.
"""
import os
import sys

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

from common.metadata_utils import (
    convert_conditions,
    meta_filter,
    dedupe_list,
    update_metadata_to,
    metadata_schema,
    _is_json_schema,
    _is_metadata_list,
    turn2jsonschema,
)


# ── convert_conditions ────────────────────────────────────────────────

class TestConvertConditions:
    """Tests for convert_conditions() function."""

    def test_maps_is_to_equals(self):
        """Verify 'is' operator maps to '='."""
        conds = {"conditions": [{"comparison_operator": "is", "name": "color", "value": "red"}]}
        result = convert_conditions(conds)
        assert result == [{"op": "=", "key": "color", "value": "red"}]

    def test_maps_not_is_to_not_equals(self):
        """Verify 'not is' operator maps to unicode not-equal sign."""
        conds = {"conditions": [{"comparison_operator": "not is", "name": "k", "value": "v"}]}
        result = convert_conditions(conds)
        assert result[0]["op"] == "\u2260"

    def test_maps_gte_and_lte(self):
        """Verify '>=' maps to unicode >= and '<=' maps to unicode <=."""
        conds = {"conditions": [
            {"comparison_operator": ">=", "name": "age", "value": "18"},
            {"comparison_operator": "<=", "name": "age", "value": "65"},
        ]}
        result = convert_conditions(conds)
        assert result[0]["op"] == "\u2265"
        assert result[1]["op"] == "\u2264"

    def test_passes_through_unknown_operators(self):
        """Verify operators not in the mapping pass through unchanged."""
        conds = {"conditions": [{"comparison_operator": "contains", "name": "text", "value": "foo"}]}
        result = convert_conditions(conds)
        assert result[0]["op"] == "contains"

    def test_none_input_returns_empty(self):
        """Verify None input returns an empty list."""
        assert convert_conditions(None) == []

    def test_empty_conditions_returns_empty(self):
        """Verify missing 'conditions' key returns an empty list."""
        assert convert_conditions({}) == []

    def test_multiple_conditions(self):
        """Verify multiple conditions are all converted."""
        conds = {"conditions": [
            {"comparison_operator": "is", "name": "a", "value": "1"},
            {"comparison_operator": "!=", "name": "b", "value": "2"},
        ]}
        result = convert_conditions(conds)
        assert len(result) == 2
        assert result[1]["op"] == "\u2260"


# ── meta_filter ───────────────────────────────────────────────────────

class TestMetaFilter:
    """Tests for meta_filter() function."""

    def _sample_metas(self):
        """Build a sample inverted metadata index for testing.

        Returns:
            Dict mapping metadata keys to value-to-docid mappings.
        """
        return {
            "color": {"red": ["d1", "d2"], "blue": ["d3"]},
            "size": {"10": ["d1"], "20": ["d2", "d3"]},
        }

    def test_equals_filter(self):
        """Verify '=' operator returns matching document IDs."""
        metas = self._sample_metas()
        result = meta_filter(metas, [{"op": "=", "key": "color", "value": "red"}])
        assert set(result) == {"d1", "d2"}

    def test_not_equals_filter(self):
        """Verify not-equal operator excludes matching values."""
        metas = self._sample_metas()
        result = meta_filter(metas, [{"op": "\u2260", "key": "color", "value": "red"}])
        assert set(result) == {"d3"}

    def test_contains_filter(self):
        """Verify 'contains' operator matches substrings."""
        metas = {"name": {"hello world": ["d1"], "goodbye": ["d2"]}}
        result = meta_filter(metas, [{"op": "contains", "key": "name", "value": "hello"}])
        assert "d1" in result
        assert "d2" not in result

    def test_not_contains_filter(self):
        """Verify 'not contains' operator excludes substring matches."""
        metas = {"name": {"hello world": ["d1"], "goodbye": ["d2"]}}
        result = meta_filter(metas, [{"op": "not contains", "key": "name", "value": "hello"}])
        assert "d2" in result
        assert "d1" not in result

    def test_and_logic(self):
        """Verify 'and' logic intersects results from multiple filters."""
        metas = self._sample_metas()
        filters = [
            {"op": "=", "key": "color", "value": "red"},
            {"op": "=", "key": "size", "value": "10"},
        ]
        result = meta_filter(metas, filters, logic="and")
        # d1 is red AND size 10
        assert set(result) == {"d1"}

    def test_or_logic(self):
        """Verify 'or' logic unions results from multiple filters."""
        metas = self._sample_metas()
        filters = [
            {"op": "=", "key": "color", "value": "blue"},
            {"op": "=", "key": "size", "value": "10"},
        ]
        result = meta_filter(metas, filters, logic="or")
        # d3 is blue OR d1 is size 10
        assert "d1" in result
        assert "d3" in result

    def test_missing_key_returns_empty(self):
        """Verify filter on non-existent key returns empty list."""
        metas = self._sample_metas()
        result = meta_filter(metas, [{"op": "=", "key": "nonexistent", "value": "x"}])
        assert result == []

    def test_empty_filters_returns_empty(self):
        """Verify no filters returns empty list."""
        metas = self._sample_metas()
        result = meta_filter(metas, [])
        assert result == []

    def test_greater_than_filter(self):
        """Verify '>' operator compares numeric values correctly."""
        metas = {"score": {"10": ["d1"], "20": ["d2"], "5": ["d3"]}}
        result = meta_filter(metas, [{"op": ">", "key": "score", "value": "10"}])
        assert "d2" in result
        # d1 has score 10 (not greater than), d3 has 5 (not greater than)
        assert "d1" not in result
        assert "d3" not in result

    def test_less_than_filter(self):
        """Verify '<' operator compares numeric values correctly."""
        metas = {"score": {"10": ["d1"], "20": ["d2"], "5": ["d3"]}}
        result = meta_filter(metas, [{"op": "<", "key": "score", "value": "10"}])
        assert "d3" in result
        assert "d1" not in result

    def test_empty_operator(self):
        """Verify 'empty' operator matches empty values."""
        metas = {"tag": {"": ["d1"], "something": ["d2"]}}
        result = meta_filter(metas, [{"op": "empty", "key": "tag", "value": ""}])
        assert "d1" in result
        assert "d2" not in result

    def test_not_empty_operator(self):
        """Verify 'not empty' operator matches non-empty values."""
        metas = {"tag": {"": ["d1"], "something": ["d2"]}}
        result = meta_filter(metas, [{"op": "not empty", "key": "tag", "value": ""}])
        assert "d2" in result
        assert "d1" not in result

    def test_date_comparison_equals(self):
        """Verify date-format values are compared as strings for '=' operator."""
        metas = {"created": {"2025-01-15": ["d1"], "2025-06-01": ["d2"]}}
        result = meta_filter(metas, [{"op": "=", "key": "created", "value": "2025-01-15"}])
        assert set(result) == {"d1"}

    def test_date_comparison_greater_than(self):
        """Verify date-format values are compared lexicographically for '>' operator."""
        metas = {"created": {"2025-01-15": ["d1"], "2025-06-01": ["d2"]}}
        result = meta_filter(metas, [{"op": ">", "key": "created", "value": "2025-03-01"}])
        # Only 2025-06-01 > 2025-03-01
        assert set(result) == {"d2"}

    def test_start_with_filter(self):
        """Verify 'start with' operator matches string prefix."""
        metas = {"name": {"alice": ["d1"], "bob": ["d2"]}}
        result = meta_filter(metas, [{"op": "start with", "key": "name", "value": "ali"}])
        assert "d1" in result
        assert "d2" not in result

    def test_end_with_filter(self):
        """Verify 'end with' operator matches string suffix."""
        metas = {"name": {"alice": ["d1"], "bob": ["d2"]}}
        result = meta_filter(metas, [{"op": "end with", "key": "name", "value": "ice"}])
        assert "d1" in result
        assert "d2" not in result


# ── dedupe_list ───────────────────────────────────────────────────────

class TestDedupeList:
    """Tests for dedupe_list() function."""

    def test_removes_duplicates(self):
        """Verify duplicate items are removed."""
        assert dedupe_list([1, 2, 2, 3]) == [1, 2, 3]

    def test_preserves_order(self):
        """Verify insertion order is preserved."""
        assert dedupe_list(["b", "a", "b", "c"]) == ["b", "a", "c"]

    def test_empty_list(self):
        """Verify empty list returns empty list."""
        assert dedupe_list([]) == []

    def test_no_duplicates(self):
        """Verify a list without duplicates is unchanged."""
        assert dedupe_list([1, 2, 3]) == [1, 2, 3]

    def test_uses_string_comparison(self):
        """Verify dedup uses string comparison (1 and '1' are same)."""
        result = dedupe_list([1, "1"])
        # Both stringify to "1", so only first is kept
        assert len(result) == 1
        assert result[0] == 1


# ── update_metadata_to ───────────────────────────────────────────────

class TestUpdateMetadataTo:
    """Tests for update_metadata_to() function."""

    def test_adds_new_string_key(self):
        """Verify a new string key is added to metadata."""
        metadata = {}
        result = update_metadata_to(metadata, {"author": "Alice"})
        assert result["author"] == "Alice"

    def test_adds_new_list_key(self):
        """Verify a new list key is added to metadata."""
        metadata = {}
        result = update_metadata_to(metadata, {"tags": ["a", "b"]})
        assert result["tags"] == ["a", "b"]

    def test_merges_list_values(self):
        """Verify list values are merged and deduplicated."""
        metadata = {"tags": ["a", "b"]}
        result = update_metadata_to(metadata, {"tags": ["b", "c"]})
        assert set(result["tags"]) == {"a", "b", "c"}

    def test_overwrites_string_value(self):
        """Verify string values are overwritten, not merged."""
        metadata = {"author": "Alice"}
        result = update_metadata_to(metadata, {"author": "Bob"})
        assert result["author"] == "Bob"

    def test_none_meta_returns_unchanged(self):
        """Verify None meta returns the original metadata unchanged."""
        metadata = {"a": "1"}
        result = update_metadata_to(metadata, None)
        assert result == {"a": "1"}

    def test_empty_meta_returns_unchanged(self):
        """Verify empty string meta returns the original metadata unchanged."""
        metadata = {"a": "1"}
        result = update_metadata_to(metadata, "")
        assert result == {"a": "1"}

    def test_json_string_meta(self):
        """Verify JSON string meta is parsed and merged."""
        metadata = {}
        result = update_metadata_to(metadata, '{"key": "value"}')
        assert result["key"] == "value"

    def test_skips_non_string_non_list_values(self):
        """Verify numeric and other non-string/non-list values are skipped."""
        metadata = {}
        result = update_metadata_to(metadata, {"count": 42})
        assert "count" not in result

    def test_filters_non_string_list_items(self):
        """Verify non-string items in lists are filtered out."""
        metadata = {}
        result = update_metadata_to(metadata, {"tags": ["valid", 123, "also_valid"]})
        assert result["tags"] == ["valid", "also_valid"]

    def test_skips_empty_filtered_list(self):
        """Verify an all-numeric list is skipped entirely."""
        metadata = {}
        result = update_metadata_to(metadata, {"nums": [1, 2, 3]})
        assert "nums" not in result

    def test_appends_string_to_existing_list(self):
        """Verify a string value is appended to an existing list key."""
        metadata = {"tags": ["a"]}
        result = update_metadata_to(metadata, {"tags": "b"})
        assert result["tags"] == ["a", "b"]

    def test_invalid_json_string_returns_unchanged(self):
        """Verify invalid JSON string returns the original metadata."""
        metadata = {"a": "1"}
        result = update_metadata_to(metadata, "not valid json {{{}}")
        assert result == {"a": "1"}


# ── metadata_schema ───────────────────────────────────────────────────

class TestMetadataSchema:
    """Tests for metadata_schema() function."""

    def test_basic_schema_generation(self):
        """Verify a basic metadata list produces a JSON Schema object."""
        metadata = [{"key": "author", "description": "Document author"}]
        result = metadata_schema(metadata)
        assert result["type"] == "object"
        assert "author" in result["properties"]
        assert result["properties"]["author"]["description"] == "Document author"
        assert result["additionalProperties"] is False

    def test_with_enum(self):
        """Verify enum values are included in the schema property."""
        metadata = [{"key": "status", "enum": ["draft", "published"]}]
        result = metadata_schema(metadata)
        prop = result["properties"]["status"]
        assert prop["enum"] == ["draft", "published"]
        assert prop["type"] == "string"

    def test_empty_input_returns_empty(self):
        """Verify empty or None input returns empty dict."""
        assert metadata_schema(None) == {}
        assert metadata_schema([]) == {}

    def test_skips_items_without_key(self):
        """Verify items without a 'key' field are skipped."""
        metadata = [{"description": "no key"}, {"key": "valid"}]
        result = metadata_schema(metadata)
        assert "valid" in result["properties"]
        assert len(result["properties"]) == 1

    def test_multiple_properties(self):
        """Verify multiple items produce multiple properties."""
        metadata = [
            {"key": "a", "description": "first"},
            {"key": "b", "description": "second"},
        ]
        result = metadata_schema(metadata)
        assert len(result["properties"]) == 2


# ── _is_json_schema ──────────────────────────────────────────────────

class TestIsJsonSchema:
    """Tests for _is_json_schema() helper."""

    def test_with_dollar_schema(self):
        """Verify dict with $schema key is recognized."""
        assert _is_json_schema({"$schema": "http://json-schema.org/draft-07/schema#"}) is True

    def test_with_type_object_and_properties(self):
        """Verify dict with type=object and properties is recognized."""
        assert _is_json_schema({"type": "object", "properties": {"a": {}}}) is True

    def test_plain_dict_not_schema(self):
        """Verify a regular dict is not recognized as a schema."""
        assert _is_json_schema({"name": "test"}) is False

    def test_non_dict_returns_false(self):
        """Verify non-dict input returns False."""
        assert _is_json_schema([1, 2]) is False
        assert _is_json_schema("string") is False

    def test_type_object_without_properties(self):
        """Verify type=object without properties dict is not recognized."""
        assert _is_json_schema({"type": "object"}) is False


# ── _is_metadata_list ─────────────────────────────────────────────────

class TestIsMetadataList:
    """Tests for _is_metadata_list() helper."""

    def test_valid_metadata_list(self):
        """Verify a valid metadata list is recognized."""
        obj = [{"key": "author"}, {"key": "date", "description": "creation date"}]
        assert _is_metadata_list(obj) is True

    def test_with_enum(self):
        """Verify a metadata list with enum fields is recognized."""
        obj = [{"key": "status", "enum": ["draft", "published"]}]
        assert _is_metadata_list(obj) is True

    def test_empty_list_returns_false(self):
        """Verify an empty list is not recognized."""
        assert _is_metadata_list([]) is False

    def test_non_list_returns_false(self):
        """Verify non-list input returns False."""
        assert _is_metadata_list({"key": "test"}) is False

    def test_item_without_key_returns_false(self):
        """Verify items without 'key' cause rejection."""
        assert _is_metadata_list([{"description": "no key"}]) is False

    def test_empty_key_returns_false(self):
        """Verify empty string key causes rejection."""
        assert _is_metadata_list([{"key": ""}]) is False

    def test_non_string_key_returns_false(self):
        """Verify non-string key causes rejection."""
        assert _is_metadata_list([{"key": 123}]) is False

    def test_invalid_enum_type_returns_false(self):
        """Verify non-list enum causes rejection."""
        assert _is_metadata_list([{"key": "a", "enum": "not_a_list"}]) is False

    def test_invalid_description_type_returns_false(self):
        """Verify non-string description causes rejection."""
        assert _is_metadata_list([{"key": "a", "description": 123}]) is False


# ── turn2jsonschema ───────────────────────────────────────────────────

class TestTurn2JsonSchema:
    """Tests for turn2jsonschema() function."""

    def test_passes_through_json_schema(self):
        """Verify an already-valid JSON Schema dict is returned as-is."""
        schema = {"type": "object", "properties": {"a": {"type": "string"}}}
        assert turn2jsonschema(schema) is schema

    def test_converts_metadata_list(self):
        """Verify a metadata list is converted to a JSON Schema."""
        meta_list = [{"key": "author", "description": "The author"}]
        result = turn2jsonschema(meta_list)
        assert result["type"] == "object"
        assert "author" in result["properties"]

    def test_uses_descriptions_fallback(self):
        """Verify 'descriptions' field is used when 'description' is absent."""
        meta_list = [{"key": "tag", "descriptions": "A tag"}]
        result = turn2jsonschema(meta_list)
        assert result["properties"]["tag"]["description"] == "A tag"

    def test_unrecognized_input_returns_empty(self):
        """Verify unrecognized input returns empty dict."""
        assert turn2jsonschema({"random": "dict"}) == {}
        assert turn2jsonschema([1, 2, 3]) == {}

    def test_includes_enum_in_converted_schema(self):
        """Verify enum values from metadata list are included in the schema."""
        meta_list = [{"key": "status", "enum": ["active", "inactive"]}]
        result = turn2jsonschema(meta_list)
        assert result["properties"]["status"]["enum"] == ["active", "inactive"]
