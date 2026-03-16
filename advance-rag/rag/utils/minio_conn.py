#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""MinIO / S3-compatible object storage connector.

Primary storage backend for the RAG pipeline, used by default with
RustFS in development. Supports two operating modes:

- **Multi-bucket mode**: Each logical bucket maps to a physical MinIO bucket.
- **Single-bucket mode**: All objects are stored in one physical bucket
  with logical bucket names used as key prefixes.

The use_default_bucket and use_prefix_path decorators transparently
handle path rewriting so callers always use the same interface.
"""

import logging
import ssl
import time
from minio import Minio
from minio.commonconfig import CopySource
from minio.error import S3Error, ServerError, InvalidResponseError
from io import BytesIO
import urllib3
from common.decorator import singleton
from common import settings


def _build_minio_http_client():
    """
    Build an optional urllib3 HTTP client for MinIO when using SSL/TLS.
    Respects S3.verify (default True) to allow self-signed certificates
    when set to False.
    """
    verify = settings.S3.get("verify", True)
    if verify is True or verify == "true" or verify == "1":
        return None
    return urllib3.PoolManager(cert_reqs=ssl.CERT_NONE)


@singleton
class RAGFlowMinio:
    """MinIO client implementing the unified storage interface.

    Supports single-bucket and multi-bucket modes via decorator-based
    path rewriting. Handles SSL, self-signed certificates, and
    automatic reconnection on failures.

    Attributes:
        conn: The Minio client instance.
        bucket: Default physical bucket name (None for multi-bucket mode).
        prefix_path: Optional path prefix prepended to all object keys.
    """

    def __init__(self):
        self.conn = None
        # Use `or None` to convert empty strings to None, ensuring single-bucket
        # mode is truly disabled when not configured
        self.bucket = settings.S3.get('bucket', None) or None
        self.prefix_path = settings.S3.get('prefix_path', None) or None
        self.__open__()

    @staticmethod
    def use_default_bucket(method):
        """Decorator that redirects the bucket argument to the default physical bucket.

        When single-bucket mode is active, replaces the caller's bucket
        argument with the configured default bucket and passes the
        original bucket name forward as _orig_bucket for path construction.

        Args:
            method: The decorated method.

        Returns:
            Wrapped method with bucket redirection.
        """
        def wrapper(self, bucket, *args, **kwargs):
            # If there is a default bucket, use the default bucket
            # but preserve the original bucket identifier so it can be
            # used as a path prefix inside the physical/default bucket.
            original_bucket = bucket
            actual_bucket = self.bucket if self.bucket else bucket
            if self.bucket:
                # pass original identifier forward for use by other decorators
                kwargs['_orig_bucket'] = original_bucket
            return method(self, actual_bucket, *args, **kwargs)

        return wrapper

    @staticmethod
    def use_prefix_path(method):
        """Decorator that prepends prefix_path and original bucket to the file name.

        Constructs the full object key path based on the configured
        prefix_path and whether single-bucket mode is active.

        Args:
            method: The decorated method.

        Returns:
            Wrapped method with path prefix prepended to fnm.
        """
        def wrapper(self, bucket, fnm, *args, **kwargs):
            # If a default MINIO bucket is configured, the use_default_bucket
            # decorator will have replaced the `bucket` arg with the physical
            # bucket name and forwarded the original identifier as `_orig_bucket`.
            # Prefer that original identifier when constructing the key path so
            # objects are stored under <physical-bucket>/<identifier>/...
            orig_bucket = kwargs.pop('_orig_bucket', None)

            if self.prefix_path:
                # If a prefix_path is configured, include it and then the identifier
                if orig_bucket:
                    fnm = f"{self.prefix_path}/{orig_bucket}/{fnm}"
                else:
                    fnm = f"{self.prefix_path}/{fnm}"
            else:
                # No prefix_path configured. If orig_bucket exists and the
                # physical bucket equals configured default, use orig_bucket as a path.
                if orig_bucket and bucket == self.bucket:
                    fnm = f"{orig_bucket}/{fnm}"

            return method(self, bucket, fnm, *args, **kwargs)

        return wrapper

    def __open__(self):
        """Establish a connection to MinIO using settings from the S3 config section."""
        try:
            if self.conn:
                self.__close__()
        except Exception:
            pass

        try:
            # Parse the secure flag from string or boolean config values
            secure = settings.S3.get("secure", False)
            if isinstance(secure, str):
                secure = secure.lower() in ("true", "1", "yes")
            http_client = _build_minio_http_client()
            self.conn = Minio(
                settings.S3["host"],
                access_key=settings.S3["user"],
                secret_key=settings.S3["password"],
                secure=secure,
                http_client=http_client,
            )
        except Exception:
            logging.exception(
                "Fail to connect %s " % settings.S3["host"])

    def __close__(self):
        """Release the MinIO client connection."""
        del self.conn
        self.conn = None

    def health(self):
        """
        Check MinIO service availability.

        Returns:
            True if the service is reachable, False otherwise.
        """
        try:
            if self.bucket:
                # Single-bucket mode: check bucket exists only (no side effects)
                exists = self.conn.bucket_exists(self.bucket)

                # Historical:
                # - Previously wrote "_health_check" to verify write permissions
                # - Previously auto-created bucket if missing

                return exists
            else:
                # Multi-bucket mode: verify MinIO service connectivity
                self.conn.list_buckets()
                return True
        except (S3Error, ServerError, InvalidResponseError):
            return False
        except Exception as e:
            logging.warning(f"Unexpected error in MinIO health check: {e}")
            return False

    @use_default_bucket
    @use_prefix_path
    def put(self, bucket, fnm, binary, tenant_id=None):
        """Upload binary data to MinIO. Retries up to 3 times.

        Args:
            bucket: Bucket name (may be rewritten by decorators).
            fnm: Object key (may be rewritten by decorators).
            binary: Raw bytes to upload.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            MinIO put_object result on success, or None after retries.
        """
        for _ in range(3):
            try:
                # Note: bucket must already exist - we don't have permission to create buckets
                if not self.bucket and not self.conn.bucket_exists(bucket):
                    self.conn.make_bucket(bucket)

                r = self.conn.put_object(bucket, fnm,
                                         BytesIO(binary),
                                         len(binary)
                                         )
                return r
            except Exception:
                logging.exception(f"Fail to put {bucket}/{fnm}:")
                self.__open__()
                time.sleep(1)

    @use_default_bucket
    @use_prefix_path
    def rm(self, bucket, fnm, tenant_id=None):
        """Delete an object from MinIO.

        Args:
            bucket: Bucket name (may be rewritten by decorators).
            fnm: Object key (may be rewritten by decorators).
            tenant_id: Tenant ID (unused, kept for interface compatibility).
        """
        try:
            self.conn.remove_object(bucket, fnm)
        except Exception:
            logging.exception(f"Fail to remove {bucket}/{fnm}:")

    @use_default_bucket
    @use_prefix_path
    def get(self, bucket, filename, tenant_id=None):
        """Download an object's content as bytes from MinIO.

        Args:
            bucket: Bucket name (may be rewritten by decorators).
            filename: Object key (may be rewritten by decorators).
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Raw bytes of the object, or None on failure.
        """
        for _ in range(1):
            try:
                r = self.conn.get_object(bucket, filename)
                return r.read()
            except Exception:
                logging.exception(f"Fail to get {bucket}/{filename}")
                self.__open__()
                time.sleep(1)
        return

    @use_default_bucket
    @use_prefix_path
    def obj_exist(self, bucket, filename, tenant_id=None):
        """Check whether an object exists in MinIO.

        Args:
            bucket: Bucket name (may be rewritten by decorators).
            filename: Object key (may be rewritten by decorators).
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            True if the object exists, False otherwise.
        """
        try:
            if not self.conn.bucket_exists(bucket):
                return False
            if self.conn.stat_object(bucket, filename):
                return True
            else:
                return False
        except S3Error as e:
            if e.code in ["NoSuchKey", "NoSuchBucket", "ResourceNotFound"]:
                return False
        except Exception:
            logging.exception(f"obj_exist {bucket}/{filename} got exception")
            return False

    @use_default_bucket
    def bucket_exists(self, bucket):
        """Check whether a bucket exists in MinIO.

        Args:
            bucket: Bucket name to check (may be rewritten by decorator).

        Returns:
            True if the bucket exists, False otherwise.
        """
        try:
            if not self.conn.bucket_exists(bucket):
                return False
            else:
                return True
        except S3Error as e:
            if e.code in ["NoSuchKey", "NoSuchBucket", "ResourceNotFound"]:
                return False
        except Exception:
            logging.exception(f"bucket_exist {bucket} got exception")
            return False

    @use_default_bucket
    @use_prefix_path
    def get_presigned_url(self, bucket, fnm, expires, tenant_id=None):
        """Generate a presigned URL for temporary object access.

        Retries up to 10 times on failure.

        Args:
            bucket: Bucket name (may be rewritten by decorators).
            fnm: Object key (may be rewritten by decorators).
            expires: Expiration time for the URL.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Presigned URL string, or None after exhausting retries.
        """
        for _ in range(10):
            try:
                return self.conn.get_presigned_url("GET", bucket, fnm, expires)
            except Exception:
                logging.exception(f"Fail to get_presigned {bucket}/{fnm}:")
                self.__open__()
                time.sleep(1)
        return

    @use_default_bucket
    def remove_bucket(self, bucket, **kwargs):
        """Remove all objects in a bucket (or prefix) and optionally the bucket itself.

        In single-bucket mode, only removes objects matching the logical prefix.
        In multi-bucket mode, removes all objects and the physical bucket.

        Args:
            bucket: Bucket name (may be rewritten by decorator).
            **kwargs: May contain _orig_bucket from the decorator chain.
        """
        orig_bucket = kwargs.pop('_orig_bucket', None)
        try:
            if self.bucket:
                # Single bucket mode: remove objects with prefix
                prefix = ""
                if self.prefix_path:
                    prefix = f"{self.prefix_path}/"
                if orig_bucket:
                    prefix += f"{orig_bucket}/"

                # List objects with prefix
                objects_to_delete = self.conn.list_objects(bucket, prefix=prefix, recursive=True)
                for obj in objects_to_delete:
                    self.conn.remove_object(bucket, obj.object_name)
                # Do NOT remove the physical bucket
            else:
                if self.conn.bucket_exists(bucket):
                    objects_to_delete = self.conn.list_objects(bucket, recursive=True)
                    for obj in objects_to_delete:
                        self.conn.remove_object(bucket, obj.object_name)
                    self.conn.remove_bucket(bucket)
        except Exception:
            logging.exception(f"Fail to remove bucket {bucket}")

    def _resolve_bucket_and_path(self, bucket, fnm):
        """Resolve the physical bucket and full object key path.

        Used by copy/move operations that need to resolve paths without
        going through the decorator chain.

        Args:
            bucket: Logical bucket name.
            fnm: Object key.

        Returns:
            Tuple of (physical_bucket, full_object_key).
        """
        if self.bucket:
            if self.prefix_path:
                fnm = f"{self.prefix_path}/{bucket}/{fnm}"
            else:
                fnm = f"{bucket}/{fnm}"
            bucket = self.bucket
        elif self.prefix_path:
            fnm = f"{self.prefix_path}/{fnm}"
        return bucket, fnm

    def copy(self, src_bucket, src_path, dest_bucket, dest_path):
        """Copy an object within or across buckets.

        Args:
            src_bucket: Source logical bucket.
            src_path: Source object key.
            dest_bucket: Destination logical bucket.
            dest_path: Destination object key.

        Returns:
            True on success, False on failure.
        """
        try:
            src_bucket, src_path = self._resolve_bucket_and_path(src_bucket, src_path)
            dest_bucket, dest_path = self._resolve_bucket_and_path(dest_bucket, dest_path)

            if not self.conn.bucket_exists(dest_bucket):
                self.conn.make_bucket(dest_bucket)

            # Verify source exists before copying
            try:
                self.conn.stat_object(src_bucket, src_path)
            except Exception as e:
                logging.exception(f"Source object not found: {src_bucket}/{src_path}, {e}")
                return False

            self.conn.copy_object(
                dest_bucket,
                dest_path,
                CopySource(src_bucket, src_path),
            )
            return True

        except Exception:
            logging.exception(f"Fail to copy {src_bucket}/{src_path} -> {dest_bucket}/{dest_path}")
            return False

    def move(self, src_bucket, src_path, dest_bucket, dest_path):
        """Move an object by copying then deleting the source.

        Args:
            src_bucket: Source logical bucket.
            src_path: Source object key.
            dest_bucket: Destination logical bucket.
            dest_path: Destination object key.

        Returns:
            True on success, False on failure.
        """
        try:
            if self.copy(src_bucket, src_path, dest_bucket, dest_path):
                self.rm(src_bucket, src_path)
                return True
            else:
                logging.error(f"Copy failed, move aborted: {src_bucket}/{src_path}")
                return False
        except Exception:
            logging.exception(f"Fail to move {src_bucket}/{src_path} -> {dest_bucket}/{dest_path}")
            return False
