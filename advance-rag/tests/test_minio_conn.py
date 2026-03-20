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
