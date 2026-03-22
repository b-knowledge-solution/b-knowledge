"""Wikipedia search tool for agent workflows.

Queries the Wikipedia API to find articles matching a search query.
Returns article titles, snippets, and URLs. No credentials required
since the Wikipedia API is publicly accessible.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class WikipediaTool(BaseTool):
    """Wikipedia article search and retrieval tool.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "wikipedia"
    description = "Search and retrieve Wikipedia articles"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Search Wikipedia for articles matching the query.

        Args:
            input_data: Must contain 'query' key with search string.
            config: Optional 'language' (default 'en'), 'max_results' (default 3).
            credentials: Not required for Wikipedia (public API).

        Returns:
            Dict with 'result' containing list of articles with title, snippet, and URL.
        """
        # Extract search parameters from input and config
        query = input_data.get("query", input_data.get("output", ""))
        language = config.get("language", "en")
        max_results = config.get("max_results", 3)

        try:
            # Use the Wikipedia Action API for article search
            response = httpx.get(
                f"https://{language}.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srsearch": query,
                    "srlimit": max_results,
                    "format": "json",
                },
                timeout=15.0,
            )
            response.raise_for_status()
            data = response.json()

            # Parse search results into a consistent format
            results = []
            for item in data.get("query", {}).get("search", []):
                # Build Wikipedia URL from article title (spaces become underscores)
                title = item["title"]
                results.append({
                    "title": title,
                    "snippet": item.get("snippet", ""),
                    "url": f"https://{language}.wikipedia.org/wiki/{title.replace(' ', '_')}",
                })

            logger.info(f"Wikipedia search returned {len(results)} results for query: {query[:50]}")

            return {"result": results}
        except httpx.HTTPStatusError as e:
            logger.error(f"Wikipedia API error: status={e.response.status_code}")
            return {"error": f"Wikipedia API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"Wikipedia request failed: {e}")
            return {"error": f"Wikipedia request failed: {str(e)}"}
