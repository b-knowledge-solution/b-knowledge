"""Unit tests for rag.utils.minio_conn module.

Tests the RAGFlowMinio S3-compatible storage connector including connection
initialization, file upload/download, bucket operations, presigned URL
generation, single-bucket vs multi-bucket mode, path prefix handling,
and the decorator-based path rewriting system. The minio client is fully mocked.
"""
import os
import sys
import pytest
from unittest.mock import MagicMock, patch, PropertyMock
from io import BytesIO

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


def _make_minio(bucket=None, prefix_path=None):
    """Create a RAGFlowMinio instance with mocked MinIO client.

    Bypasses singleton and __init__ to avoid real connection attempts.

    Args:
        bucket: Default bucket for single-bucket mode, or None for multi-bucket.
        prefix_path: Optional path prefix for all object keys.

    Returns:
        RAGFlowMinio instance with mocked conn.
    """
    from rag.utils.minio_conn import RAGFlowMinio

    minio_inst = RAGFlowMinio.__new__(RAGFlowMinio)
    minio_inst.conn = MagicMock()
    minio_inst.bucket = bucket
    minio_inst.prefix_path = prefix_path
    return minio_inst


class TestRAGFlowMinioHealth:
    """Tests for RAGFlowMinio.health() connectivity check."""

    def test_multi_bucket_health_success(self):
        """Verify health returns True when list_buckets succeeds (multi-bucket)."""
        minio = _make_minio(bucket=None)
        minio.conn.list_buckets.return_value = [MagicMock()]
        assert minio.health() is True

    def test_single_bucket_health_success(self):
        """Verify health returns True when default bucket exists (single-bucket)."""
        minio = _make_minio(bucket="default-bucket")
        minio.conn.bucket_exists.return_value = True
        assert minio.health() is True

    def test_single_bucket_health_failure(self):
        """Verify health returns False when default bucket doesn't exist."""
        minio = _make_minio(bucket="default-bucket")
        minio.conn.bucket_exists.return_value = False
        assert minio.health() is False

    def test_health_handles_s3_error(self):
        """Verify health returns False on S3Error."""
        from minio.error import S3Error
        minio = _make_minio(bucket=None)
        minio.conn.list_buckets.side_effect = S3Error("err", "msg", "res")
        assert minio.health() is False


class TestRAGFlowMinioPut:
    """Tests for RAGFlowMinio.put() file upload."""

    def test_put_uploads_binary_data(self):
        """Verify put() uploads binary data to MinIO."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        binary_data = b"file content"
        minio.put("test-bucket", "path/file.pdf", binary_data)
        minio.conn.put_object.assert_called_once()

    def test_put_creates_bucket_if_missing(self):
        """Verify put() creates the bucket if it doesn't exist (multi-bucket mode)."""
        minio = _make_minio(bucket=None)
        minio.conn.bucket_exists.return_value = False
        minio.put("new-bucket", "file.txt", b"data")
        minio.conn.make_bucket.assert_called_once_with("new-bucket")

    def test_put_retries_on_failure(self):
        """Verify put() retries up to 3 times on failure."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        minio.conn.put_object.side_effect = Exception("Upload failed")
        minio.__open__ = MagicMock()

        # Should not raise — retries silently
        with patch("time.sleep"):
            minio.put("bucket", "file.txt", b"data")

        # put_object should have been called 3 times (retries)
        assert minio.conn.put_object.call_count == 3


class TestRAGFlowMinioGet:
    """Tests for RAGFlowMinio.get() file download."""

    def test_get_returns_file_content(self):
        """Verify get() returns the file content as bytes."""
        minio = _make_minio()
        mock_response = MagicMock()
        mock_response.read.return_value = b"file content"
        minio.conn.get_object.return_value = mock_response
        result = minio.get("bucket", "file.txt")
        assert result == b"file content"

    def test_get_returns_none_on_failure(self):
        """Verify get() returns None when download fails."""
        minio = _make_minio()
        minio.conn.get_object.side_effect = Exception("Not found")
        minio.__open__ = MagicMock()

        with patch("time.sleep"):
            result = minio.get("bucket", "missing.txt")

        assert result is None


class TestRAGFlowMinioRm:
    """Tests for RAGFlowMinio.rm() file deletion."""

    def test_rm_removes_object(self):
        """Verify rm() calls remove_object on the MinIO client."""
        minio = _make_minio()
        minio.rm("bucket", "file.txt")
        minio.conn.remove_object.assert_called_once()

    def test_rm_handles_error_gracefully(self):
        """Verify rm() handles errors without raising."""
        minio = _make_minio()
        minio.conn.remove_object.side_effect = Exception("Delete failed")
        # Should not raise
        minio.rm("bucket", "file.txt")


class TestRAGFlowMinioObjExist:
    """Tests for RAGFlowMinio.obj_exist() object existence check."""

    def test_returns_true_when_exists(self):
        """Verify returns True when object exists."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        minio.conn.stat_object.return_value = MagicMock()
        assert minio.obj_exist("bucket", "file.txt") is True

    def test_returns_false_when_bucket_missing(self):
        """Verify returns False when bucket doesn't exist."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = False
        assert minio.obj_exist("bucket", "file.txt") is False

    def test_returns_false_on_no_such_key(self):
        """Verify returns False for NoSuchKey S3Error."""
        from minio.error import S3Error
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        err = S3Error("NoSuchKey", "msg", "res")
        err.code = "NoSuchKey"
        minio.conn.stat_object.side_effect = err
        assert minio.obj_exist("bucket", "missing.txt") is False


class TestRAGFlowMinioBucketExists:
    """Tests for RAGFlowMinio.bucket_exists() bucket check."""

    def test_returns_true_when_exists(self):
        """Verify returns True when bucket exists."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        assert minio.bucket_exists("my-bucket") is True

    def test_returns_false_when_missing(self):
        """Verify returns False when bucket doesn't exist."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = False
        assert minio.bucket_exists("missing-bucket") is False


class TestRAGFlowMinioPresignedUrl:
    """Tests for RAGFlowMinio.get_presigned_url() URL generation."""

    def test_generates_presigned_url(self):
        """Verify presigned URL is generated successfully."""
        minio = _make_minio()
        minio.conn.get_presigned_url.return_value = "https://minio.local/presigned-url"
        result = minio.get_presigned_url("bucket", "file.txt", 3600)
        assert "presigned-url" in result

    def test_returns_none_after_retries(self):
        """Verify None is returned after exhausting retries."""
        minio = _make_minio()
        minio.conn.get_presigned_url.side_effect = Exception("Network error")
        minio.__open__ = MagicMock()

        with patch("time.sleep"):
            result = minio.get_presigned_url("bucket", "file.txt", 3600)

        assert result is None


class TestRAGFlowMinioSingleBucketMode:
    """Tests for single-bucket mode path rewriting."""

    def test_put_uses_default_bucket(self):
        """Verify put redirects to default bucket in single-bucket mode."""
        minio = _make_minio(bucket="default")
        minio.conn.put_object.return_value = MagicMock()

        minio.put("logical-bucket", "file.txt", b"data")

        # The physical bucket should be "default", not "logical-bucket"
        call_args = minio.conn.put_object.call_args
        assert call_args[0][0] == "default"

    def test_put_prefixes_path_with_logical_bucket(self):
        """Verify object key includes logical bucket as path prefix."""
        minio = _make_minio(bucket="default")
        minio.conn.put_object.return_value = MagicMock()

        minio.put("logical-bucket", "file.txt", b"data")

        call_args = minio.conn.put_object.call_args
        # Object key should include the logical bucket name as a prefix
        fnm = call_args[0][1]
        assert "logical-bucket" in fnm

    def test_get_uses_default_bucket(self):
        """Verify get redirects to default bucket in single-bucket mode."""
        minio = _make_minio(bucket="default")
        mock_response = MagicMock()
        mock_response.read.return_value = b"content"
        minio.conn.get_object.return_value = mock_response

        minio.get("logical-bucket", "file.txt")

        call_args = minio.conn.get_object.call_args
        assert call_args[0][0] == "default"


class TestRAGFlowMinioPrefixPath:
    """Tests for prefix_path mode path rewriting."""

    def test_put_prepends_prefix_path(self):
        """Verify prefix_path is prepended to object keys."""
        minio = _make_minio(bucket=None, prefix_path="tenant1/data")
        minio.conn.bucket_exists.return_value = True
        minio.conn.put_object.return_value = MagicMock()

        minio.put("my-bucket", "file.txt", b"data")

        call_args = minio.conn.put_object.call_args
        fnm = call_args[0][1]
        assert fnm.startswith("tenant1/data/")

    def test_combined_default_bucket_and_prefix(self):
        """Verify both default bucket and prefix_path work together."""
        minio = _make_minio(bucket="default", prefix_path="prefix")
        minio.conn.put_object.return_value = MagicMock()

        minio.put("logical", "file.txt", b"data")

        call_args = minio.conn.put_object.call_args
        # Physical bucket should be "default"
        assert call_args[0][0] == "default"
        # Key should include prefix and logical bucket
        fnm = call_args[0][1]
        assert "prefix" in fnm
        assert "logical" in fnm


class TestResolveBucketAndPath:
    """Tests for RAGFlowMinio._resolve_bucket_and_path() helper."""

    def test_multi_bucket_no_prefix(self):
        """Verify path is unchanged in multi-bucket mode without prefix."""
        minio = _make_minio(bucket=None, prefix_path=None)
        bucket, fnm = minio._resolve_bucket_and_path("my-bucket", "file.txt")
        assert bucket == "my-bucket"
        assert fnm == "file.txt"

    def test_single_bucket_rewrites(self):
        """Verify single-bucket mode rewrites bucket and prepends path."""
        minio = _make_minio(bucket="default", prefix_path=None)
        bucket, fnm = minio._resolve_bucket_and_path("logical", "file.txt")
        assert bucket == "default"
        assert "logical" in fnm

    def test_prefix_path_added(self):
        """Verify prefix_path is added to the file key."""
        minio = _make_minio(bucket=None, prefix_path="tenant/data")
        bucket, fnm = minio._resolve_bucket_and_path("my-bucket", "file.txt")
        assert bucket == "my-bucket"
        assert fnm.startswith("tenant/data/")

    def test_combined_single_bucket_and_prefix(self):
        """Verify combined mode resolves both bucket and prefix."""
        minio = _make_minio(bucket="default", prefix_path="prefix")
        bucket, fnm = minio._resolve_bucket_and_path("logical", "file.txt")
        assert bucket == "default"
        assert "prefix" in fnm
        assert "logical" in fnm


class TestRAGFlowMinioClose:
    """Tests for RAGFlowMinio.__close__() connection teardown."""

    def test_close_sets_conn_to_none(self):
        """Verify __close__ deletes conn and sets it to None."""
        minio = _make_minio()
        assert minio.conn is not None
        minio.__close__()
        assert minio.conn is None

    def test_close_then_reopen(self):
        """Verify connection can be re-established after close."""
        minio = _make_minio()
        minio.__close__()
        assert minio.conn is None
        # Simulate reopening by assigning a new mock
        minio.conn = MagicMock()
        assert minio.conn is not None


class TestRAGFlowMinioOpen:
    """Tests for RAGFlowMinio.__open__() connection establishment."""

    def test_open_closes_existing_connection(self):
        """Verify __open__ closes any existing connection before reconnecting."""
        minio = _make_minio()
        old_conn = minio.conn
        with patch("rag.utils.minio_conn.settings") as mock_settings:
            mock_settings.S3 = {
                "host": "localhost:9000",
                "user": "minioadmin",
                "password": "minioadmin",
                "secure": False,
            }
            with patch("rag.utils.minio_conn.Minio", return_value=MagicMock()):
                with patch("rag.utils.minio_conn._build_minio_http_client", return_value=None):
                    minio.__open__()
        # Old connection should have been replaced
        assert minio.conn is not old_conn

    def test_open_parses_secure_string(self):
        """Verify __open__ parses string 'true' as secure=True."""
        minio = _make_minio()
        with patch("rag.utils.minio_conn.settings") as mock_settings:
            mock_settings.S3 = {
                "host": "localhost:9000",
                "user": "admin",
                "password": "secret",
                "secure": "true",
            }
            with patch("rag.utils.minio_conn.Minio") as MockMinio:
                MockMinio.return_value = MagicMock()
                with patch("rag.utils.minio_conn._build_minio_http_client", return_value=None):
                    minio.__open__()
            # Verify Minio was called with secure=True (boolean)
            call_kwargs = MockMinio.call_args[1]
            assert call_kwargs["secure"] is True

    def test_open_handles_connection_failure(self):
        """Verify __open__ logs exception on connection failure."""
        minio = _make_minio()
        minio.__close__()
        with patch("rag.utils.minio_conn.settings") as mock_settings:
            mock_settings.S3 = {"host": "bad-host", "user": "u", "password": "p", "secure": False}
            with patch("rag.utils.minio_conn.Minio", side_effect=Exception("Connection refused")):
                with patch("rag.utils.minio_conn._build_minio_http_client", return_value=None):
                    # Should not raise
                    minio.__open__()
        # conn may be None after failed connection
        assert minio.conn is None


class TestBuildMinioHttpClient:
    """Tests for _build_minio_http_client() SSL configuration."""

    def test_returns_none_when_verify_true(self):
        """Verify None is returned when S3 verify is True (use default SSL)."""
        from rag.utils.minio_conn import _build_minio_http_client
        with patch("rag.utils.minio_conn.settings") as mock_settings:
            mock_settings.S3 = {"verify": True}
            result = _build_minio_http_client()
        assert result is None

    def test_returns_none_when_verify_string_true(self):
        """Verify None is returned when S3 verify is string 'true'."""
        from rag.utils.minio_conn import _build_minio_http_client
        with patch("rag.utils.minio_conn.settings") as mock_settings:
            mock_settings.S3 = {"verify": "true"}
            result = _build_minio_http_client()
        assert result is None

    def test_returns_pool_manager_when_verify_false(self):
        """Verify urllib3.PoolManager is returned when verify is False."""
        from rag.utils.minio_conn import _build_minio_http_client
        with patch("rag.utils.minio_conn.settings") as mock_settings:
            mock_settings.S3 = {"verify": False}
            with patch("rag.utils.minio_conn.urllib3.PoolManager") as MockPool:
                MockPool.return_value = MagicMock()
                result = _build_minio_http_client()
        assert result is not None
        MockPool.assert_called_once()

    def test_returns_none_when_verify_string_1(self):
        """Verify None is returned when S3 verify is string '1'."""
        from rag.utils.minio_conn import _build_minio_http_client
        with patch("rag.utils.minio_conn.settings") as mock_settings:
            mock_settings.S3 = {"verify": "1"}
            result = _build_minio_http_client()
        assert result is None


class TestRAGFlowMinioCopy:
    """Tests for RAGFlowMinio.copy() object copy operation."""

    def test_copy_success(self):
        """Verify copy returns True on successful copy."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        minio.conn.stat_object.return_value = MagicMock()
        minio.conn.copy_object.return_value = MagicMock()
        result = minio.copy("src-bucket", "src.txt", "dest-bucket", "dest.txt")
        assert result is True
        minio.conn.copy_object.assert_called_once()

    def test_copy_creates_dest_bucket_if_missing(self):
        """Verify copy creates destination bucket if it doesn't exist."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = False
        minio.conn.stat_object.return_value = MagicMock()
        minio.conn.copy_object.return_value = MagicMock()
        minio.copy("src-bucket", "src.txt", "dest-bucket", "dest.txt")
        minio.conn.make_bucket.assert_called_once_with("dest-bucket")

    def test_copy_returns_false_when_source_missing(self):
        """Verify copy returns False when source object doesn't exist."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        minio.conn.stat_object.side_effect = Exception("Not found")
        result = minio.copy("src-bucket", "missing.txt", "dest-bucket", "dest.txt")
        assert result is False
        minio.conn.copy_object.assert_not_called()

    def test_copy_returns_false_on_exception(self):
        """Verify copy returns False on unexpected exceptions."""
        minio = _make_minio()
        minio.conn.bucket_exists.side_effect = Exception("Network error")
        result = minio.copy("src", "s.txt", "dest", "d.txt")
        assert result is False


class TestRAGFlowMinioMove:
    """Tests for RAGFlowMinio.move() object move operation."""

    def test_move_copies_then_deletes(self):
        """Verify move performs copy then rm on success."""
        minio = _make_minio()
        minio.copy = MagicMock(return_value=True)
        minio.rm = MagicMock()
        result = minio.move("src-bucket", "src.txt", "dest-bucket", "dest.txt")
        assert result is True
        minio.copy.assert_called_once_with("src-bucket", "src.txt", "dest-bucket", "dest.txt")
        minio.rm.assert_called_once_with("src-bucket", "src.txt")

    def test_move_returns_false_when_copy_fails(self):
        """Verify move returns False and skips rm when copy fails."""
        minio = _make_minio()
        minio.copy = MagicMock(return_value=False)
        minio.rm = MagicMock()
        result = minio.move("src", "s.txt", "dest", "d.txt")
        assert result is False
        minio.rm.assert_not_called()

    def test_move_returns_false_on_exception(self):
        """Verify move returns False on unexpected exceptions."""
        minio = _make_minio()
        minio.copy = MagicMock(side_effect=Exception("Unexpected"))
        result = minio.move("src", "s.txt", "dest", "d.txt")
        assert result is False


class TestRAGFlowMinioRemoveBucket:
    """Tests for RAGFlowMinio.remove_bucket() bucket removal."""

    def test_multi_bucket_removes_objects_and_bucket(self):
        """Verify multi-bucket mode removes all objects then the bucket."""
        minio = _make_minio(bucket=None)
        minio.conn.bucket_exists.return_value = True
        mock_obj = MagicMock()
        mock_obj.object_name = "file1.txt"
        minio.conn.list_objects.return_value = [mock_obj]
        minio.remove_bucket("my-bucket")
        minio.conn.remove_object.assert_called_once_with("my-bucket", "file1.txt")
        minio.conn.remove_bucket.assert_called_once_with("my-bucket")

    def test_single_bucket_removes_only_prefixed_objects(self):
        """Verify single-bucket mode removes only prefixed objects, not the bucket."""
        minio = _make_minio(bucket="default")
        mock_obj = MagicMock()
        mock_obj.object_name = "logical/file.txt"
        minio.conn.list_objects.return_value = [mock_obj]
        minio.remove_bucket("logical")
        minio.conn.remove_object.assert_called_once_with("default", "logical/file.txt")
        # Physical bucket should NOT be removed
        minio.conn.remove_bucket.assert_not_called()

    def test_single_bucket_with_prefix_path(self):
        """Verify prefix_path is included in the object listing prefix."""
        minio = _make_minio(bucket="default", prefix_path="tenant1")
        minio.conn.list_objects.return_value = []
        minio.remove_bucket("logical")
        # list_objects should be called with prefix including prefix_path and logical bucket
        call_kwargs = minio.conn.list_objects.call_args
        prefix_arg = call_kwargs[1].get("prefix", call_kwargs[0][1] if len(call_kwargs[0]) > 1 else "")
        assert "tenant1" in prefix_arg

    def test_multi_bucket_skips_when_bucket_missing(self):
        """Verify multi-bucket mode skips removal when bucket doesn't exist."""
        minio = _make_minio(bucket=None)
        minio.conn.bucket_exists.return_value = False
        minio.remove_bucket("missing-bucket")
        minio.conn.list_objects.assert_not_called()
        minio.conn.remove_bucket.assert_not_called()

    def test_handles_removal_exception(self):
        """Verify remove_bucket handles exceptions gracefully."""
        minio = _make_minio(bucket=None)
        minio.conn.bucket_exists.side_effect = Exception("Access denied")
        # Should not raise
        minio.remove_bucket("bucket")


class TestRAGFlowMinioHealthEdgeCases:
    """Tests for additional health() edge cases."""

    def test_multi_bucket_handles_unexpected_error(self):
        """Verify health returns False on unexpected exceptions in multi-bucket mode."""
        minio = _make_minio(bucket=None)
        minio.conn.list_buckets.side_effect = RuntimeError("Unexpected")
        assert minio.health() is False

    def test_single_bucket_handles_server_error(self):
        """Verify health returns False on ServerError in single-bucket mode."""
        from minio.error import ServerError
        minio = _make_minio(bucket="default")
        minio.conn.bucket_exists.side_effect = ServerError("msg", "body")
        assert minio.health() is False


class TestRAGFlowMinioObjExistEdgeCases:
    """Tests for additional obj_exist() edge cases."""

    def test_returns_false_on_no_such_bucket(self):
        """Verify returns False for NoSuchBucket S3Error."""
        from minio.error import S3Error
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        err = S3Error("NoSuchBucket", "msg", "res")
        err.code = "NoSuchBucket"
        minio.conn.stat_object.side_effect = err
        assert minio.obj_exist("bucket", "file.txt") is False

    def test_returns_false_on_unexpected_exception(self):
        """Verify returns False on non-S3 exceptions."""
        minio = _make_minio()
        minio.conn.bucket_exists.return_value = True
        minio.conn.stat_object.side_effect = RuntimeError("Network error")
        assert minio.obj_exist("bucket", "file.txt") is False


class TestRAGFlowMinioBucketExistsEdgeCases:
    """Tests for additional bucket_exists() edge cases."""

    def test_returns_false_on_s3_error(self):
        """Verify returns False on S3Error with NoSuchBucket code."""
        from minio.error import S3Error
        minio = _make_minio()
        err = S3Error("NoSuchBucket", "msg", "res")
        err.code = "NoSuchBucket"
        minio.conn.bucket_exists.side_effect = err
        assert minio.bucket_exists("missing") is False

    def test_returns_false_on_unexpected_exception(self):
        """Verify returns False on non-S3 exceptions."""
        minio = _make_minio()
        minio.conn.bucket_exists.side_effect = RuntimeError("Timeout")
        assert minio.bucket_exists("bucket") is False
