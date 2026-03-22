"""Google Scholar search tool for agent workflows.

Searches Google Scholar for academic papers using the scholarly library.
Returns paper titles, authors, abstracts, and publication URLs.
No credentials required.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class GoogleScholarTool(BaseTool):
    """Academic paper search tool via Google Scholar.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "google_scholar"
    description = "Search Google Scholar for academic papers"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Search Google Scholar for papers matching the query.

        Args:
            input_data: Must contain 'query' key with search keywords.
            config: Optional 'max_results' (default 10), 'sort_by'
                ('relevance' | 'date'), 'year_low', 'year_high'.
            credentials: Not required for Google Scholar.

        Returns:
            Dict with 'result' containing list of papers with title, authors,
            abstract, url, and citation count.
        """
        try:
            from scholarly import scholarly
        except ImportError:
            return {"error": "scholarly not installed. Install with: pip install scholarly"}

        # Extract search parameters
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        max_results = config.get("max_results", 10)
        sort_by = config.get("sort_by", "relevance")
        year_low = config.get("year_low")
        year_high = config.get("year_high")

        try:
            # Use the scholarly library to search Google Scholar
            search_results = scholarly.search_pubs(
                query,
                sort_by=sort_by,
                year_low=year_low,
                year_high=year_high,
            )

            # Collect up to max_results papers
            results = []
            for i, paper in enumerate(search_results):
                if i >= max_results:
                    break
                bib = paper.get("bib", {})
                results.append({
                    "title": bib.get("title", ""),
                    "authors": bib.get("author", []),
                    "abstract": bib.get("abstract", ""),
                    "url": paper.get("pub_url", paper.get("eprint_url", "")),
                    "year": bib.get("pub_year", ""),
                    "citations": paper.get("num_citations", 0),
                })

            logger.info(f"Google Scholar returned {len(results)} results for query: {query[:50]}")

            return {"result": results}
        except Exception as e:
            logger.error(f"Google Scholar search failed: {e}")
            return {"error": f"Google Scholar search failed: {str(e)}"}
