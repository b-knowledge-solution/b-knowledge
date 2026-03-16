"""OpenDAL (Open Data Access Layer) storage connector.

Provides a singleton storage backend using Apache OpenDAL, which supports
multiple storage schemes (MySQL, S3, etc.) through a unified API. When
the MySQL scheme is used, binary data is stored in a MySQL LONGBLOB column
backed by the opendal library's MySQL operator.

This connector initializes the database table and max_allowed_packet
configuration automatically on startup for the MySQL scheme.
"""

import opendal
import logging
import pymysql
import re
from urllib.parse import quote_plus

from common.config_utils import get_base_config
from common.decorator import singleton

# SQL template for creating the OpenDAL key-value storage table
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS `{}` (
    `key` VARCHAR(255) PRIMARY KEY,
    `value` LONGBLOB,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
"""

# SQL template for configuring MySQL max_allowed_packet (needed for large BLOBs)
SET_MAX_ALLOWED_PACKET_SQL = """
SET GLOBAL max_allowed_packet={}
"""


def get_opendal_config():
    """Load OpenDAL configuration from YAML config files.

    For the MySQL scheme, builds a connection string from the mysql config
    section. For other schemes, passes through the config directly.
    Logs non-sensitive configuration fields for debugging.

    Returns:
        Dict of keyword arguments for the opendal.Operator constructor.

    Raises:
        Exception: If the configuration cannot be loaded.
    """
    try:
        opendal_config = get_base_config('opendal', {})
        if opendal_config.get("scheme", "mysql") == 'mysql':
            # Build MySQL connection parameters from the mysql config section
            mysql_config = get_base_config('mysql', {})
            max_packet = mysql_config.get("max_allowed_packet", 134217728)
            kwargs = {
                "scheme": "mysql",
                "host": mysql_config.get("host", "127.0.0.1"),
                "port": str(mysql_config.get("port", 3306)),
                "user": mysql_config.get("user", "root"),
                "password": mysql_config.get("password", ""),
                "database": mysql_config.get("name", "test_open_dal"),
                "table": opendal_config.get("config", {}).get("oss_table", "opendal_storage"),
                "max_allowed_packet": str(max_packet)
            }
            kwargs[
                "connection_string"] = f"mysql://{kwargs['user']}:{quote_plus(kwargs['password'])}@{kwargs['host']}:{kwargs['port']}/{kwargs['database']}?max_allowed_packet={max_packet}"
        else:
            # Non-MySQL scheme: pass through config as-is
            scheme = opendal_config.get("scheme")
            config_data = opendal_config.get("config", {})
            kwargs = {"scheme": scheme, **config_data}

        # Only include non-sensitive keys in logs. Do NOT
        # add 'password' or any key containing embedded credentials
        # (like 'connection_string').
        safe_log_info = {
            "scheme": kwargs.get("scheme"),
            "host": kwargs.get("host"),
            "port": kwargs.get("port"),
            "database": kwargs.get("database"),
            "table": kwargs.get("table"),
            # indicate presence of credentials without logging them
            "has_credentials": any(k in kwargs for k in ("password", "connection_string")),
        }
        logging.info("Loaded OpenDAL configuration (non sensitive fields only): %s", safe_log_info)
        return kwargs
    except Exception as e:
        logging.error("Failed to load OpenDAL configuration from yaml: %s", str(e))
        raise


@singleton
class OpenDALStorage:
    """Singleton storage backend using Apache OpenDAL.

    Supports multiple storage schemes through the opendal library.
    For MySQL, automatically initializes the database table and
    configures max_allowed_packet on startup.

    Attributes:
        _kwargs: Configuration keyword arguments.
        _scheme: Storage scheme (e.g., 'mysql', 's3').
        _operator: opendal.Operator instance for performing I/O.
    """

    def __init__(self):
        self._kwargs = get_opendal_config()
        self._scheme = self._kwargs.get('scheme', 'mysql')
        if self._scheme == 'mysql':
            self.init_db_config()
            self.init_opendal_mysql_table()
        self._operator = opendal.Operator(**self._kwargs)

        logging.info("OpenDALStorage initialized successfully")

    def health(self):
        """Verify storage connectivity by writing a small test object.

        Returns:
            Write result from the operator.
        """
        bucket, fnm, binary = "txtxtxtxt1", "txtxtxtxt1", b"_t@@@1"
        return self._operator.write(f"{bucket}/{fnm}", binary)

    def put(self, bucket, fnm, binary, tenant_id=None):
        """Write binary data to the storage backend.

        Args:
            bucket: Logical bucket / folder prefix.
            fnm: File name / object key.
            binary: Raw bytes to store.
            tenant_id: Tenant ID (unused, kept for interface compatibility).
        """
        self._operator.write(f"{bucket}/{fnm}", binary)

    def get(self, bucket, fnm, tenant_id=None):
        """Read binary data from the storage backend.

        Args:
            bucket: Logical bucket / folder prefix.
            fnm: File name / object key.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Raw bytes of the stored object.
        """
        return self._operator.read(f"{bucket}/{fnm}")

    def rm(self, bucket, fnm, tenant_id=None):
        """Delete an object from the storage backend.

        Args:
            bucket: Logical bucket / folder prefix.
            fnm: File name / object key.
            tenant_id: Tenant ID (unused, kept for interface compatibility).
        """
        self._operator.delete(f"{bucket}/{fnm}")
        self._operator.__init__()

    def scan(self, bucket, fnm, tenant_id=None):
        """List objects matching a prefix.

        Args:
            bucket: Logical bucket / folder prefix.
            fnm: File name prefix to scan.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            Iterator of matching object entries.
        """
        return self._operator.scan(f"{bucket}/{fnm}")

    def obj_exist(self, bucket, fnm, tenant_id=None):
        """Check whether an object exists in storage.

        Args:
            bucket: Logical bucket / folder prefix.
            fnm: File name / object key.
            tenant_id: Tenant ID (unused, kept for interface compatibility).

        Returns:
            True if the object exists, False otherwise.
        """
        return self._operator.exists(f"{bucket}/{fnm}")

    def init_db_config(self):
        """Configure MySQL max_allowed_packet for large BLOB support.

        Connects to MySQL and sets the global max_allowed_packet value
        to allow storing large binary objects.

        Raises:
            Exception: If the database configuration fails.
        """
        try:
            conn = pymysql.connect(
                host=self._kwargs['host'],
                port=int(self._kwargs['port']),
                user=self._kwargs['user'],
                password=self._kwargs['password'],
                database=self._kwargs['database']
            )
            cursor = conn.cursor()
            max_packet = self._kwargs.get('max_allowed_packet', 4194304)  # Default to 4MB if not specified
            # Ensure max_packet is a valid integer to prevent SQL injection
            cursor.execute(SET_MAX_ALLOWED_PACKET_SQL.format(int(max_packet)))
            conn.commit()
            cursor.close()
            conn.close()
            logging.info(f"Database configuration initialized with max_allowed_packet={max_packet}")
        except Exception as e:
            logging.error(f"Failed to initialize database configuration: {str(e)}")
            raise

    def init_opendal_mysql_table(self):
        """Create the OpenDAL storage table in MySQL if it does not exist.

        Validates the table name against a safe pattern to prevent
        SQL injection before executing the CREATE TABLE statement.

        Raises:
            ValueError: If the table name contains invalid characters.
        """
        table_name = self._kwargs['table']
        # Validate table name to prevent SQL injection
        if not re.match(r'^[a-zA-Z0-9_]+$', table_name):
            raise ValueError(f"Invalid table name: {table_name}")

        conn = pymysql.connect(
            host=self._kwargs['host'],
            port=int(self._kwargs['port']),
            user=self._kwargs['user'],
            password=self._kwargs['password'],
            database=self._kwargs['database']
        )
        cursor = conn.cursor()
        cursor.execute(CREATE_TABLE_SQL.format(table_name))
        conn.commit()
        cursor.close()
        conn.close()
        logging.info(f"Table `{table_name}` initialized.")
