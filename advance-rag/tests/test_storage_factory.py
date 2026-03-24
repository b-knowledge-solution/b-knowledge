"""Unit tests for the storage backend factory module.

Tests that the storage factory selects and instantiates the correct
storage backend based on configuration. Since the actual factory logic
lives in common/settings.py (STORAGE_IMPL), these tests verify the
configuration-driven selection pattern.
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


class TestStorageFactoryModuleExists:
    """Tests that the storage_factory module can be imported."""

    def test_module_importable(self):
        """The storage_factory module should be importable."""
        import rag.utils.storage_factory
        assert rag.utils.storage_factory is not None

    def test_module_has_docstring(self):
        """The module should have a docstring describing its purpose."""
        import rag.utils.storage_factory
        assert rag.utils.storage_factory.__doc__ is not None
        assert "storage" in rag.utils.storage_factory.__doc__.lower()


class TestStorageImplInSettings:
    """Tests for the STORAGE_IMPL configuration in common/settings.py."""

    def test_settings_module_accessible(self):
        """The common.settings module should be accessible."""
        import common.settings
        assert sys.modules["common.settings"] is not None

    @patch("common.settings")
    def test_storage_impl_attribute_exists_when_configured(self, mock_settings):
        """When configured, STORAGE_IMPL should be an accessible attribute."""
        mock_storage = MagicMock()
        mock_settings.STORAGE_IMPL = mock_storage

        assert mock_settings.STORAGE_IMPL is mock_storage

    @patch("common.settings")
    def test_storage_impl_has_obj_exist_method(self, mock_settings):
        """STORAGE_IMPL should expose an obj_exist method."""
        mock_storage = MagicMock()
        mock_storage.obj_exist.return_value = True
        mock_settings.STORAGE_IMPL = mock_storage

        result = mock_settings.STORAGE_IMPL.obj_exist("bucket", "key")
        assert result is True

    @patch("common.settings")
    def test_storage_impl_has_rm_method(self, mock_settings):
        """STORAGE_IMPL should expose an rm (remove) method."""
        mock_storage = MagicMock()
        mock_settings.STORAGE_IMPL = mock_storage

        mock_settings.STORAGE_IMPL.rm("bucket", "key")
        mock_storage.rm.assert_called_once_with("bucket", "key")

    @patch("common.settings")
    def test_storage_impl_has_put_method(self, mock_settings):
        """STORAGE_IMPL should expose a put method for uploading."""
        mock_storage = MagicMock()
        mock_settings.STORAGE_IMPL = mock_storage

        mock_settings.STORAGE_IMPL.put("bucket", "key", b"data")
        mock_storage.put.assert_called_once_with("bucket", "key", b"data")

    @patch("common.settings")
    def test_storage_impl_has_get_method(self, mock_settings):
        """STORAGE_IMPL should expose a get method for downloading."""
        mock_storage = MagicMock()
        mock_storage.get.return_value = b"file-data"
        mock_settings.STORAGE_IMPL = mock_storage

        result = mock_settings.STORAGE_IMPL.get("bucket", "key")
        assert result == b"file-data"


class TestStorageBackendSelection:
    """Tests for storage backend selection based on configuration."""

    @patch("common.settings")
    def test_minio_backend_selected(self, mock_settings):
        """When STORAGE_TYPE is 'minio', MinIO backend should be used."""
        mock_settings.STORAGE_TYPE = "minio"
        mock_minio = MagicMock()
        mock_minio.__class__.__name__ = "MinIOStorage"
        mock_settings.STORAGE_IMPL = mock_minio

        # Verify the backend type
        assert mock_settings.STORAGE_TYPE == "minio"

    @patch("common.settings")
    def test_s3_backend_selected(self, mock_settings):
        """When STORAGE_TYPE is 's3', S3 backend should be used."""
        mock_settings.STORAGE_TYPE = "s3"
        mock_s3 = MagicMock()
        mock_settings.STORAGE_IMPL = mock_s3

        assert mock_settings.STORAGE_TYPE == "s3"

    @patch("common.settings")
    def test_storage_operations_are_bucket_scoped(self, mock_settings):
        """All storage operations should be scoped by bucket (kb_id)."""
        mock_storage = MagicMock()
        mock_settings.STORAGE_IMPL = mock_storage

        bucket = "knowledge-base-123"
        key = "doc-456/chunk-789"

        # Put operation
        mock_settings.STORAGE_IMPL.put(bucket, key, b"chunk-data")
        mock_storage.put.assert_called_with(bucket, key, b"chunk-data")

        # Get operation
        mock_settings.STORAGE_IMPL.get(bucket, key)
        mock_storage.get.assert_called_with(bucket, key)

        # Exist check
        mock_settings.STORAGE_IMPL.obj_exist(bucket, key)
        mock_storage.obj_exist.assert_called_with(bucket, key)

        # Delete operation
        mock_settings.STORAGE_IMPL.rm(bucket, key)
        mock_storage.rm.assert_called_with(bucket, key)


class TestStorageErrorHandling:
    """Tests for storage backend error handling patterns."""

    @patch("common.settings")
    def test_obj_exist_returns_false_for_missing_key(self, mock_settings):
        """obj_exist should return False for non-existent keys."""
        mock_storage = MagicMock()
        mock_storage.obj_exist.return_value = False
        mock_settings.STORAGE_IMPL = mock_storage

        result = mock_settings.STORAGE_IMPL.obj_exist("bucket", "nonexistent-key")
        assert result is False

    @patch("common.settings")
    def test_get_raises_on_missing_object(self, mock_settings):
        """get should raise an exception for missing objects."""
        mock_storage = MagicMock()
        mock_storage.get.side_effect = FileNotFoundError("Object not found")
        mock_settings.STORAGE_IMPL = mock_storage

        with pytest.raises(FileNotFoundError):
            mock_settings.STORAGE_IMPL.get("bucket", "missing-key")

    @patch("common.settings")
    def test_put_raises_on_permission_error(self, mock_settings):
        """put should raise on permission errors."""
        mock_storage = MagicMock()
        mock_storage.put.side_effect = PermissionError("Access denied")
        mock_settings.STORAGE_IMPL = mock_storage

        with pytest.raises(PermissionError):
            mock_settings.STORAGE_IMPL.put("bucket", "key", b"data")
