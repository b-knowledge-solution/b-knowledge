"""ArXiv academic paper search tool for agent workflows.

Searches the arXiv.org API for scholarly articles in physics, mathematics,
computer science, and related fields. Returns paper titles, abstracts,
authors, and PDF URLs. No credentials required.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class ArxivTool(BaseTool):
    """ArXiv academic paper search and retrieval tool.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "arxiv"
    description = "Search arXiv.org for academic papers"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Search arXiv for papers matching the query.

        Args:
            input_data: Must contain 'query' key with search keywords.
            config: Optional 'max_results' (default 10), 'sort_by'
                ('submittedDate' | 'lastUpdatedDate' | 'relevance').
            credentials: Not required for arXiv (public API).

        Returns:
            Dict with 'result' containing list of papers with title, abstract,
            authors, pdf_url, and published date.
        """
        try:
            import arxiv
        except ImportError:
            return {"error": "arxiv library not installed. Install with: pip install arxiv"}

        # Extract search parameters from input and config
        query = input_data.get("query", input_data.get("output", ""))
        max_results = config.get("max_results", 10)
        sort_by_str = config.get("sort_by", "relevance")

        # Map string sort criteria to arxiv enum values
        sort_map = {
            "relevance": arxiv.SortCriterion.Relevance,
            "lastUpdatedDate": arxiv.SortCriterion.LastUpdatedDate,
            "submittedDate": arxiv.SortCriterion.SubmittedDate,
        }
        sort_criterion = sort_map.get(sort_by_str, arxiv.SortCriterion.Relevance)

        try:
            # Use the arxiv library client to search for papers
            client = arxiv.Client()
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=sort_criterion,
            )
            raw_results = list(client.results(search))

            # Transform results into a consistent output format
            results = []
            for paper in raw_results:
                results.append({
                    "title": paper.title,
                    "abstract": paper.summary,
                    "authors": [str(a) for a in paper.authors],
                    "pdf_url": paper.pdf_url,
                    "published": paper.published.isoformat() if paper.published else "",
                    "url": paper.entry_id,
                })

            logger.info(f"ArXiv search returned {len(results)} results for query: {query[:50]}")

            return {"result": results}
        except Exception as e:
            logger.error(f"ArXiv search failed: {e}")
            return {"error": f"ArXiv search failed: {str(e)}"}
