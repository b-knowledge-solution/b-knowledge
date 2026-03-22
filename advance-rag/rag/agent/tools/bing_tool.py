"""Bing Web Search API tool for agent workflows.

Performs web searches using the Microsoft Bing Web Search API v7.
Requires a Bing Search API key provided via credentials.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class BingTool(BaseTool):
    """Web search tool powered by Microsoft Bing Web Search API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "bing"
    description = "Web search via Bing Web Search API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute a Bing Web Search query.

        Args:
            input_data: Must contain 'query' key with search keywords.
            config: Optional 'max_results' (default 10), 'market' (default 'en-US').
            credentials: Must contain 'api_key' for Bing Search API.

        Returns:
            Dict with 'result' containing list of web page results with
            name, url, and snippet.
        """
        # Validate API key
        api_key = credentials.get("api_key") if credentials else None
        if not api_key:
            logger.warning("Bing tool called without API key")
            return {"error": "Bing Search API key not configured"}

        # Extract search parameters
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        max_results = config.get("max_results", 10)
        market = config.get("market", "en-US")

        try:
            # Call the Bing Web Search v7 API
            response = httpx.get(
                "https://api.bing.microsoft.com/v7.0/search",
                params={
                    "q": query,
                    "count": max_results,
                    "mkt": market,
                },
                headers={"Ocp-Apim-Subscription-Key": api_key},
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()

            # Extract web page results from the response
            web_pages = data.get("webPages", {}).get("value", [])
            results = [
                {
                    "title": page.get("name", ""),
                    "url": page.get("url", ""),
                    "snippet": page.get("snippet", ""),
                }
                for page in web_pages
            ]

            logger.info(f"Bing search returned {len(results)} results for query: {query[:50]}")

            return {"result": results}
        except httpx.HTTPStatusError as e:
            logger.error(f"Bing API error: status={e.response.status_code}")
            return {"error": f"Bing API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"Bing request failed: {e}")
            return {"error": f"Bing request failed: {str(e)}"}
