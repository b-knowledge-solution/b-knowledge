"""SearxNG metasearch engine tool for agent workflows.

Searches via a self-hosted SearxNG instance that aggregates results from
multiple search engines. Requires the SearxNG base URL in config.
No external API credentials needed.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class SearxNGTool(BaseTool):
    """Privacy-focused metasearch tool via a SearxNG instance.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "searxng"
    description = "Privacy-focused metasearch via SearxNG instance"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Search via a SearxNG instance.

        Args:
            input_data: Must contain 'query' key with search keywords.
            config: Must contain 'base_url' (e.g. 'http://localhost:4000').
                Optional 'max_results' (default 10), 'categories' (default 'general').
            credentials: Not required for SearxNG.

        Returns:
            Dict with 'result' containing list of search results with
            title, url, and content.
        """
        # Extract search parameters
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        base_url = config.get("base_url", "")
        if not base_url:
            return {"error": "SearxNG base_url not configured (e.g. 'http://localhost:4000')"}

        max_results = config.get("max_results", 10)
        categories = config.get("categories", "general")

        try:
            # Call the SearxNG JSON search endpoint
            response = httpx.get(
                f"{base_url.rstrip('/')}/search",
                params={
                    "q": query,
                    "format": "json",
                    "categories": categories,
                    "language": "auto",
                    "safesearch": 1,
                    "pageno": 1,
                },
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()

            if not isinstance(data, dict):
                return {"error": "Invalid response from SearxNG"}

            raw_results = data.get("results", [])
            if not isinstance(raw_results, list):
                return {"error": "Invalid results format from SearxNG"}

            # Limit to max_results and normalize output format
            results = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                }
                for r in raw_results[:max_results]
            ]

            logger.info(f"SearxNG returned {len(results)} results for query: {query[:50]}")

            return {"result": results}
        except httpx.HTTPStatusError as e:
            logger.error(f"SearxNG API error: status={e.response.status_code}")
            return {"error": f"SearxNG API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"SearxNG request failed: {e}")
            return {"error": f"SearxNG request failed: {str(e)}"}
