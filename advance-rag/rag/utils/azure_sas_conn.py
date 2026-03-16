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
"""Azure Blob Storage connector using SAS (Shared Access Signature) token authentication.

Provides a singleton storage client for Azure Blob Storage, implementing
the standard storage interface (put, get, rm, obj_exist, health) used
throughout the RAG pipeline for document and image persistence.
"""

import logging
import os
import time
from io import BytesIO
from common.decorator import singleton
from azure.storage.blob import ContainerClient
from common import settings


@singleton
class RAGFlowAzureSasBlob:
    """Azure Blob Storage client authenticated via SAS token.

    Implements the unified storage interface expected by the storage factory.
    Uses a container-level SAS token to authenticate all blob operations.

    Attributes:
        conn: The Azure ContainerClient instance.
        container_url: URL of the Azure Blob container.
        sas_token: SAS token for authenticating requests.
    """

    def __init__(self):
        self.conn = None
        self.container_url = os.getenv('CONTAINER_URL', settings.AZURE["container_url"])
        self.sas_token = os.getenv('SAS_TOKEN', settings.AZURE["sas_token"])
        self.__open__()

    def __open__(self):
        """Establish a connection to the Azure Blob container.

        Closes any existing connection before creating a new one
        using the container URL and SAS token.
        """
        try:
            if self.conn:
                self.__close__()
        except Exception:
            pass

        try:
            self.conn = ContainerClient.from_container_url(self.container_url + "?" + self.sas_token)
        except Exception:
            logging.exception("Fail to connect %s " % self.container_url)

    def __close__(self):
        """Release the current Azure Blob connection."""
        del self.conn
        self.conn = None

    def health(self):
        """Verify connectivity by uploading a small test blob.

        Returns:
            Upload result object if healthy, or raises on failure.
        """
        _bucket, fnm, binary = "txtxtxtxt1", "txtxtxtxt1", b"_t@@@1"
        return self.conn.upload_blob(name=fnm, data=BytesIO(binary), length=len(binary))

    def put(self, bucket, fnm, binary):
        """Upload binary data as a blob to the container.

        Retries up to 3 times on failure, reconnecting between attempts.

        Args:
            bucket: Logical bucket name (unused for Azure SAS, kept for interface compatibility).
            fnm: Blob name / object key.
            binary: Raw bytes to upload.

        Returns:
            Upload result object on success, or None after exhausting retries.
        """
        for _ in range(3):
            try:
                return self.conn.upload_blob(name=fnm, data=BytesIO(binary), length=len(binary))
            except Exception:
                logging.exception(f"Fail put {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)

    def rm(self, bucket, fnm):
        """Delete a blob from the container.

        Args:
            bucket: Logical bucket name (unused, kept for interface compatibility).
            fnm: Blob name to delete.
        """
        try:
            self.conn.delete_blob(fnm)
        except Exception:
            logging.exception(f"Fail rm {bucket}/{fnm}")

    def get(self, bucket, fnm):
        """Download a blob's content as bytes.

        Args:
            bucket: Logical bucket name (unused, kept for interface compatibility).
            fnm: Blob name to download.

        Returns:
            Raw bytes of the blob content, or None on failure.
        """
        for _ in range(1):
            try:
                r = self.conn.download_blob(fnm)
                return r.read()
            except Exception:
                logging.exception(f"fail get {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
        return

    def obj_exist(self, bucket, fnm):
        """Check whether a blob exists in the container.

        Args:
            bucket: Logical bucket name (unused, kept for interface compatibility).
            fnm: Blob name to check.

        Returns:
            True if the blob exists, False otherwise.
        """
        try:
            return self.conn.get_blob_client(fnm).exists()
        except Exception:
            logging.exception(f"Fail put {bucket}/{fnm}")
        return False

    def get_presigned_url(self, bucket, fnm, expires):
        """Generate a presigned URL for temporary blob access.

        Retries up to 10 times on failure, reconnecting between attempts.

        Args:
            bucket: Bucket name.
            fnm: Blob name.
            expires: Expiration time for the URL.

        Returns:
            Presigned URL string, or None after exhausting retries.
        """
        for _ in range(10):
            try:
                return self.conn.get_presigned_url("GET", bucket, fnm, expires)
            except Exception:
                logging.exception(f"fail get {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
        return
