"""Google Custom Search API tool for agent workflows.

Performs web searches using the Google Custom Search JSON API.
Requires an API key and a Custom Search Engine ID (cx) provided
via credentials.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class GoogleTool(BaseTool):
    """Web search tool powered by Google Custom Search API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "google"
    description = "Web search via Google Custom Search API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute a Google Custom Search query.

        Args:
            input_data: Must contain 'query' key with search keywords.
            config: Optional 'max_results' (default 10), 'language' (default 'en'),
                'country' (default 'us').
            credentials: Must contain 'api_key' and 'cx' (Custom Search Engine ID).

        Returns:
            Dict with 'result' containing list of search results with title,
            link, and snippet.
        """
        # Validate required credentials
        api_key = credentials.get("api_key") if credentials else None
        cx = credentials.get("cx") if credentials else None

        if not api_key or not cx:
            logger.warning("Google tool called without api_key or cx")
            return {"error": "Google Custom Search requires 'api_key' and 'cx' in credentials"}

        # Extract search parameters
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        max_results = min(config.get("max_results", 10), 10)  # Google API caps at 10 per request
        language = config.get("language", "en")

        try:
            # Call the Google Custom Search JSON API
            response = httpx.get(
                "https://www.googleapis.com/customsearch/v1",
                params={
                    "key": api_key,
                    "cx": cx,
                    "q": query,
                    "num": max_results,
                    "hl": language,
                },
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()

            # Parse search results into a consistent format
            results = [
                {
                    "title": item.get("title", ""),
                    "url": item.get("link", ""),
                    "snippet": item.get("snippet", ""),
                }
                for item in data.get("items", [])
            ]

            logger.info(f"Google search returned {len(results)} results for query: {query[:50]}")

            return {"result": results}
        except httpx.HTTPStatusError as e:
            logger.error(f"Google API error: status={e.response.status_code}")
            return {"error": f"Google API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"Google request failed: {e}")
            return {"error": f"Google request failed: {str(e)}"}
