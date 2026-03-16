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
"""AWS S3 storage connector using the boto3 SDK.

Provides a singleton storage client for Amazon S3, implementing the
standard storage interface. Supports default bucket mode with prefix
paths, custom endpoint URLs, session tokens, and configurable
signature versions and addressing styles.

The boto3 client is wrapped in a single-element list to work around
singleton initialization edge cases.
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
class RAGFlowS3:
    """AWS S3 client implementing the unified storage interface.

    Uses boto3 with flexible credential and endpoint configuration.
    Supports single-bucket mode with prefix paths for key namespacing.

    Attributes:
        conn: List containing the boto3 S3 client (single-element list).
        s3_config: S3 configuration dict from settings.
        access_key: AWS access key ID.
        secret_key: AWS secret access key.
        session_token: AWS session token (for temporary credentials).
        region_name: AWS region name.
        endpoint_url: Custom S3-compatible endpoint URL.
        signature_version: S3 signature version.
        addressing_style: S3 addressing style ('path' or 'virtual').
        bucket: Default bucket name (None for multi-bucket mode).
        prefix_path: Optional key prefix for all operations.
    """

    def __init__(self):
        self.conn = None
        self.s3_config = settings.S3
        self.access_key = self.s3_config.get('access_key', None)
        self.secret_key = self.s3_config.get('secret_key', None)
        self.session_token = self.s3_config.get('session_token', None)
        self.region_name = self.s3_config.get('region_name', None)
        self.endpoint_url = self.s3_config.get('endpoint_url', None)
        self.signature_version = self.s3_config.get('signature_version', None)
        self.addressing_style = self.s3_config.get('addressing_style', None)
        self.bucket = self.s3_config.get('bucket', None)
        self.prefix_path = self.s3_config.get('prefix_path', None)
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
        """Decorator that prepends prefix_path and bucket to the file name.

        When prefix_path is configured, the upstream bucket is used as
        a sub-prefix, making the full key: prefix_path/bucket/fnm.

        Args:
            method: The decorated method.

        Returns:
            Wrapped method with path prefix applied.
        """
        def wrapper(self, bucket, fnm, *args, **kwargs):
            # If the prefix path is set, use the prefix path.
            # The bucket passed from the upstream call is
            # used as the file prefix. This is especially useful when you're using the default bucket
            if self.prefix_path:
                fnm = f"{self.prefix_path}/{bucket}/{fnm}"
            return method(self, bucket, fnm, *args, **kwargs)

        return wrapper

    def __open__(self):
        """Initialize the boto3 S3 client with configured credentials and endpoint."""
        try:
            if self.conn:
                self.__close__()
        except Exception:
            pass

        try:
            s3_params = {}
            config_kwargs = {}
            # if not set ak/sk, boto3 s3 client would try several ways to do the authentication
            # see doc: https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html#configuring-credentials
            if self.access_key and self.secret_key:
                s3_params = {
                    'aws_access_key_id': self.access_key,
                    'aws_secret_access_key': self.secret_key,
                    'aws_session_token': self.session_token,
                }
            if self.region_name:
                s3_params['region_name'] = self.region_name
            if self.endpoint_url:
                s3_params['endpoint_url'] = self.endpoint_url

            # Configure signature_version and addressing_style through Config object
            if self.signature_version:
                config_kwargs['signature_version'] = self.signature_version
            if self.addressing_style:
                config_kwargs['s3'] = {'addressing_style': self.addressing_style}

            if config_kwargs:
                s3_params['config'] = Config(**config_kwargs)

            self.conn = [boto3.client('s3', **s3_params)]
        except Exception:
            logging.exception(f"Fail to connect at region {self.region_name} or endpoint {self.endpoint_url}")

    def __close__(self):
        """Release the boto3 client."""
        del self.conn[0]
        self.conn = None

    @use_default_bucket
    def bucket_exists(self, bucket, *args, **kwargs):
        """Check whether a bucket exists.

        Args:
            bucket: Bucket name to check.

        Returns:
            True if the bucket exists, False otherwise.
        """
        try:
            logging.debug(f"head_bucket bucketname {bucket}")
            self.conn[0].head_bucket(Bucket=bucket)
            exists = True
        except ClientError:
            logging.exception(f"head_bucket error {bucket}")
            exists = False
        return exists

    def health(self):
        """Verify S3 connectivity by uploading a small test object.

        Returns:
            Upload result if healthy.
        """
        bucket = self.bucket
        fnm = "txtxtxtxt1"
        fnm, binary = f"{self.prefix_path}/{fnm}" if self.prefix_path else fnm, b"_t@@@1"
        if not self.bucket_exists(bucket):
            self.conn[0].create_bucket(Bucket=bucket)
            logging.debug(f"create bucket {bucket} ********")

        r = self.conn[0].upload_fileobj(BytesIO(binary), bucket, fnm)
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
    def put(self, bucket, fnm, binary, *args, **kwargs):
        """Upload binary data to S3.

        Args:
            bucket: Bucket name.
            fnm: Object key.
            binary: Raw bytes to upload.

        Returns:
            Upload result on success, or None on failure.
        """
        logging.debug(f"bucket name {bucket}; filename :{fnm}:")
        for _ in range(1):
            try:
                if not self.bucket_exists(bucket):
                    self.conn[0].create_bucket(Bucket=bucket)
                    logging.info(f"create bucket {bucket} ********")
                r = self.conn[0].upload_fileobj(BytesIO(binary), bucket, fnm)

                return r
            except Exception:
                logging.exception(f"Fail put {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)

    @use_prefix_path
    @use_default_bucket
    def rm(self, bucket, fnm, *args, **kwargs):
        """Delete an object from S3.

        Args:
            bucket: Bucket name.
            fnm: Object key.
        """
        try:
            self.conn[0].delete_object(Bucket=bucket, Key=fnm)
        except Exception:
            logging.exception(f"Fail rm {bucket}/{fnm}")

    @use_prefix_path
    @use_default_bucket
    def get(self, bucket, fnm, *args, **kwargs):
        """Download an object's content as bytes from S3.

        Args:
            bucket: Bucket name.
            fnm: Object key.

        Returns:
            Raw bytes of the object, or None on failure.
        """
        for _ in range(1):
            try:
                r = self.conn[0].get_object(Bucket=bucket, Key=fnm)
                object_data = r['Body'].read()
                return object_data
            except Exception:
                logging.exception(f"fail get {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
        return None

    @use_prefix_path
    @use_default_bucket
    def obj_exist(self, bucket, fnm, *args, **kwargs):
        """Check whether an object exists in S3.

        Args:
            bucket: Bucket name.
            fnm: Object key.

        Returns:
            True if the object exists, False otherwise.
        """
        try:
            if self.conn[0].head_object(Bucket=bucket, Key=fnm):
                return True
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                return False
            else:
                raise

    @use_prefix_path
    @use_default_bucket
    def get_presigned_url(self, bucket, fnm, expires, *args, **kwargs):
        """Generate a presigned URL for temporary object access.

        Retries up to 10 times on failure.

        Args:
            bucket: Bucket name.
            fnm: Object key.
            expires: Expiration time in seconds.

        Returns:
            Presigned URL string, or None after exhausting retries.
        """
        for _ in range(10):
            try:
                r = self.conn[0].generate_presigned_url('get_object',
                                                        Params={'Bucket': bucket,
                                                                'Key': fnm},
                                                        ExpiresIn=expires)

                return r
            except Exception:
                logging.exception(f"fail get url {bucket}/{fnm}")
                self.__open__()
                time.sleep(1)
        return None

    @use_default_bucket
    def rm_bucket(self, bucket, *args, **kwargs):
        """Remove a bucket and all its objects.

        Args:
            bucket: Bucket name to remove.
        """
        for conn in self.conn:
            try:
                if not conn.bucket_exists(bucket):
                    continue
                for o in conn.list_objects_v2(Bucket=bucket):
                    conn.delete_object(bucket, o.object_name)
                conn.delete_bucket(Bucket=bucket)
                return
            except Exception as e:
                logging.error(f"Fail rm {bucket}: " + str(e))
