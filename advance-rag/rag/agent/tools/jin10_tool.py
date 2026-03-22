"""Jin10 financial news API tool for agent workflows.

Retrieves Chinese financial data from the Jin10 Open Data API, including
flash news, economic calendars, commodity symbols/quotes, and news articles.
Requires a Jin10 API secret key via credentials.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class Jin10Tool(BaseTool):
    """Chinese financial news and data tool via Jin10 API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "jin10"
    description = "Chinese financial news and market data via Jin10 API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Fetch financial data from the Jin10 Open Data API.

        Args:
            input_data: Optional 'query' or 'output' for filtering content.
            config: 'type' ('flash' | 'calendar' | 'symbols' | 'news', default 'flash'),
                'flash_type' ('1'-'5', default '1'),
                'calendar_type' ('cj' | 'qh' | 'hk' | 'us', default 'cj'),
                'calendar_datatype' ('data' | 'event' | 'holiday', default 'data'),
                'symbols_type' ('GOODS' | 'FOREX' | 'FUTURE' | 'CRYPTO', default 'GOODS'),
                'symbols_datatype' ('symbols' | 'quotes', default 'symbols').
            credentials: Must contain 'secret_key' for Jin10 API authentication.

        Returns:
            Dict with 'result' containing financial data items.
        """
        # Validate API key
        secret_key = credentials.get("secret_key") if credentials else None
        if not secret_key:
            return {"error": "Jin10 API secret_key not configured"}

        headers = {"secret-key": secret_key}
        data_type = config.get("type", "flash")

        try:
            if data_type == "flash":
                return self._fetch_flash(config, headers)
            elif data_type == "calendar":
                return self._fetch_calendar(config, headers)
            elif data_type == "symbols":
                return self._fetch_symbols(config, headers)
            elif data_type == "news":
                return self._fetch_news(config, headers)
            else:
                return {"error": f"Unknown Jin10 data type: {data_type}"}
        except httpx.HTTPStatusError as e:
            logger.error(f"Jin10 API error: status={e.response.status_code}")
            return {"error": f"Jin10 API error: {e.response.status_code}"}
        except Exception as e:
            logger.error(f"Jin10 request failed: {e}")
            return {"error": f"Jin10 request failed: {str(e)}"}

    def _fetch_flash(self, config: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        """Fetch flash news from Jin10.

        Args:
            config: Contains 'flash_type' for news category filtering.
            headers: HTTP headers with secret-key.

        Returns:
            Dict with 'result' containing flash news items.
        """
        flash_type = config.get("flash_type", "1")
        response = httpx.get(
            f"https://open-data-api.jin10.com/data-api/flash?category={flash_type}",
            headers=headers,
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()

        results = [
            {"content": item["data"]["content"]}
            for item in data.get("data", [])
            if "data" in item and "content" in item["data"]
        ]
        logger.info(f"Jin10 flash returned {len(results)} items")
        return {"result": results}

    def _fetch_calendar(self, config: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        """Fetch economic calendar from Jin10.

        Args:
            config: Contains 'calendar_type' and 'calendar_datatype'.
            headers: HTTP headers with secret-key.

        Returns:
            Dict with 'result' containing calendar data.
        """
        calendar_type = config.get("calendar_type", "cj")
        calendar_datatype = config.get("calendar_datatype", "data")
        response = httpx.get(
            f"https://open-data-api.jin10.com/data-api/calendar/{calendar_datatype}?category={calendar_type}",
            headers=headers,
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Jin10 calendar returned {len(data.get('data', []))} items")
        return {"result": data.get("data", [])}

    def _fetch_symbols(self, config: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        """Fetch commodity symbols or quotes from Jin10.

        Args:
            config: Contains 'symbols_type' and 'symbols_datatype'.
            headers: HTTP headers with secret-key.

        Returns:
            Dict with 'result' containing symbol or quote data.
        """
        symbols_type = config.get("symbols_type", "GOODS")
        symbols_datatype = config.get("symbols_datatype", "symbols")
        response = httpx.get(
            f"https://open-data-api.jin10.com/data-api/{symbols_datatype}?type={symbols_type}",
            headers=headers,
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Jin10 symbols returned {len(data.get('data', []))} items")
        return {"result": data.get("data", [])}

    def _fetch_news(self, config: dict[str, Any], headers: dict[str, str]) -> dict[str, Any]:
        """Fetch news articles from Jin10.

        Args:
            config: Optional 'contain' and 'filter' for content filtering.
            headers: HTTP headers with secret-key.

        Returns:
            Dict with 'result' containing news articles.
        """
        response = httpx.get(
            "https://open-data-api.jin10.com/data-api/news",
            headers=headers,
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        logger.info(f"Jin10 news returned {len(data.get('data', []))} items")
        return {"result": data.get("data", [])}
