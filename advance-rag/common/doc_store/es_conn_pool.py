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
"""
Singleton connection pool for Elasticsearch / OpenSearch.

Creates a single ``OpenSearch`` client at module load time and exposes it
via the ``ES_CONN`` module-level singleton.  The pool validates connectivity
and version (requires OpenSearch >= 2) during initialisation, retrying up
to ``ATTEMPT_TIME`` attempts.
"""
import logging
import os
import time
from opensearchpy import OpenSearch

from common import settings
from common.decorator import singleton

# Number of connection attempts before giving up
ATTEMPT_TIME = 2
# Max connections in the urllib3 pool — should be >= MAX_CONCURRENT_TASKS
OPENSEARCH_POOL_MAXSIZE = int(os.environ.get('OPENSEARCH_POOL_MAXSIZE', '10'))


@singleton
class ElasticSearchConnectionPool:
    """Process-scoped singleton managing a single OpenSearch client connection.

    Reads connection parameters from ``settings.VECTORDB`` (hosts, username,
    password, verify_certs).  Validates that the server is reachable and
    running OpenSearch version 2 or later.
    """

    def __init__(self):
        if hasattr(settings, "VECTORDB"):
            self.ES_CONFIG = settings.VECTORDB
        else:
            self.ES_CONFIG = settings.get_base_config("vectordb", {})

        for _ in range(ATTEMPT_TIME):
            try:
                if self._connect():
                    break
            except Exception as e:
                logging.warning(f"{str(e)}. Waiting OpenSearch {self.ES_CONFIG['hosts']} to be healthy.")
                time.sleep(5)

        if not hasattr(self, "es_conn") or not self.es_conn or not self.es_conn.ping():
            msg = f"OpenSearch {self.ES_CONFIG['hosts']} is unhealthy in 10s."
            logging.error(msg)
            raise Exception(msg)
        # Ensure OpenSearch major version is >= 2
        v = self.info.get("version", {"number": "2.18.0"})
        v = v["number"].split(".")[0]
        if int(v) < 2:
            msg = f"OpenSearch version must be greater than or equal to 2, current version: {v}"
            logging.error(msg)
            raise Exception(msg)

    def _connect(self):
        """Create the OpenSearch client and verify connectivity.

        Returns:
            True if the connection was established and ping succeeded.
        """
        self.es_conn = OpenSearch(
            self.ES_CONFIG["hosts"].split(","),
            http_auth=(self.ES_CONFIG["username"], self.ES_CONFIG[
                "password"]) if "username" in self.ES_CONFIG and "password" in self.ES_CONFIG else None,
            verify_certs=self.ES_CONFIG.get("verify_certs", False),
            timeout=600,
            pool_maxsize=OPENSEARCH_POOL_MAXSIZE)
        if self.es_conn:
            self.info = self.es_conn.info()
            return True
        return False

    def get_conn(self):
        """Return the active OpenSearch client instance."""
        return self.es_conn

    def refresh_conn(self):
        """Re-establish the connection if the current one is unhealthy.

        Returns:
            The (possibly refreshed) OpenSearch client instance.
        """
        if self.es_conn.ping():
            return self.es_conn
        else:
            # close current if exist
            if self.es_conn:
                self.es_conn.close()
            self._connect()
            return self.es_conn

    def __del__(self):
        if hasattr(self, "es_conn") and self.es_conn:
            self.es_conn.close()


# Module-level singleton -- instantiated once per process
ES_CONN = ElasticSearchConnectionPool()
