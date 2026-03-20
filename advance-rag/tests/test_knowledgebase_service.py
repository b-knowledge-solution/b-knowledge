"""Unit tests for the KnowledgebaseService database service.

Tests KB creation validation, name deduplication, parser config
management, field map operations, and access control in
db/services/knowledgebase_service.py. All database dependencies
are mocked.
"""

import os
import sys
import types
import pytest
from unittest.mock import MagicMock, patch

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Stub heavy dependencies
# ---------------------------------------------------------------------------
def _ensure_mock_module(name: str):
    """Register a mock module in sys.modules if not already importable.

    Args:
        name: Dotted module path to mock.
    """
    if name not in sys.modules:
        try:
            __import__(name)
        except (ImportError, ModuleNotFoundError):
            mod = types.ModuleType(name)
            sys.modules[name] = mod
            parts = name.split(".")
            for i in range(1, len(parts)):
                parent = ".".join(parts[:i])
                if parent not in sys.modules:
                    sys.modules[parent] = types.ModuleType(parent)


_ensure_mock_module("common.settings")
_ensure_mock_module("common.token_utils")
_ensure_mock_module("rag.nlp")

_mock_rag_tokenizer = MagicMock()
sys.modules["rag.nlp"].rag_tokenizer = _mock_rag_tokenizer

# Mock DB connection context
_ensure_mock_module("db.db_models")
mock_DB = MagicMock()
mock_DB.connection_context.return_value = lambda f: f
mock_DB.atomic.return_value.__enter__ = MagicMock()
mock_DB.atomic.return_value.__exit__ = MagicMock()
sys.modules["db.db_models"].DB = mock_DB


class TestKnowledgebaseServiceCreateWithName:
    """Tests for KnowledgebaseService.create_with_name validation."""

    @patch("db.services.knowledgebase_service.TenantService")
    @patch("db.services.knowledgebase_service.duplicate_name", side_effect=lambda fn, **kw: kw["name"])
    @patch("db.services.knowledgebase_service.get_parser_config", return_value={"chunk_token_num": 512})
    @patch("db.services.knowledgebase_service.get_uuid", return_value="test-uuid")
    def test_valid_name_creates_payload(self, mock_uuid, mock_parser, mock_dup, mock_tenant):
        """A valid name should produce a payload dict."""
        from db.services.knowledgebase_service import KnowledgebaseService

        mock_tenant.get_by_id.return_value = (True, MagicMock(llm_id="llm-1"))

        ok, payload = KnowledgebaseService.create_with_name(
            name="My Dataset", tenant_id="tenant-1"
        )

        assert ok is True
        assert payload["name"] == "My Dataset"
        assert payload["id"] == "test-uuid"
        assert payload["tenant_id"] == "tenant-1"
        assert payload["parser_id"] == "naive"

    @patch("db.services.knowledgebase_service.TenantService")
    @patch("db.services.knowledgebase_service.duplicate_name", side_effect=lambda fn, **kw: kw["name"])
    @patch("db.services.knowledgebase_service.get_parser_config", return_value={"chunk_token_num": 512})
    @patch("db.services.knowledgebase_service.get_uuid", return_value="test-uuid")
    def test_custom_parser_id_used(self, mock_uuid, mock_parser, mock_dup, mock_tenant):
        """A custom parser_id should be used instead of default 'naive'."""
        from db.services.knowledgebase_service import KnowledgebaseService

        mock_tenant.get_by_id.return_value = (True, MagicMock(llm_id="llm-1"))

        ok, payload = KnowledgebaseService.create_with_name(
            name="Legal Docs", tenant_id="tenant-1", parser_id="laws"
        )

        assert ok is True
        assert payload["parser_id"] == "laws"

    def test_empty_name_returns_error(self):
        """An empty name should return failure."""
        from db.services.knowledgebase_service import KnowledgebaseService

        ok, result = KnowledgebaseService.create_with_name(
            name="   ", tenant_id="tenant-1"
        )

        assert ok is False

    def test_non_string_name_returns_error(self):
        """A non-string name should return failure."""
        from db.services.knowledgebase_service import KnowledgebaseService

        ok, result = KnowledgebaseService.create_with_name(
            name=123, tenant_id="tenant-1"
        )

        assert ok is False

    def test_name_too_long_returns_error(self):
        """A name exceeding the byte limit should return failure."""
        from db.services.knowledgebase_service import KnowledgebaseService, DATASET_NAME_LIMIT

        long_name = "a" * (DATASET_NAME_LIMIT + 1)
        ok, result = KnowledgebaseService.create_with_name(
            name=long_name, tenant_id="tenant-1"
        )

        assert ok is False

    @patch("db.services.knowledgebase_service.TenantService")
    @patch("db.services.knowledgebase_service.duplicate_name", side_effect=lambda fn, **kw: kw["name"])
    def test_tenant_not_found_returns_error(self, mock_dup, mock_tenant):
        """If the tenant does not exist, should return failure."""
        from db.services.knowledgebase_service import KnowledgebaseService

        mock_tenant.get_by_id.return_value = (False, None)

        ok, result = KnowledgebaseService.create_with_name(
            name="Dataset", tenant_id="nonexistent"
        )

        assert ok is False


class TestKnowledgebaseServiceParserConfig:
    """Tests for update_parser_config deep merge logic."""

    def test_dfs_update_merges_nested_dicts(self):
        """Nested dicts should be merged recursively."""
        from db.services.knowledgebase_service import KnowledgebaseService

        mock_kb = MagicMock()
        mock_kb.parser_config = {"a": {"x": 1, "y": 2}, "b": "old"}

        with patch.object(KnowledgebaseService, "get_by_id", return_value=(True, mock_kb)):
            with patch.object(KnowledgebaseService, "update_by_id"):
                KnowledgebaseService.update_parser_config("kb-1", {"a": {"y": 99, "z": 3}})

                # Nested dict merged
                assert mock_kb.parser_config["a"]["x"] == 1
                assert mock_kb.parser_config["a"]["y"] == 99
                assert mock_kb.parser_config["a"]["z"] == 3

    def test_dfs_update_merges_lists_by_union(self):
        """List values should be merged as union (set)."""
        from db.services.knowledgebase_service import KnowledgebaseService

        mock_kb = MagicMock()
        mock_kb.parser_config = {"tags": ["a", "b"]}

        with patch.object(KnowledgebaseService, "get_by_id", return_value=(True, mock_kb)):
            with patch.object(KnowledgebaseService, "update_by_id"):
                KnowledgebaseService.update_parser_config("kb-1", {"tags": ["b", "c"]})

                # Lists should be merged (union)
                tags = mock_kb.parser_config["tags"]
                assert "a" in tags
                assert "b" in tags
                assert "c" in tags

    def test_not_found_raises_lookup_error(self):
        """If KB not found, should raise LookupError."""
        from db.services.knowledgebase_service import KnowledgebaseService

        with patch.object(KnowledgebaseService, "get_by_id", return_value=(False, None)):
            with pytest.raises(LookupError, match="not found"):
                KnowledgebaseService.update_parser_config("nonexistent", {"key": "val"})


class TestKnowledgebaseServiceDeleteFieldMap:
    """Tests for delete_field_map."""

    def test_removes_field_map_from_config(self):
        """field_map should be removed from parser_config."""
        from db.services.knowledgebase_service import KnowledgebaseService

        mock_kb = MagicMock()
        mock_kb.parser_config = {"field_map": {"col_tks": "Column"}, "other": "value"}

        with patch.object(KnowledgebaseService, "get_by_id", return_value=(True, mock_kb)):
            with patch.object(KnowledgebaseService, "update_by_id"):
                KnowledgebaseService.delete_field_map("kb-1")

                assert "field_map" not in mock_kb.parser_config
                assert mock_kb.parser_config["other"] == "value"

    def test_not_found_raises_lookup_error(self):
        """If KB not found, should raise LookupError."""
        from db.services.knowledgebase_service import KnowledgebaseService

        with patch.object(KnowledgebaseService, "get_by_id", return_value=(False, None)):
            with pytest.raises(LookupError, match="not found"):
                KnowledgebaseService.delete_field_map("nonexistent")

    def test_missing_field_map_does_not_crash(self):
        """If field_map is already absent, should not crash."""
        from db.services.knowledgebase_service import KnowledgebaseService

        mock_kb = MagicMock()
        mock_kb.parser_config = {"other": "value"}

        with patch.object(KnowledgebaseService, "get_by_id", return_value=(True, mock_kb)):
            with patch.object(KnowledgebaseService, "update_by_id"):
                # Should not raise
                KnowledgebaseService.delete_field_map("kb-1")
                assert "field_map" not in mock_kb.parser_config


class TestKnowledgebaseServiceGetFieldMap:
    """Tests for get_field_map aggregation."""

    def test_aggregates_field_maps_from_multiple_kbs(self):
        """Should merge field_maps from multiple knowledge bases."""
        from db.services.knowledgebase_service import KnowledgebaseService

        kb1 = MagicMock()
        kb1.parser_config = {"field_map": {"col1_tks": "Column 1"}}
        kb2 = MagicMock()
        kb2.parser_config = {"field_map": {"col2_tks": "Column 2"}}

        with patch.object(KnowledgebaseService, "get_by_ids", return_value=[kb1, kb2]):
            result = KnowledgebaseService.get_field_map(["kb-1", "kb-2"])

            assert result["col1_tks"] == "Column 1"
            assert result["col2_tks"] == "Column 2"

    def test_skips_kbs_without_field_map(self):
        """KBs without field_map should be skipped."""
        from db.services.knowledgebase_service import KnowledgebaseService

        kb1 = MagicMock()
        kb1.parser_config = {"other": "value"}
        kb2 = MagicMock()
        kb2.parser_config = {"field_map": {"col_tks": "Column"}}

        with patch.object(KnowledgebaseService, "get_by_ids", return_value=[kb1, kb2]):
            result = KnowledgebaseService.get_field_map(["kb-1", "kb-2"])

            assert len(result) == 1
            assert result["col_tks"] == "Column"

    def test_empty_ids_returns_empty_map(self):
        """Empty ID list should return empty dict."""
        from db.services.knowledgebase_service import KnowledgebaseService

        with patch.object(KnowledgebaseService, "get_by_ids", return_value=[]):
            result = KnowledgebaseService.get_field_map([])

            assert result == {}
