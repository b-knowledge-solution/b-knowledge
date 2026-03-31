"""TuShare Chinese stock data tool for agent workflows.

Retrieves Chinese financial news and stock data from the TuShare Pro API.
Requires a TuShare API token provided via credentials.
"""

import json
from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class TuShareTool(BaseTool):
    """Chinese financial news and stock data tool via TuShare Pro API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "tushare"
    description = "Chinese financial news and stock data via TuShare API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Fetch financial news from TuShare Pro API.

        Args:
            input_data: Must contain 'query' or 'output' with keyword for filtering.
            config: Optional 'src' (news source, default 'eastmoney'),
                'start_date' (default '2024-01-01 09:00:00'),
                'end_date' (default current time).
            credentials: Must contain 'token' for TuShare Pro API.

        Returns:
            Dict with 'result' containing filtered news articles.
        """
        # Validate token
        token = credentials.get("token") if credentials else None
        if not token:
            return {"error": "TuShare API token not configured"}

        # Extract keyword for news filtering
        keyword = input_data.get("query", input_data.get("output", ""))

        src = config.get("src", "eastmoney")
        start_date = config.get("start_date", "2024-01-01 09:00:00")

        # Default end_date to current time if not specified
        import time
        end_date = config.get("end_date", time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()))

        try:
            # Call the TuShare Pro HTTP API directly
            payload = {
                "api_name": "news",
                "token": token,
                "params": {
                    "src": src,
                    "start_date": start_date,
                    "end_date": end_date,
                },
            }
            response = httpx.post(
                "http://api.tushare.pro",
                content=json.dumps(payload).encode("utf-8"),
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            # Check for API-level errors
            if data.get("code") != 0:
                return {"error": f"TuShare API error: {data.get('msg', 'Unknown error')}"}

            # Parse the tabular response into rows
            items = data.get("data", {}).get("items", [])
            fields = data.get("data", {}).get("fields", [])

            if not items or not fields:
                return {"result": []}

            # Convert to list of dicts
            rows = [dict(zip(fields, item)) for item in items]

            # Filter by keyword if provided
            if keyword and keyword.strip():
                keyword_lower = keyword.strip().lower()
                rows = [
                    row for row in rows
                    if keyword_lower in str(row.get("content", "")).lower()
                ]

            logger.info(f"TuShare returned {len(rows)} news items (keyword: {keyword[:30] if keyword else 'none'})")

            return {"result": rows}
        except httpx.HTTPStatusError as e:
            logger.error(f"TuShare API error: status={e.response.status_code}")
            return {"error": f"TuShare API error: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"TuShare request failed: {e}")
            return {"error": f"TuShare request failed: {str(e)}"}
