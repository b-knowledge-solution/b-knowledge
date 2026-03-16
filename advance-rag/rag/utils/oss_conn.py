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
"""Alibaba Cloud OSS (Object Storage Service) connector via the S3-compatible API.

Provides a singleton storage client for Alibaba Cloud OSS using the
boto3 S3 client with Alibaba-compatible endpoints. Supports optional
default bucket and prefix path modes via decorators, similar to the
MinIO connector.
"""

import logging
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
import time
from io import BytesIO
from common.decorator import singleton
from common import settings


@singleton
class RAGFlowOSS:
    """Alibaba Cloud OSS client using the S3-compatible boto3 API.

    Connects to OSS via a configurable endpoint URL and region.
    Supports single-bucket mode with prefix paths for key namespacing.

    Attributes:
        conn: boto3 S3 client instance.
        oss_config: OSS configuration dict from settings.
        access_key: OSS access key ID.
        secret_key: OSS secret access key.
        endpoint_url: OSS endpoint URL.
        region: OSS region name.
        bucket: Default bucket name (None for multi-bucket mode).
        prefix_path: Optional key prefix for all operations.
        signature_version: S3 signature version override.
        addressing_style: S3 addressing style ('path' or 'virtual').
    """

    def __init__(self):
        self.conn = None
        self.oss_config = settings.OSS
        self.access_key = self.oss_config.get('access_key', None)
        self.secret_key = self.oss_config.get('secret_key', None)
        self.endpoint_url = self.oss_config.get('endpoint_url', None)
        self.region = self.oss_config.get('region', None)
        self.bucket = self.oss_config.get('bucket', None)
        self.prefix_path = self.oss_config.get('prefix_path', None)
        self.signature_version = self.oss_config.get('signature_version', None)
        self.addressing_style = self.oss_config.get('addressing_style', None)
        self.__open__()

    @staticmethod
    def use_default_bucket(method):
        """Decorator that redirects bucket to the configured default bucket.

        Args:
            method: The decorated method.

        Returns:
            Wrapped method with bucket redirection.
        """
        def wrapper(self, bucket, *args, **kwargs):
            # If there is a default bucket, use the default bucket
            actual_bucket = self.bucket if self.bucket else bucket
            return method(self, actual_bucket, *args, **kwargs)

        return wrapper

    @staticmethod
    def use_prefix_path(method):
        """Decorator that prepends the configured prefix_path to the file name.

        Args:
            method: The decorated method.

        Returns:
            Wrapped method with path prefix prepended to fnm.
        """
        def wrapper(self, bucket, fnm, *args, **kwargs):
            # If the prefix path is set, use the prefix path
            fnm = f"{self.prefix_path}/{fnm}" if self.prefix_path else fnm
            return method(self, bucket, fnm, *args, **kwargs)

        return wrapper

    def __open__(self):
        """Initialize the boto3 S3 client with OSS-compatible configuration."""
        try:
            if self.conn:
                self.__close__()
        except Exception:
            pass

        try:
            config_kwargs = {}

            if self.signature_version:
                config_kwargs['signature_version'] = self.signature_version
            if self.addressing_style:
                config_kwargs['s3'] = {
                    'addressing_style': self.addressing_style
                }

            config = Config(**config_kwargs) if config_kwargs else None

            # Reference: https://help.aliyun.com/zh/oss/developer-reference/use-amazon-s3-sdks-to-access-oss
            self.conn = boto3.client(
                's3',
                region_name=self.region,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                endpoint_url=self.endpoint_url,
                config=config
            )
        except Exception:
            logging.exception(f"Fail to connect at region {self.region}")

    def __close__(self):
        """Release the boto3 client."""
        del self.conn
        self.conn = None

    @use_default_bucket
    def bucket_exists(self, bucket):
        """Check whether a bucket exists.

        Args:
            bucket: Bucket name to check.

        Returns:
            True if the bucket exists, False otherwise.
        """
        try:
            logging.debug(f"head_bucket bucketname {bucket}")
            self.conn.head_bucket(Bucket=bucket)
            exists = True
        except ClientError:
            logging.exception(f"head_bucket error {bucket}")
            exists = False
        return exists

    def health(self):
        """Verify OSS connectivity by uploading a small test object.

        Returns:
            Upload result if healthy.
        """
        bucket = self.bucket
        fnm = "txtxtxtxt1"
        fnm, binary = f"{self.prefix_path}/{fnm}" if self.prefix_path else fnm, b"_t@@@1"
        if not self.bucket_exists(bucket):
            self.conn.create_bucket(Bucket=bucket)
            logging.debug(f"create bucket {bucket} ********")

        r = self.conn.upload_fileobj(BytesIO(binary), bucket, fnm)
        return r

    def get_properties(self, bucket, key):
        """Get object properties (stub, returns empty dict).

        Args:
            bucket: Bucket name.
            key: Object key.

        Returns:
            Empty dict (not implemented).
        """
        return {}

    def list(self, bucket, dir, recursive=True):
        """List objects in a bucket (stub, returns empty list).

        Args:
            bucket: Bucket name.
            dir: Directory prefix.
            recursive: Whether to list recursively.

        Returns:
            Empty list (not implemented).
        """
        return []

    @use_prefix_path
    @use_default_bucket
    def put(self, bucket, fnm, binary, tenant_id=None):
        """Upload binary data to OSS.

        Args:
            bucket: Bucket name.
            fnm: Object key.
            binary: Raw bytes to upload.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Upload result on success, or None on failure.
        """
        logging.debug(f"bucket name {bucket}; filename :{fnm}:")
        for _ in range(1):
            try:
                if not self.bucket_exists(bucket):
                    self.conn.create_bucket(Bucket=bucket)
                    logging.info(f"create bucket {bucket} ********")
                r = self.conn.upload_fileobj(BytesIO(binary), bucket, fnm)

                return r
            except Exception:
                logging.exception(f"Fail put {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)

    @use_prefix_path
    @use_default_bucket
    def rm(self, bucket, fnm, tenant_id=None):
        """Delete an object from OSS.

        Args:
            bucket: Bucket name.
            fnm: Object key.
            tenant_id: Tenant ID (unused, kept for interface compatibility).
        """
        try:
            self.conn.delete_object(Bucket=bucket, Key=fnm)
        except Exception:
            logging.exception(f"Fail rm {bucket}/{fnm}")

    @use_prefix_path
    @use_default_bucket
    def get(self, bucket, fnm, tenant_id=None):
        """Download an object's content as bytes from OSS.

        Args:
            bucket: Bucket name.
            fnm: Object key.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Raw bytes of the object, or None on failure.
        """
        for _ in range(1):
            try:
                r = self.conn.get_object(Bucket=bucket, Key=fnm)
                object_data = r['Body'].read()
                return object_data
            except Exception:
                logging.exception(f"fail get {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
        return None

    @use_prefix_path
    @use_default_bucket
    def obj_exist(self, bucket, fnm, tenant_id=None):
        """Check whether an object exists in OSS.

        Args:
            bucket: Bucket name.
            fnm: Object key.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            True if the object exists, False otherwise.
        """
        try:
            if self.conn.head_object(Bucket=bucket, Key=fnm):
                return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            else:
                raise

    @use_prefix_path
    @use_default_bucket
    def get_presigned_url(self, bucket, fnm, expires, tenant_id=None):
        """Generate a presigned URL for temporary object access.

        Retries up to 10 times on failure.

        Args:
            bucket: Bucket name.
            fnm: Object key.
            expires: Expiration time in seconds.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Presigned URL string, or None after exhausting retries.
        """
        for _ in range(10):
            try:
                r = self.conn.generate_presigned_url('get_object',
                                                     Params={'Bucket': bucket,
                                                             'Key': fnm},
                                                     ExpiresIn=expires)

                return r
            except Exception:
                logging.exception(f"fail get url {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
        return None
