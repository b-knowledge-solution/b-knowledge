"""Web crawler tool for agent workflows.

Fetches a URL and extracts text content using requests and BeautifulSoup.
Returns the page title and cleaned text content. No credentials required.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class CrawlerTool(BaseTool):
    """URL content extraction tool using requests and BeautifulSoup.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "crawler"
    description = "Crawl a URL and extract text content"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Fetch a URL and extract its text content.

        Args:
            input_data: Must contain 'url' or 'query' or 'output' with the target URL.
            config: Optional 'extract_type' ('text' | 'html' | 'markdown', default 'text'),
                'timeout' in seconds (default 15).
            credentials: Not required for public web crawling.

        Returns:
            Dict with 'result' containing 'title', 'content', and 'url'.
        """
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            return {"error": "beautifulsoup4 not installed. Install with: pip install beautifulsoup4"}

        import httpx

        # Resolve URL from input_data keys in priority order
        url = input_data.get("url", input_data.get("query", input_data.get("output", "")))
        if not url or not url.strip():
            return {"error": "No URL provided for crawling"}

        url = url.strip()
        # Basic URL validation
        if not url.startswith(("http://", "https://")):
            url = "https://" + url

        extract_type = config.get("extract_type", "text")
        timeout = config.get("timeout", 15)

        try:
            # Fetch the page with a browser-like User-Agent to avoid blocking
            response = httpx.get(
                url,
                timeout=float(timeout),
                headers={"User-Agent": "Mozilla/5.0 (compatible; BKnowledgeBot/1.0)"},
                follow_redirects=True,
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            # Extract page title from <title> tag
            title = soup.title.string.strip() if soup.title and soup.title.string else ""

            # Remove script and style elements before extracting text
            for element in soup(["script", "style", "nav", "footer", "header"]):
                element.decompose()

            if extract_type == "html":
                content = str(soup)
            elif extract_type == "markdown":
                # Simple markdown-like extraction: headings + paragraphs
                parts = []
                for tag in soup.find_all(["h1", "h2", "h3", "h4", "p", "li"]):
                    text = tag.get_text(strip=True)
                    if not text:
                        continue
                    # Prefix headings with markdown-style hashes
                    if tag.name.startswith("h"):
                        level = int(tag.name[1])
                        parts.append(f"{'#' * level} {text}")
                    elif tag.name == "li":
                        parts.append(f"- {text}")
                    else:
                        parts.append(text)
                content = "\n\n".join(parts)
            else:
                # Default: plain text extraction
                content = soup.get_text(separator="\n", strip=True)

            logger.info(f"Crawled URL {url[:60]}, content length={len(content)}")

            return {"result": {"title": title, "content": content, "url": url}}

        except httpx.HTTPStatusError as e:
            logger.error(f"Crawler HTTP error: status={e.response.status_code} url={url[:60]}")
            return {"error": f"HTTP error {e.response.status_code} for URL: {url}"}
        except httpx.RequestError as e:
            logger.error(f"Crawler request failed: {e}")
            return {"error": f"Request failed for URL {url}: {str(e)}"}
        except Exception as e:
            logger.error(f"Crawler error: {e}")
            return {"error": f"Crawler error: {str(e)}"}
