"""PubMed biomedical literature search tool for agent workflows.

Searches the PubMed/NCBI database via the Entrez API for biomedical and
life science articles. Returns paper titles, authors, abstracts, DOIs,
and PubMed URLs. API key is optional but increases rate limits.
"""

import re
import xml.etree.ElementTree as ET
from typing import Any

from loguru import logger

from .base_tool import BaseTool


class PubMedTool(BaseTool):
    """Biomedical literature search tool via PubMed/NCBI Entrez API.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "pubmed"
    description = "Search PubMed/NCBI for biomedical literature"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Search PubMed for articles matching the query.

        Args:
            input_data: Must contain 'query' key with search terms.
            config: Optional 'max_results' (default 10), 'email'
                (default 'bknowledge@example.com' -- required by NCBI).
            credentials: Optional 'api_key' for higher NCBI rate limits.

        Returns:
            Dict with 'result' containing list of articles with title, authors,
            abstract, journal, DOI, and PubMed URL.
        """
        try:
            from Bio import Entrez
        except ImportError:
            return {"error": "biopython not installed. Install with: pip install biopython"}

        # Extract search parameters
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        max_results = config.get("max_results", 10)
        # NCBI requires an email address for Entrez API usage
        Entrez.email = config.get("email", "bknowledge@example.com")

        # Optional API key for higher rate limits
        api_key = credentials.get("api_key") if credentials else None
        if api_key:
            Entrez.api_key = api_key

        try:
            # Step 1: Search PubMed for article IDs matching the query
            search_handle = Entrez.esearch(db="pubmed", retmax=max_results, term=query)
            search_results = Entrez.read(search_handle)
            search_handle.close()
            pmids = search_results.get("IdList", [])

            if not pmids:
                logger.info(f"PubMed search returned 0 results for query: {query[:50]}")
                return {"result": []}

            # Step 2: Fetch full article details in XML format
            fetch_handle = Entrez.efetch(db="pubmed", id=",".join(pmids), retmode="xml")
            xml_content = fetch_handle.read().decode("utf-8")
            fetch_handle.close()

            # Clean up inline HTML tags that break XML parsing
            cleaned_xml = re.sub(r"<(/?)b>|<(/?)i>|<(/?)sub>|<(/?)sup>", "", xml_content)
            root = ET.fromstring(cleaned_xml)

            # Step 3: Extract structured data from each PubMed article
            results = []
            for article_elem in root.findall("PubmedArticle"):
                parsed = self._parse_article(article_elem)
                if parsed:
                    results.append(parsed)

            logger.info(f"PubMed search returned {len(results)} results for query: {query[:50]}")
            return {"result": results}

        except Exception as e:
            logger.error(f"PubMed search failed: {e}")
            return {"error": f"PubMed search failed: {str(e)}"}

    def _parse_article(self, article_elem: ET.Element) -> dict[str, str] | None:
        """Extract structured fields from a PubMedArticle XML element.

        Args:
            article_elem: XML Element for a single PubMed article.

        Returns:
            Dict with title, authors, abstract, journal, DOI, and URL,
            or None if the element cannot be parsed.
        """
        def safe_text(path: str) -> str:
            """Safely traverse an XML path and return text content."""
            node = article_elem
            for part in path.split("/"):
                if node is None:
                    return ""
                node = node.find(part)
            return (node.text or "").strip() if node is not None else ""

        title = safe_text("MedlineCitation/Article/ArticleTitle")
        abstract = safe_text("MedlineCitation/Article/Abstract/AbstractText")
        journal = safe_text("MedlineCitation/Article/Journal/Title")
        pmid = safe_text("MedlineCitation/PMID")

        # Extract author names from the AuthorList
        authors = []
        for author in article_elem.findall(".//AuthorList/Author"):
            last = author.findtext("LastName", "")
            first = author.findtext("ForeName", "")
            full = f"{first} {last}".strip()
            if full:
                authors.append(full)

        # Extract DOI from ArticleId elements
        doi = ""
        for eid in article_elem.findall(".//ArticleId"):
            if eid.attrib.get("IdType") == "doi":
                doi = eid.text or ""
                break

        return {
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "journal": journal,
            "doi": doi,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}" if pmid else "",
        }
