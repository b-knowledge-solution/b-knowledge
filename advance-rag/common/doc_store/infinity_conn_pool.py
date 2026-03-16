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
Singleton connection pool for the Infinity vector database.

Wraps Infinity's native ``ConnectionPool`` in a per-process singleton,
validates server health on startup (retrying for up to 120 seconds),
and provides helpers to get/refresh connections and retrieve the
PostgreSQL-protocol connection URI for SQL access.
"""
import logging
import time

import infinity
from infinity.connection_pool import ConnectionPool
from infinity.errors import ErrorCode

from common import settings
from common.decorator import singleton


@singleton
class InfinityConnectionPool:
    """Process-scoped singleton managing an Infinity connection pool.

    Reads the Infinity URI and database name from ``settings.INFINITY``.
    On initialisation, retries connecting up to 24 times (5 s apart, ~120 s)
    until the server reports a healthy status.
    """

    def __init__(self):
        if hasattr(settings, "INFINITY"):
            self.INFINITY_CONFIG = settings.INFINITY
        else:
            self.INFINITY_CONFIG = settings.get_base_config("infinity", {
                "uri": "infinity:23817",
                "postgres_port": 5432,
                "db_name": "default_db"
            })

        # Parse host:port from the configured URI string
        infinity_uri = self.INFINITY_CONFIG["uri"]
        if ":" in infinity_uri:
            host, port = infinity_uri.split(":")
            self.infinity_uri = infinity.common.NetworkAddress(host, int(port))

        # Retry loop: wait for the Infinity server to become healthy
        for _ in range(24):
            try:
                conn_pool = ConnectionPool(self.infinity_uri, max_size=4)
                inf_conn = conn_pool.get_conn()
                res = inf_conn.show_current_node()
                if res.error_code == ErrorCode.OK and res.server_status in ["started", "alive"]:
                    self.conn_pool = conn_pool
                    conn_pool.release_conn(inf_conn)
                    break
            except Exception as e:
                logging.warning(f"{str(e)}. Waiting Infinity {infinity_uri} to be healthy.")
                time.sleep(5)

        if self.conn_pool is None:
            msg = f"Infinity {infinity_uri} is unhealthy in 120s."
            logging.error(msg)
            raise Exception(msg)

        logging.info(f"Infinity {infinity_uri} is healthy.")

    def get_conn_pool(self):
        """Return the underlying Infinity ``ConnectionPool``."""
        return self.conn_pool

    def get_conn_uri(self):
        """Build a PostgreSQL-protocol connection string for Infinity's SQL interface.

        Returns:
            A string like ``"host=infinity port=5432 dbname=default_db"``.
        """
        infinity_uri = self.INFINITY_CONFIG["uri"]
        postgres_port = self.INFINITY_CONFIG["postgres_port"]
        db_name = self.INFINITY_CONFIG["db_name"]

        if ":" in infinity_uri:
            host, _ = infinity_uri.split(":")
            return f"host={host} port={postgres_port} dbname={db_name}"
        return f"host=localhost port={postgres_port} dbname={db_name}"

    def refresh_conn_pool(self):
        """Check pool health and recreate it if the connection is unhealthy.

        Returns:
            The (possibly refreshed) ``ConnectionPool`` instance.
        """
        try:
            inf_conn = self.conn_pool.get_conn()
            res = inf_conn.show_current_node()
            if res.error_code == ErrorCode.OK and res.server_status in ["started", "alive"]:
                return self.conn_pool
            else:
                raise Exception(f"{res.error_code}: {res.server_status}")

        except Exception as e:
            logging.error(str(e))
            if hasattr(self, "conn_pool") and self.conn_pool:
                self.conn_pool.destroy()
                self.conn_pool = ConnectionPool(self.infinity_uri, max_size=32)
                return self.conn_pool

    def __del__(self):
        if hasattr(self, "conn_pool") and self.conn_pool:
            self.conn_pool.destroy()


# Module-level singleton -- instantiated once per process
INFINITY_CONN = InfinityConnectionPool()
