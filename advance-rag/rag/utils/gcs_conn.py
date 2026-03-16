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
"""Google Cloud Storage (GCS) connector for the RAG pipeline.

Provides a singleton storage client for GCS, implementing the standard
storage interface (put, get, rm, obj_exist, health, copy, move).
Uses a single physical GCS bucket with virtual folder prefixes to
emulate the multi-bucket interface expected by the storage factory.
"""

import logging
import time
import datetime
from io import BytesIO
from google.cloud import storage
from google.api_core.exceptions import NotFound
from common.decorator import singleton
from common import settings


@singleton
class RAGFlowGCS:
    """Google Cloud Storage client implementing the unified storage interface.

    All objects are stored in a single GCS bucket, with the logical
    'bucket' parameter used as a folder prefix within that bucket.

    Attributes:
        client: google.cloud.storage.Client instance.
        bucket_name: Name of the physical GCS bucket.
    """

    def __init__(self):
        self.client = None
        self.bucket_name = None
        self.__open__()

    def __open__(self):
        """Initialize the GCS client and read the bucket name from settings."""
        try:
            if self.client:
                self.client = None
        except Exception:
            pass

        try:
            self.client = storage.Client()
            self.bucket_name = settings.GCS["bucket"]
        except Exception:
            logging.exception("Fail to connect to GCS")

    def _get_blob_path(self, folder, filename):
        """Construct the full blob path by joining folder and filename.

        Args:
            folder: Logical folder (virtual bucket) prefix.
            filename: Object name within the folder.

        Returns:
            Combined path string, e.g. "folder/filename".
        """
        if not folder:
            return filename
        return f"{folder}/{filename}"

    def health(self):
        """Verify GCS connectivity by uploading a small test blob.

        Returns:
            True if the health check upload succeeds, False otherwise.
        """
        folder, fnm, binary = "ragflow-health", "health_check", b"_t@@@1"
        try:
            bucket_obj = self.client.bucket(self.bucket_name)
            if not bucket_obj.exists():
                logging.error(f"Health check failed: Main bucket '{self.bucket_name}' does not exist.")
                return False

            blob_path = self._get_blob_path(folder, fnm)
            blob = bucket_obj.blob(blob_path)
            blob.upload_from_file(BytesIO(binary), content_type='application/octet-stream')
            return True
        except Exception as e:
            logging.exception(f"Health check failed: {e}")
            return False

    def put(self, bucket, fnm, binary, tenant_id=None):
        """Upload binary data to GCS.

        Retries up to 3 times on transient failures, reconnecting between attempts.

        Args:
            bucket: Logical folder prefix within the GCS bucket.
            fnm: Object name.
            binary: Raw bytes to upload.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            True on success, False on failure.
        """
        # RENAMED PARAMETER: bucket_name -> bucket (to match interface)
        for _ in range(3):
            try:
                bucket_obj = self.client.bucket(self.bucket_name)
                blob_path = self._get_blob_path(bucket, fnm)
                blob = bucket_obj.blob(blob_path)

                blob.upload_from_file(BytesIO(binary), content_type='application/octet-stream')
                return True
            except NotFound:
                logging.error(f"Fail to put: Main bucket {self.bucket_name} does not exist.")
                return False
            except Exception:
                logging.exception(f"Fail to put {bucket}/{fnm}:")
                self.__open__()
                time.sleep(1)
        return False

    def rm(self, bucket, fnm, tenant_id=None):
        """Delete a blob from GCS.

        Args:
            bucket: Logical folder prefix.
            fnm: Object name to delete.
            tenant_id: Tenant ID (unused, kept for interface compatibility).
        """
        # RENAMED PARAMETER: bucket_name -> bucket
        try:
            bucket_obj = self.client.bucket(self.bucket_name)
            blob_path = self._get_blob_path(bucket, fnm)
            blob = bucket_obj.blob(blob_path)
            blob.delete()
        except NotFound:
            pass
        except Exception:
            logging.exception(f"Fail to remove {bucket}/{fnm}:")

    def get(self, bucket, filename, tenant_id=None):
        """Download a blob's content as bytes from GCS.

        Args:
            bucket: Logical folder prefix.
            filename: Object name to download.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Raw bytes of the blob, or None on failure.
        """
        # RENAMED PARAMETER: bucket_name -> bucket
        for _ in range(1):
            try:
                bucket_obj = self.client.bucket(self.bucket_name)
                blob_path = self._get_blob_path(bucket, filename)
                blob = bucket_obj.blob(blob_path)
                return blob.download_as_bytes()
            except NotFound:
                logging.warning(f"File not found {bucket}/{filename} in {self.bucket_name}")
                return None
            except Exception:
                logging.exception(f"Fail to get {bucket}/{filename}")
                self.__open__()
                time.sleep(1)
        return None

    def obj_exist(self, bucket, filename, tenant_id=None):
        """Check whether a blob exists in GCS.

        Args:
            bucket: Logical folder prefix.
            filename: Object name to check.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            True if the blob exists, False otherwise.
        """
        # RENAMED PARAMETER: bucket_name -> bucket
        try:
            bucket_obj = self.client.bucket(self.bucket_name)
            blob_path = self._get_blob_path(bucket, filename)
            blob = bucket_obj.blob(blob_path)
            return blob.exists()
        except Exception:
            logging.exception(f"obj_exist {bucket}/{filename} got exception")
            return False

    def bucket_exists(self, bucket):
        """Check whether the physical GCS bucket exists.

        Args:
            bucket: Logical folder prefix (ignored; checks the physical bucket).

        Returns:
            True if the physical bucket exists, False otherwise.
        """
        # RENAMED PARAMETER: bucket_name -> bucket
        try:
            bucket_obj = self.client.bucket(self.bucket_name)
            return bucket_obj.exists()
        except Exception:
            logging.exception(f"bucket_exist check for {self.bucket_name} got exception")
            return False

    def get_presigned_url(self, bucket, fnm, expires, tenant_id=None):
        """Generate a signed URL for temporary read access to a blob.

        Retries up to 10 times on failure.

        Args:
            bucket: Logical folder prefix.
            fnm: Object name.
            expires: Expiration as int (seconds) or timedelta.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Signed URL string, or None after exhausting retries.
        """
        # RENAMED PARAMETER: bucket_name -> bucket
        for _ in range(10):
            try:
                bucket_obj = self.client.bucket(self.bucket_name)
                blob_path = self._get_blob_path(bucket, fnm)
                blob = bucket_obj.blob(blob_path)

                # Convert integer seconds to timedelta if needed
                expiration = expires
                if isinstance(expires, int):
                    expiration = datetime.timedelta(seconds=expires)

                url = blob.generate_signed_url(
                    version="v4",
                    expiration=expiration,
                    method="GET"
                )
                return url
            except Exception:
                logging.exception(f"Fail to get_presigned {bucket}/{fnm}:")
                self.__open__()
                time.sleep(1)
        return None

    def remove_bucket(self, bucket):
        """Remove all blobs under a logical folder prefix.

        Does not delete the physical GCS bucket itself, only the blobs
        matching the folder prefix.

        Args:
            bucket: Logical folder prefix to clear.
        """
        # RENAMED PARAMETER: bucket_name -> bucket
        try:
            bucket_obj = self.client.bucket(self.bucket_name)
            prefix = f"{bucket}/"

            blobs = list(self.client.list_blobs(self.bucket_name, prefix=prefix))

            if blobs:
                bucket_obj.delete_blobs(blobs)
        except Exception:
            logging.exception(f"Fail to remove virtual bucket (folder) {bucket}")

    def copy(self, src_bucket, src_path, dest_bucket, dest_path):
        """Copy a blob within the GCS bucket.

        Args:
            src_bucket: Source logical folder prefix.
            src_path: Source object name.
            dest_bucket: Destination logical folder prefix.
            dest_path: Destination object name.

        Returns:
            True on success, False on failure.
        """
        # RENAMED PARAMETERS to match original interface
        try:
            bucket_obj = self.client.bucket(self.bucket_name)

            src_blob_path = self._get_blob_path(src_bucket, src_path)
            dest_blob_path = self._get_blob_path(dest_bucket, dest_path)

            src_blob = bucket_obj.blob(src_blob_path)

            if not src_blob.exists():
                logging.error(f"Source object not found: {src_blob_path}")
                return False

            bucket_obj.copy_blob(src_blob, bucket_obj, dest_blob_path)
            return True

        except NotFound:
            logging.error(f"Copy failed: Main bucket {self.bucket_name} does not exist.")
            return False
        except Exception:
            logging.exception(f"Fail to copy {src_bucket}/{src_path} -> {dest_bucket}/{dest_path}")
            return False

    def move(self, src_bucket, src_path, dest_bucket, dest_path):
        """Move a blob by copying then deleting the source.

        Args:
            src_bucket: Source logical folder prefix.
            src_path: Source object name.
            dest_bucket: Destination logical folder prefix.
            dest_path: Destination object name.

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
