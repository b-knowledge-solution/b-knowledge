"""Tavily web search tool for agent workflows.

Calls the Tavily Search API to perform web searches and return structured
results with titles, URLs, and content snippets. Requires an API key
provided via credentials.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class TavilyTool(BaseTool):
    """Web search tool powered by the Tavily Search API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "tavily"
    description = "Web search via Tavily API"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute Tavily web search.

        Args:
            input_data: Must contain 'query' key with search query string.
            config: Optional 'max_results' (default 5), 'search_depth' ('basic' | 'advanced').
            credentials: Must contain 'api_key' for Tavily API authentication.

        Returns:
            Dict with 'result' containing list of search results (title, url, content)
            and 'answer' containing Tavily's generated answer if available.
        """
        # Validate API key exists in credentials
        api_key = credentials.get("api_key") if credentials else None
        if not api_key:
            logger.warning("Tavily tool called without API key")
            return {"error": "Tavily API key not configured"}

        # Extract search parameters from input and config
        query = input_data.get("query", input_data.get("output", ""))
        max_results = config.get("max_results", 5)
        search_depth = config.get("search_depth", "basic")

        try:
            # Call the Tavily Search API with structured JSON payload
            response = httpx.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": api_key,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": search_depth,
                },
                timeout=30.0,
            )
            response.raise_for_status()
            data = response.json()

            logger.info(f"Tavily search returned {len(data.get('results', []))} results for query: {query[:50]}")

            return {
                "result": data.get("results", []),
                "answer": data.get("answer", ""),
            }
        except httpx.HTTPStatusError as e:
            logger.error(f"Tavily API error: status={e.response.status_code}")
            return {"error": f"Tavily API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"Tavily request failed: {e}")
            return {"error": f"Tavily request failed: {str(e)}"}
