"""DuckDuckGo web search tool for agent workflows.

Performs privacy-focused web searches using the duckduckgo_search library.
Supports both general web search and news search. No credentials required.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class DuckDuckGoTool(BaseTool):
    """Privacy-focused web search tool via DuckDuckGo.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "duckduckgo"
    description = "Web search via DuckDuckGo (no API key needed)"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Search DuckDuckGo for web pages or news articles.

        Args:
            input_data: Must contain 'query' key with search keywords.
            config: Optional 'max_results' (default 10), 'channel'
                ('text' | 'news', default 'text').
            credentials: Not required for DuckDuckGo.

        Returns:
            Dict with 'result' containing list of search results with
            title, url, and body/content.
        """
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            return {"error": "duckduckgo_search not installed. Install with: pip install duckduckgo-search"}

        # Extract search parameters from input and config
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        max_results = config.get("max_results", 10)
        channel = config.get("channel", "text")

        try:
            with DDGS() as ddgs:
                if channel == "news":
                    # Search news articles
                    raw_results = list(ddgs.news(query, max_results=max_results))
                    results = [
                        {
                            "title": r.get("title", ""),
                            "url": r.get("url", r.get("href", "")),
                            "body": r.get("body", ""),
                            "date": r.get("date", ""),
                            "source": r.get("source", ""),
                        }
                        for r in raw_results
                    ]
                else:
                    # Default: general web search
                    raw_results = list(ddgs.text(query, max_results=max_results))
                    results = [
                        {
                            "title": r.get("title", ""),
                            "url": r.get("href", r.get("url", "")),
                            "body": r.get("body", ""),
                        }
                        for r in raw_results
                    ]

            logger.info(f"DuckDuckGo search returned {len(results)} results for query: {query[:50]}")

            return {"result": results}
        except Exception as e:
            logger.error(f"DuckDuckGo search failed: {e}")
            return {"error": f"DuckDuckGo search failed: {str(e)}"}
