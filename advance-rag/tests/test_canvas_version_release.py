"""Unit tests for canvas version release lifecycle.

Tests UserCanvasVersionService release-related methods: get_latest_released,
save_or_replace_latest with release flag, and protection of released versions.
Also tests UserCanvasService.get_agent_dsl_with_release for release mode DSL
retrieval.
"""

import os
import sys
import types
import json
import pytest
from unittest.mock import MagicMock, patch, PropertyMock

_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Patch missing attributes in conftest-mocked modules before importing.
# conftest stubs db.db_models but does not expose UserCanvasVersion/UserCanvas/etc.
# conftest stubs db.services.common_service.CommonService without insert/delete_all_versions.
# ---------------------------------------------------------------------------
_db_models_mod = sys.modules.get("db.db_models")
if _db_models_mod:
    if not hasattr(_db_models_mod, "UserCanvasVersion") or isinstance(getattr(_db_models_mod, "UserCanvasVersion", None), MagicMock):
        _db_models_mod.UserCanvasVersion = MagicMock()
    if not hasattr(_db_models_mod, "UserCanvas") or isinstance(getattr(_db_models_mod, "UserCanvas", None), MagicMock):
        _db_models_mod.UserCanvas = MagicMock()
    if not hasattr(_db_models_mod, "CanvasTemplate") or isinstance(getattr(_db_models_mod, "CanvasTemplate", None), MagicMock):
        _db_models_mod.CanvasTemplate = MagicMock()
    if not hasattr(_db_models_mod, "User") or isinstance(getattr(_db_models_mod, "User", None), MagicMock):
        _db_models_mod.User = MagicMock()

# Ensure CommonService stub has insert and delete_by_ids methods
_cs_mod = sys.modules.get("db.services.common_service")
if _cs_mod:
    _cs_cls = getattr(_cs_mod, "CommonService", None)
    if _cs_cls and not hasattr(_cs_cls, "insert"):
        @classmethod
        def _mock_insert(cls, **kw):
            return True
        _cs_cls.insert = _mock_insert
    if _cs_cls and not hasattr(_cs_cls, "delete_by_ids"):
        @classmethod
        def _mock_delete_by_ids(cls, pids):
            return len(pids) if pids else 0
        _cs_cls.delete_by_ids = _mock_delete_by_ids

# Ensure db module has needed enums
_db_mod = sys.modules.get("db")
if _db_mod:
    if not hasattr(_db_mod, "CanvasCategory"):
        _db_mod.CanvasCategory = MagicMock()
    if not hasattr(_db_mod, "TenantPermission"):
        _db_mod.TenantPermission = MagicMock()

# Ensure peewee has DoesNotExist
_pw_mod = sys.modules.get("peewee")
if _pw_mod:
    if not hasattr(_pw_mod, "DoesNotExist"):
        _pw_mod.DoesNotExist = type("DoesNotExist", (Exception,), {})
    if not hasattr(_pw_mod, "fn"):
        _pw_mod.fn = MagicMock()


from db.services.user_canvas_version import UserCanvasVersionService
from db.services.canvas_service import UserCanvasService


class TestGetLatestReleased:
    """Tests for UserCanvasVersionService.get_latest_released."""

    @patch.object(UserCanvasVersionService, "_get_latest_by_canvas_id")
    def test_returns_released_version(self, mock_get_latest: MagicMock) -> None:
        """Should return the latest released version when one exists."""
        mock_version = MagicMock()
        mock_version.release = True
        mock_version.dsl = '{"nodes": []}'
        mock_get_latest.return_value = mock_version

        result = UserCanvasVersionService.get_latest_released("canvas-1")

        assert result == mock_version
        mock_get_latest.assert_called_once_with("canvas-1", only_released=True)

    @patch.object(UserCanvasVersionService, "_get_latest_by_canvas_id")
    def test_returns_none_when_no_released_version(self, mock_get_latest: MagicMock) -> None:
        """Should return None when no released version exists."""
        mock_get_latest.return_value = None

        result = UserCanvasVersionService.get_latest_released("canvas-1")

        assert result is None


class TestGetLatestVersionTitle:
    """Tests for UserCanvasVersionService.get_latest_version_title."""

    @patch.object(UserCanvasVersionService, "_get_latest_by_canvas_id")
    def test_returns_title_for_release_mode(self, mock_get_latest: MagicMock) -> None:
        """Should return title from the latest released version."""
        mock_version = MagicMock()
        mock_version.title = "v1.0_released"
        mock_get_latest.return_value = mock_version

        result = UserCanvasVersionService.get_latest_version_title("canvas-1", release_mode=True)

        assert result == "v1.0_released"
        mock_get_latest.assert_called_once_with("canvas-1", only_released=True)

    @patch.object(UserCanvasVersionService, "_get_latest_by_canvas_id")
    def test_returns_none_when_no_version(self, mock_get_latest: MagicMock) -> None:
        """Should return None when no matching version exists."""
        mock_get_latest.return_value = None

        result = UserCanvasVersionService.get_latest_version_title("canvas-1")

        assert result is None


class TestBuildVersionTitle:
    """Tests for UserCanvasVersionService.build_version_title."""

    def test_builds_title_with_timestamp(self) -> None:
        """Should format title as user_agent_timestamp."""
        title = UserCanvasVersionService.build_version_title("alice", "my-agent", ts=0)

        assert title.startswith("alice_my-agent_")
        assert "-" in title

    def test_defaults_empty_nickname(self) -> None:
        """Should use 'tenant' when nickname is empty."""
        title = UserCanvasVersionService.build_version_title("", "agent", ts=0)

        assert title.startswith("tenant_agent_")

    def test_defaults_empty_agent_title(self) -> None:
        """Should use 'agent' when agent title is empty."""
        title = UserCanvasVersionService.build_version_title("alice", "", ts=0)

        assert title.startswith("alice_agent_")


class TestNormalizeDsl:
    """Tests for UserCanvasVersionService._normalize_dsl."""

    def test_normalizes_dict(self) -> None:
        """Should return the same dict after round-trip serialization."""
        dsl = {"nodes": [1, 2], "edges": []}
        result = UserCanvasVersionService._normalize_dsl(dsl)

        assert result == dsl

    def test_normalizes_json_string(self) -> None:
        """Should parse JSON string to dict."""
        dsl_str = '{"nodes": [1, 2]}'
        result = UserCanvasVersionService._normalize_dsl(dsl_str)

        assert result == {"nodes": [1, 2]}

    def test_invalid_json_raises_value_error(self) -> None:
        """Should raise ValueError for invalid JSON strings."""
        with pytest.raises(ValueError, match="Invalid DSL JSON string"):
            UserCanvasVersionService._normalize_dsl("{bad json")

    def test_non_dict_raises_value_error(self) -> None:
        """Should raise ValueError when DSL is not a dict."""
        with pytest.raises(ValueError, match="DSL must be a JSON object"):
            UserCanvasVersionService._normalize_dsl("[1, 2, 3]")


class TestSaveOrReplaceLatestRelease:
    """Tests for save_or_replace_latest with release flag interactions."""

    @patch.object(UserCanvasVersionService, "delete_all_versions")
    @patch.object(UserCanvasVersionService, "update_by_id")
    @patch.object(UserCanvasVersionService, "insert")
    @patch.object(UserCanvasVersionService, "model")
    def test_release_version_updates_existing(
        self, mock_model: MagicMock, mock_insert: MagicMock,
        mock_update: MagicMock, mock_prune: MagicMock
    ) -> None:
        """Should update release flag on existing version with same DSL."""
        dsl = {"nodes": [1, 2]}
        # Latest version has same DSL but not released
        mock_latest = MagicMock()
        mock_latest.dsl = json.dumps(dsl)
        mock_latest.release = False
        mock_latest.id = "version-1"

        mock_query = MagicMock()
        mock_model.select.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.first.return_value = mock_latest

        vid, created = UserCanvasVersionService.save_or_replace_latest(
            user_canvas_id="canvas-1",
            dsl=dsl,
            release=True,
        )

        # Should update in-place, not insert
        assert vid == "version-1"
        assert created is False
        mock_update.assert_called_once()
        mock_insert.assert_not_called()

    @patch.object(UserCanvasVersionService, "delete_all_versions")
    @patch.object(UserCanvasVersionService, "update_by_id")
    @patch.object(UserCanvasVersionService, "insert")
    @patch.object(UserCanvasVersionService, "model")
    def test_released_version_protected_from_non_release_save(
        self, mock_model: MagicMock, mock_insert: MagicMock,
        mock_update: MagicMock, mock_prune: MagicMock
    ) -> None:
        """Should create new version instead of overwriting a released version."""
        dsl = {"nodes": [1, 2]}
        # Latest version has same DSL and IS released
        mock_latest = MagicMock()
        mock_latest.dsl = json.dumps(dsl)
        mock_latest.release = True
        mock_latest.id = "version-1"

        mock_query = MagicMock()
        mock_model.select.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.first.return_value = mock_latest

        vid, created = UserCanvasVersionService.save_or_replace_latest(
            user_canvas_id="canvas-1",
            dsl=dsl,
            release=False,
        )

        # Should create new version to protect the released one
        assert created is True
        mock_insert.assert_called_once()
        mock_update.assert_not_called()

    @patch.object(UserCanvasVersionService, "delete_all_versions")
    @patch.object(UserCanvasVersionService, "update_by_id")
    @patch.object(UserCanvasVersionService, "insert")
    @patch.object(UserCanvasVersionService, "model")
    def test_new_dsl_creates_new_version(
        self, mock_model: MagicMock, mock_insert: MagicMock,
        mock_update: MagicMock, mock_prune: MagicMock
    ) -> None:
        """Should create a new version when DSL content has changed."""
        old_dsl = {"nodes": [1]}
        new_dsl = {"nodes": [1, 2, 3]}

        mock_latest = MagicMock()
        mock_latest.dsl = json.dumps(old_dsl)
        mock_latest.release = False
        mock_latest.id = "version-1"

        mock_query = MagicMock()
        mock_model.select.return_value = mock_query
        mock_query.where.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.first.return_value = mock_latest

        vid, created = UserCanvasVersionService.save_or_replace_latest(
            user_canvas_id="canvas-1",
            dsl=new_dsl,
            release=True,
        )

        # New DSL always creates a new version
        assert created is True
        mock_insert.assert_called_once()


class TestGetAgentDslWithRelease:
    """Tests for UserCanvasService.get_agent_dsl_with_release."""

    @patch("db.services.user_canvas_version.UserCanvasVersionService.get_latest_released")
    @patch.object(UserCanvasService, "get_by_id")
    def test_release_mode_returns_released_dsl(
        self, mock_get_by_id: MagicMock, mock_get_released: MagicMock
    ) -> None:
        """Should return DSL from the latest released version in release mode."""
        mock_canvas = MagicMock()
        mock_canvas.user_id = "tenant-1"
        mock_canvas.dsl = '{"draft": true}'
        mock_get_by_id.return_value = (True, mock_canvas)

        mock_released = MagicMock()
        mock_released.dsl = '{"released": true}'
        mock_get_released.return_value = mock_released

        cvs, dsl = UserCanvasService.get_agent_dsl_with_release(
            "agent-1", release_mode=True, tenant_id="tenant-1"
        )

        assert '"released"' in dsl

    @patch.object(UserCanvasService, "get_by_id")
    def test_non_release_mode_returns_draft_dsl(self, mock_get_by_id: MagicMock) -> None:
        """Should return draft DSL when release_mode is False."""
        mock_canvas = MagicMock()
        mock_canvas.user_id = "tenant-1"
        mock_canvas.dsl = '{"draft": true}'
        mock_get_by_id.return_value = (True, mock_canvas)

        cvs, dsl = UserCanvasService.get_agent_dsl_with_release(
            "agent-1", release_mode=False, tenant_id="tenant-1"
        )

        assert '"draft"' in dsl

    @patch.object(UserCanvasService, "get_by_id")
    def test_agent_not_found_raises_lookup_error(self, mock_get_by_id: MagicMock) -> None:
        """Should raise LookupError when agent does not exist."""
        mock_get_by_id.return_value = (False, None)

        with pytest.raises(LookupError, match="Agent not found"):
            UserCanvasService.get_agent_dsl_with_release("nonexistent")

    @patch("db.services.user_canvas_version.UserCanvasVersionService.get_latest_released")
    @patch.object(UserCanvasService, "get_by_id")
    def test_no_released_version_raises_permission_error(
        self, mock_get_by_id: MagicMock, mock_get_released: MagicMock
    ) -> None:
        """Should raise PermissionError when no released version is available."""
        mock_canvas = MagicMock()
        mock_canvas.user_id = "tenant-1"
        mock_get_by_id.return_value = (True, mock_canvas)
        mock_get_released.return_value = None

        with pytest.raises(PermissionError, match="No available published version"):
            UserCanvasService.get_agent_dsl_with_release(
                "agent-1", release_mode=True, tenant_id="tenant-1"
            )

    @patch.object(UserCanvasService, "get_by_id")
    def test_tenant_mismatch_raises_permission_error(self, mock_get_by_id: MagicMock) -> None:
        """Should raise PermissionError when tenant_id does not match agent owner."""
        mock_canvas = MagicMock()
        mock_canvas.user_id = "tenant-1"
        mock_get_by_id.return_value = (True, mock_canvas)

        with pytest.raises(PermissionError, match="do not own"):
            UserCanvasService.get_agent_dsl_with_release(
                "agent-1", release_mode=False, tenant_id="wrong-tenant"
            )
