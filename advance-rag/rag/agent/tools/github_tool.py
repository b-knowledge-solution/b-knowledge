"""GitHub API tool for agent workflows.

Searches GitHub repositories, retrieves file contents, and lists issues
using the GitHub REST API. Optionally uses a personal access token for
higher rate limits.
"""

from typing import Any

import httpx
from loguru import logger

from .base_tool import BaseTool


class GitHubTool(BaseTool):
    """GitHub repository search and content retrieval tool.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "github"
    description = "Search GitHub repos, get file content, list issues"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute a GitHub API operation.

        Args:
            input_data: Must contain 'query' for repo search, or 'repo' + 'path'
                for file content, or 'repo' + 'action' for issue listing.
            config: Optional 'max_results' (default 10), 'action'
                ('search' | 'get_file' | 'list_issues', default 'search').
            credentials: Optional 'token' for GitHub personal access token.

        Returns:
            Dict with 'result' containing search results, file content, or issues.
        """
        # Build request headers with optional authentication
        token = credentials.get("token") if credentials else None
        headers: dict[str, str] = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"

        action = config.get("action", "search")
        max_results = config.get("max_results", 10)

        try:
            if action == "get_file":
                return self._get_file_content(input_data, headers)
            elif action == "list_issues":
                return self._list_issues(input_data, headers, max_results)
            else:
                return self._search_repos(input_data, headers, max_results)
        except httpx.HTTPStatusError as e:
            logger.error(f"GitHub API error: status={e.response.status_code}")
            return {"error": f"GitHub API error: {e.response.status_code}"}
        except httpx.RequestError as e:
            logger.error(f"GitHub request failed: {e}")
            return {"error": f"GitHub request failed: {str(e)}"}

    def _search_repos(
        self, input_data: dict[str, Any], headers: dict[str, str], max_results: int
    ) -> dict[str, Any]:
        """Search GitHub repositories by keyword.

        Args:
            input_data: Contains 'query' with search keywords.
            headers: HTTP headers including authentication.
            max_results: Maximum number of repos to return.

        Returns:
            Dict with 'result' list of repository summaries.
        """
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No search query provided"}

        response = httpx.get(
            "https://api.github.com/search/repositories",
            params={"q": query, "sort": "stars", "order": "desc", "per_page": max_results},
            headers=headers,
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()

        results = [
            {
                "name": repo["full_name"],
                "description": repo.get("description", ""),
                "url": repo["html_url"],
                "stars": repo.get("stargazers_count", 0),
                "language": repo.get("language", ""),
            }
            for repo in data.get("items", [])
        ]

        logger.info(f"GitHub search returned {len(results)} repos for query: {query[:50]}")
        return {"result": results}

    def _get_file_content(
        self, input_data: dict[str, Any], headers: dict[str, str]
    ) -> dict[str, Any]:
        """Retrieve file content from a GitHub repository.

        Args:
            input_data: Must contain 'repo' (owner/name) and 'path' (file path).
            headers: HTTP headers including authentication.

        Returns:
            Dict with 'result' containing decoded file content.
        """
        repo = input_data.get("repo", "")
        path = input_data.get("path", "")
        if not repo or not path:
            return {"error": "Both 'repo' (owner/name) and 'path' are required"}

        response = httpx.get(
            f"https://api.github.com/repos/{repo}/contents/{path}",
            headers=headers,
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()

        # Decode base64-encoded file content
        import base64
        content = base64.b64decode(data.get("content", "")).decode("utf-8")

        return {"result": {"path": data.get("path", path), "content": content}}

    def _list_issues(
        self, input_data: dict[str, Any], headers: dict[str, str], max_results: int
    ) -> dict[str, Any]:
        """List issues for a GitHub repository.

        Args:
            input_data: Must contain 'repo' (owner/name).
            headers: HTTP headers including authentication.
            max_results: Maximum number of issues to return.

        Returns:
            Dict with 'result' list of issue summaries.
        """
        repo = input_data.get("repo", "")
        if not repo:
            return {"error": "'repo' (owner/name) is required for listing issues"}

        response = httpx.get(
            f"https://api.github.com/repos/{repo}/issues",
            params={"per_page": max_results, "state": "open"},
            headers=headers,
            timeout=15.0,
        )
        response.raise_for_status()
        issues = response.json()

        results = [
            {
                "number": issue["number"],
                "title": issue["title"],
                "url": issue["html_url"],
                "state": issue["state"],
                "labels": [l["name"] for l in issue.get("labels", [])],
            }
            for issue in issues
        ]

        logger.info(f"GitHub listed {len(results)} issues for repo: {repo}")
        return {"result": results}
