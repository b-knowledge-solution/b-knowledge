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
"""Azure Data Lake Storage connector using Service Principal (SPN) authentication.

Provides a singleton storage client for Azure Data Lake Storage Gen2,
authenticating via Azure AD client credentials (tenant ID, client ID,
client secret). Implements the standard storage interface used by the
RAG pipeline storage factory.
"""

import logging
import os
import time
from common.decorator import singleton
from azure.identity import ClientSecretCredential, AzureAuthorityHosts
from azure.storage.filedatalake import FileSystemClient
from common import settings


@singleton
class RAGFlowAzureSpnBlob:
    """Azure Data Lake Storage Gen2 client authenticated via Service Principal.

    Uses Azure AD client credentials to obtain tokens for accessing
    Azure Data Lake file systems. Targets the Azure China authority
    by default.

    Attributes:
        conn: The Azure FileSystemClient instance.
        account_url: Azure storage account URL.
        client_id: Azure AD application (client) ID.
        secret: Azure AD client secret.
        tenant_id: Azure AD tenant ID.
        container_name: Name of the Data Lake file system (container).
    """

    def __init__(self):
        self.conn = None
        self.account_url = os.getenv('ACCOUNT_URL', settings.AZURE["account_url"])
        self.client_id = os.getenv('CLIENT_ID', settings.AZURE["client_id"])
        self.secret = os.getenv('SECRET', settings.AZURE["secret"])
        self.tenant_id = os.getenv('TENANT_ID', settings.AZURE["tenant_id"])
        self.container_name = os.getenv('CONTAINER_NAME', settings.AZURE["container_name"])
        self.__open__()

    def __open__(self):
        """Establish a connection to Azure Data Lake using client credentials.

        Creates a ClientSecretCredential for Azure China authority and
        initializes a FileSystemClient for the configured container.
        """
        try:
            if self.conn:
                self.__close__()
        except Exception:
            pass

        try:
            # Authenticate using Azure AD service principal credentials
            credentials = ClientSecretCredential(tenant_id=self.tenant_id, client_id=self.client_id,
                                                 client_secret=self.secret, authority=AzureAuthorityHosts.AZURE_CHINA)
            self.conn = FileSystemClient(account_url=self.account_url, file_system_name=self.container_name,
                                         credential=credentials)
        except Exception:
            logging.exception("Fail to connect %s" % self.account_url)

    def __close__(self):
        """Release the current Data Lake connection."""
        del self.conn
        self.conn = None

    def health(self):
        """Verify connectivity by creating and flushing a small test file.

        Returns:
            Flush result if healthy, or raises on failure.
        """
        _bucket, fnm, binary = "txtxtxtxt1", "txtxtxtxt1", b"_t@@@1"
        f = self.conn.create_file(fnm)
        f.append_data(binary, offset=0, length=len(binary))
        return f.flush_data(len(binary))

    def put(self, bucket, fnm, binary):
        """Upload binary data as a file to the Data Lake.

        Creates the file, appends data, and flushes it. Retries up to 3 times.

        Args:
            bucket: Logical bucket name (unused, kept for interface compatibility).
            fnm: File path / name in the Data Lake.
            binary: Raw bytes to upload.

        Returns:
            Flush result on success, or None after exhausting retries.
        """
        for _ in range(3):
            try:
                f = self.conn.create_file(fnm)
                f.append_data(binary, offset=0, length=len(binary))
                return f.flush_data(len(binary))
            except Exception:
                logging.exception(f"Fail put {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
                return None
        return None

    def rm(self, bucket, fnm):
        """Delete a file from the Data Lake.

        Args:
            bucket: Logical bucket name (unused, kept for interface compatibility).
            fnm: File path to delete.
        """
        try:
            self.conn.delete_file(fnm)
        except Exception:
            logging.exception(f"Fail rm {bucket}/{fnm}")

    def get(self, bucket, fnm):
        """Download a file's content as bytes from the Data Lake.

        Args:
            bucket: Logical bucket name (unused, kept for interface compatibility).
            fnm: File path to download.

        Returns:
            Raw bytes of the file content, or None on failure.
        """
        for _ in range(1):
            try:
                client = self.conn.get_file_client(fnm)
                r = client.download_file()
                return r.read()
            except Exception:
                logging.exception(f"fail get {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
        return None

    def obj_exist(self, bucket, fnm):
        """Check whether a file exists in the Data Lake.

        Args:
            bucket: Logical bucket name (unused, kept for interface compatibility).
            fnm: File path to check.

        Returns:
            True if the file exists, False otherwise.
        """
        try:
            client = self.conn.get_file_client(fnm)
            return client.exists()
        except Exception:
            logging.exception(f"Fail put {bucket}/{fnm}")
        return False

    def get_presigned_url(self, bucket, fnm, expires):
        """Generate a presigned URL for temporary file access.

        Retries up to 10 times on failure.

        Args:
            bucket: Bucket name.
            fnm: File path.
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
        return None
