"""SQL execution tool for agent workflows.

Executes SQL queries against PostgreSQL, MySQL, or MariaDB databases.
Requires database connection credentials provided via the credentials dict.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class ExeSQLTool(BaseTool):
    """SQL query execution tool supporting multiple database engines.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "exesql"
    description = "Execute SQL queries against a database"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute one or more SQL statements against a database.

        Args:
            input_data: Must contain 'sql' or 'query' or 'output' with SQL text.
            config: Optional 'db_type' ('postgres' | 'mysql' | 'mariadb', default 'postgres'),
                'max_records' (default 1024).
            credentials: Must contain 'host', 'port', 'database', 'username', 'password'.
                Or a single 'connection_string' key.

        Returns:
            Dict with 'result' containing query results as list of row dicts.
        """
        if not credentials:
            return {"error": "Database credentials not configured"}

        # Resolve the SQL statement from input
        sql = input_data.get("sql", input_data.get("query", input_data.get("output", "")))
        if not sql or not sql.strip():
            return {"error": "No SQL statement provided"}

        db_type = config.get("db_type", "postgres")
        max_records = config.get("max_records", 1024)

        # Extract connection parameters from credentials
        host = credentials.get("host", "localhost")
        port = int(credentials.get("port", "5432"))
        database = credentials.get("database", "")
        username = credentials.get("username", "")
        password = credentials.get("password", "")

        if not database:
            return {"error": "Database name not specified in credentials"}

        conn = None
        try:
            # Connect to the appropriate database engine
            if db_type in ("mysql", "mariadb"):
                try:
                    import pymysql
                except ImportError:
                    return {"error": "pymysql not installed. Install with: pip install pymysql"}
                conn = pymysql.connect(
                    host=host, port=port, db=database,
                    user=username, password=password,
                )
            elif db_type == "postgres":
                try:
                    import psycopg2
                except ImportError:
                    return {"error": "psycopg2 not installed. Install with: pip install psycopg2-binary"}
                conn = psycopg2.connect(
                    host=host, port=port, dbname=database,
                    user=username, password=password,
                )
            else:
                return {"error": f"Unsupported database type: {db_type}"}

            cursor = conn.cursor()

            # Execute each semicolon-separated SQL statement
            all_results = []
            statements = [s.strip() for s in sql.split(";") if s.strip()]

            for statement in statements:
                cursor.execute(statement)

                # Only fetch results for SELECT-type statements
                if cursor.description:
                    columns = [desc[0] for desc in cursor.description]
                    rows = cursor.fetchmany(max_records)
                    result_rows = [dict(zip(columns, row)) for row in rows]
                    all_results.append(result_rows)
                else:
                    # DML statements: report affected row count
                    all_results.append({"affected_rows": cursor.rowcount})

            # Commit any pending transactions (for INSERT/UPDATE/DELETE)
            conn.commit()

            logger.info(f"SQL execution completed: {len(statements)} statement(s)")

            # Flatten single-statement results
            if len(all_results) == 1:
                return {"result": all_results[0]}
            return {"result": all_results}

        except Exception as e:
            logger.error(f"SQL execution failed: {e}")
            return {"error": f"SQL execution failed: {str(e)}"}
        finally:
            # Always close the database connection
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
