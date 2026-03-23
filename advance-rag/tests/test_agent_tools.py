"""Unit tests for individual agent tool implementations.

Tests each concrete BaseTool subclass's execute() method with mocked HTTP
clients, subprocess calls, and SMTP connections. Validates input handling,
error paths, missing library fallbacks, and result format consistency.
"""
import json
import os
import subprocess
import sys
import types
from unittest.mock import MagicMock, patch

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)

# Mock httpx if not available in test environment
if "httpx" not in sys.modules:
    _httpx = types.ModuleType("httpx")
    _httpx.HTTPStatusError = type("HTTPStatusError", (Exception,), {
        "__init__": lambda self, msg="", *, request=None, response=None: (
            setattr(self, "response", response or MagicMock(status_code=500)) or
            Exception.__init__(self, msg)
        )
    })
    _httpx.RequestError = type("RequestError", (Exception,), {
        "__init__": lambda self, msg="", *, request=None: Exception.__init__(self, msg)
    })
    _httpx.get = MagicMock()
    _httpx.post = MagicMock()
    sys.modules["httpx"] = _httpx

# Ensure rag.agent.tools package and base_tool are importable
for _mod_path in ["rag.agent", "rag.agent.tools", "rag.agent.tools.base_tool"]:
    if _mod_path not in sys.modules:
        _m = types.ModuleType(_mod_path)
        _m.__path__ = [os.path.join(_ADVANCE_RAG_ROOT, *_mod_path.split("."))]
        sys.modules[_mod_path] = _m

# Import base class (real file if possible, otherwise use mock)
try:
    from rag.agent.tools.base_tool import BaseTool
except Exception:
    from abc import ABC, abstractmethod
    from typing import Any
    class BaseTool(ABC):
        name: str = ""
        description: str = ""
        @abstractmethod
        def execute(self, input_data, config, credentials=None):
            ...

# Import each tool module individually using the real source files
# Each import is wrapped to handle missing transitive deps
_tools_dir = os.path.join(_ADVANCE_RAG_ROOT, "rag", "agent", "tools")


def _import_tool_class(module_name: str, class_name: str):
    """Import a tool class from its module file, falling back to a stub.

    Args:
        module_name: Module name under rag.agent.tools (e.g., 'tavily_tool').
        class_name: Class name to extract (e.g., 'TavilyTool').

    Returns:
        The tool class, or None if import failed.
    """
    full_mod = f"rag.agent.tools.{module_name}"
    try:
        # Remove cached mock module to force real import
        if full_mod in sys.modules and not hasattr(sys.modules[full_mod], "__file__"):
            del sys.modules[full_mod]
        import importlib
        mod = importlib.import_module(full_mod)
        return getattr(mod, class_name, None)
    except Exception:
        return None


TavilyTool = _import_tool_class("tavily_tool", "TavilyTool")
WikipediaTool = _import_tool_class("wikipedia_tool", "WikipediaTool")
ArxivTool = _import_tool_class("arxiv_tool", "ArxivTool")
CrawlerTool = _import_tool_class("crawler_tool", "CrawlerTool")
GitHubTool = _import_tool_class("github_tool", "GitHubTool")
DuckDuckGoTool = _import_tool_class("duckduckgo_tool", "DuckDuckGoTool")
CodeExecTool = _import_tool_class("code_exec_tool", "CodeExecTool")
EmailTool = _import_tool_class("email_tool", "EmailTool")
ExeSQLTool = _import_tool_class("exesql_tool", "ExeSQLTool")
GoogleTool = _import_tool_class("google_tool", "GoogleTool")


# ---------------------------------------------------------------------------
# Helper: skip if class not importable
# ---------------------------------------------------------------------------

def _requires(cls):
    """Decorator to skip test class if tool class couldn't be imported."""
    return pytest.mark.skipif(cls is None, reason=f"{cls} not importable in test env")


# ---------------------------------------------------------------------------
# Tests: BaseTool abstract enforcement
# ---------------------------------------------------------------------------


class TestBaseTool:
    """Tests for BaseTool abstract base class."""

    def test_cannot_instantiate_directly(self):
        """Verify BaseTool cannot be instantiated without implementing execute()."""
        with pytest.raises(TypeError):
            BaseTool()

    def test_subclass_must_implement_execute(self):
        """Verify subclass without execute() raises TypeError."""
        class IncompleteTool(BaseTool):
            name = "incomplete"
        with pytest.raises(TypeError):
            IncompleteTool()

    def test_subclass_with_execute_is_instantiable(self):
        """Verify subclass with execute() can be instantiated."""
        class CompleteTool(BaseTool):
            name = "complete"
            description = "A complete tool"
            def execute(self, input_data, config, credentials=None):
                return {"result": "ok"}
        tool = CompleteTool()
        assert tool.name == "complete"
        assert tool.execute({}, {}) == {"result": "ok"}


# ---------------------------------------------------------------------------
# Tests: TavilyTool
# ---------------------------------------------------------------------------


@_requires(TavilyTool)
class TestTavilyTool:
    """Tests for TavilyTool web search implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = TavilyTool()
        assert tool.name == "tavily"
        assert len(tool.description) > 0

    def test_missing_api_key_returns_error(self):
        """Verify missing API key returns error dict."""
        tool = TavilyTool()
        result = tool.execute({"query": "test"}, {}, credentials=None)
        assert "error" in result

    @patch("rag.agent.tools.tavily_tool.httpx.post")
    def test_successful_search(self, mock_post):
        """Verify successful search returns results list."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "results": [{"title": "Result 1", "url": "https://example.com", "content": "text"}],
            "answer": "A summary answer",
        }
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        tool = TavilyTool()
        result = tool.execute(
            {"query": "test query"},
            {"max_results": 5},
            credentials={"api_key": "tvly-test-key"},
        )
        assert "result" in result
        assert len(result["result"]) == 1
        assert "answer" in result

    @patch("rag.agent.tools.tavily_tool.httpx.post")
    def test_http_error_returns_error(self, mock_post):
        """Verify HTTP status errors are caught and returned."""
        import httpx
        mock_response = MagicMock(status_code=401)
        mock_post.side_effect = httpx.HTTPStatusError(
            "Unauthorized", request=MagicMock(), response=mock_response
        )

        tool = TavilyTool()
        result = tool.execute(
            {"query": "test"},
            {},
            credentials={"api_key": "bad-key"},
        )
        assert "error" in result


# ---------------------------------------------------------------------------
# Tests: WikipediaTool
# ---------------------------------------------------------------------------


@_requires(WikipediaTool)
class TestWikipediaTool:
    """Tests for WikipediaTool article search implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = WikipediaTool()
        assert tool.name == "wikipedia"
        assert len(tool.description) > 0

    @patch("rag.agent.tools.wikipedia_tool.httpx.get")
    def test_successful_search(self, mock_get):
        """Verify successful Wikipedia search returns formatted results."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "query": {
                "search": [
                    {"title": "Python (programming language)", "snippet": "A programming language"},
                    {"title": "Monty Python", "snippet": "A comedy group"},
                ]
            }
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        tool = WikipediaTool()
        result = tool.execute({"query": "python"}, {"max_results": 3})
        assert "result" in result
        assert len(result["result"]) == 2
        # Verify URL format
        assert "wikipedia.org/wiki/" in result["result"][0]["url"]

    @patch("rag.agent.tools.wikipedia_tool.httpx.get")
    def test_language_parameter(self, mock_get):
        """Verify language config is used in API URL."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"query": {"search": []}}
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        tool = WikipediaTool()
        tool.execute({"query": "test"}, {"language": "ja"})
        call_url = mock_get.call_args[0][0]
        assert "ja.wikipedia.org" in call_url


# ---------------------------------------------------------------------------
# Tests: ArxivTool
# ---------------------------------------------------------------------------


@_requires(ArxivTool)
class TestArxivTool:
    """Tests for ArxivTool academic paper search implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = ArxivTool()
        assert tool.name == "arxiv"
        assert len(tool.description) > 0

    def test_missing_library_returns_error(self):
        """Verify graceful error when arxiv library not installed."""
        saved = sys.modules.pop("arxiv", None)
        try:
            import builtins
            real_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name == "arxiv":
                    raise ImportError("not installed")
                return real_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                tool = ArxivTool()
                result = tool.execute({"query": "machine learning"}, {})
            assert "error" in result
            assert "not installed" in result["error"].lower()
        finally:
            if saved is not None:
                sys.modules["arxiv"] = saved

    def test_with_mock_arxiv_library(self):
        """Verify ArxivTool works with mocked arxiv library."""
        mock_arxiv = MagicMock()
        mock_paper = MagicMock()
        mock_paper.title = "Test Paper"
        mock_paper.summary = "Abstract text"
        mock_paper.authors = [MagicMock(__str__=lambda s: "Author One")]
        mock_paper.pdf_url = "https://arxiv.org/pdf/1234.pdf"
        mock_paper.published = MagicMock(isoformat=lambda: "2024-01-01T00:00:00")
        mock_paper.entry_id = "https://arxiv.org/abs/1234"

        mock_client = MagicMock()
        mock_client.results.return_value = [mock_paper]
        mock_arxiv.Client.return_value = mock_client
        mock_arxiv.Search = MagicMock()
        mock_arxiv.SortCriterion = MagicMock()
        mock_arxiv.SortCriterion.Relevance = "relevance"

        with patch.dict(sys.modules, {"arxiv": mock_arxiv}):
            tool = ArxivTool()
            result = tool.execute({"query": "neural networks"}, {"max_results": 5})
        assert "result" in result
        assert len(result["result"]) == 1
        assert result["result"][0]["title"] == "Test Paper"


# ---------------------------------------------------------------------------
# Tests: CrawlerTool
# ---------------------------------------------------------------------------


@_requires(CrawlerTool)
class TestCrawlerTool:
    """Tests for CrawlerTool URL content extraction implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = CrawlerTool()
        assert tool.name == "crawler"

    def test_empty_url_returns_error(self):
        """Verify empty URL returns error dict."""
        tool = CrawlerTool()
        result = tool.execute({}, {})
        assert "error" in result

    @patch("rag.agent.tools.crawler_tool.httpx.get")
    def test_extracts_text_from_html(self, mock_get):
        """Verify text extraction from HTML response."""
        mock_resp = MagicMock()
        mock_resp.text = "<html><head><title>Page</title></head><body><p>Content here</p></body></html>"
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        # Mock BeautifulSoup
        mock_soup = MagicMock()
        mock_soup.title = MagicMock()
        mock_soup.title.string = "Page"
        mock_soup.get_text.return_value = "Content here"

        with patch("rag.agent.tools.crawler_tool.BeautifulSoup", return_value=mock_soup):
            tool = CrawlerTool()
            result = tool.execute({"url": "https://example.com"}, {})
        assert "result" in result
        assert result["result"]["title"] == "Page"

    def test_adds_https_prefix(self):
        """Verify tool adds https:// to bare domains."""
        tool = CrawlerTool()
        # This will fail at the HTTP call, but we can verify URL normalization
        with patch("rag.agent.tools.crawler_tool.httpx.get") as mock_get:
            mock_resp = MagicMock()
            mock_resp.text = "<html><body>test</body></html>"
            mock_resp.raise_for_status = MagicMock()
            mock_get.return_value = mock_resp

            mock_soup = MagicMock()
            mock_soup.title = None
            mock_soup.get_text.return_value = "test"

            with patch("rag.agent.tools.crawler_tool.BeautifulSoup", return_value=mock_soup):
                tool.execute({"url": "example.com"}, {})
            # Verify the URL was normalized
            call_url = mock_get.call_args[0][0]
            assert call_url.startswith("https://")


# ---------------------------------------------------------------------------
# Tests: GitHubTool
# ---------------------------------------------------------------------------


@_requires(GitHubTool)
class TestGitHubTool:
    """Tests for GitHubTool repository search and content retrieval."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = GitHubTool()
        assert tool.name == "github"

    @patch("rag.agent.tools.github_tool.httpx.get")
    def test_search_repos(self, mock_get):
        """Verify repo search calls the correct API endpoint."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "items": [
                {"full_name": "owner/repo", "description": "A repo", "html_url": "https://github.com/owner/repo",
                 "stargazers_count": 100, "language": "Python"}
            ]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        tool = GitHubTool()
        result = tool.execute(
            {"query": "machine learning"},
            {"action": "search"},
            credentials={"token": "ghp_test"},
        )
        assert "result" in result
        assert len(result["result"]) == 1
        assert result["result"][0]["name"] == "owner/repo"

    def test_search_repos_empty_query_returns_error(self):
        """Verify empty query for search returns error."""
        tool = GitHubTool()
        result = tool.execute({"query": ""}, {"action": "search"})
        assert "error" in result

    @patch("rag.agent.tools.github_tool.httpx.get")
    def test_get_file_content(self, mock_get):
        """Verify get_file retrieves and decodes base64 content."""
        import base64
        encoded = base64.b64encode(b"# README\nHello").decode()
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"path": "README.md", "content": encoded}
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        tool = GitHubTool()
        result = tool.execute(
            {"repo": "owner/repo", "path": "README.md"},
            {"action": "get_file"},
        )
        assert "result" in result
        assert "README" in result["result"]["content"]

    def test_get_file_missing_repo_returns_error(self):
        """Verify get_file without repo param returns error."""
        tool = GitHubTool()
        result = tool.execute({}, {"action": "get_file"})
        assert "error" in result

    @patch("rag.agent.tools.github_tool.httpx.get")
    def test_list_issues(self, mock_get):
        """Verify list_issues retrieves issue summaries."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            {"number": 1, "title": "Bug report", "html_url": "https://github.com/o/r/issues/1",
             "state": "open", "labels": [{"name": "bug"}]},
        ]
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        tool = GitHubTool()
        result = tool.execute(
            {"repo": "owner/repo"},
            {"action": "list_issues"},
        )
        assert "result" in result
        assert result["result"][0]["number"] == 1


# ---------------------------------------------------------------------------
# Tests: DuckDuckGoTool
# ---------------------------------------------------------------------------


@_requires(DuckDuckGoTool)
class TestDuckDuckGoTool:
    """Tests for DuckDuckGoTool privacy-focused search implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = DuckDuckGoTool()
        assert tool.name == "duckduckgo"

    def test_missing_library_returns_error(self):
        """Verify graceful error when duckduckgo_search not installed."""
        saved = sys.modules.pop("duckduckgo_search", None)
        try:
            import builtins
            real_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name == "duckduckgo_search":
                    raise ImportError("not installed")
                return real_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                tool = DuckDuckGoTool()
                result = tool.execute({"query": "test"}, {})
            assert "error" in result
        finally:
            if saved is not None:
                sys.modules["duckduckgo_search"] = saved

    def test_empty_query_returns_error(self):
        """Verify empty query returns error dict."""
        # Mock DDGS so we can test the query validation
        mock_ddgs = MagicMock()
        with patch.dict(sys.modules, {"duckduckgo_search": mock_ddgs}):
            tool = DuckDuckGoTool()
            result = tool.execute({"query": ""}, {})
        assert "error" in result


# ---------------------------------------------------------------------------
# Tests: CodeExecTool
# ---------------------------------------------------------------------------


@_requires(CodeExecTool)
class TestCodeExecTool:
    """Tests for CodeExecTool sandboxed Python execution."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = CodeExecTool()
        assert tool.name == "code_exec"

    def test_empty_code_returns_error(self):
        """Verify empty code string returns error."""
        tool = CodeExecTool()
        result = tool.execute({}, {"code": ""})
        assert "error" in result

    @patch("rag.agent.tools.code_exec_tool.subprocess.run")
    def test_successful_execution(self, mock_run):
        """Verify successful code execution returns parsed JSON."""
        mock_run.return_value = MagicMock(
            stdout='{"answer": 42}', stderr="", returncode=0
        )
        tool = CodeExecTool()
        result = tool.execute(
            {},
            {"code": "def main():\n    return {'answer': 42}"},
        )
        assert "result" in result
        assert result["result"]["answer"] == 42

    @patch("rag.agent.tools.code_exec_tool.subprocess.run")
    def test_timeout_returns_error(self, mock_run):
        """Verify subprocess timeout returns error dict."""
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="python", timeout=30)
        tool = CodeExecTool()
        result = tool.execute({}, {"code": "def main(): pass", "timeout": 30})
        assert "error" in result
        assert "timed out" in result["error"].lower()

    @patch("rag.agent.tools.code_exec_tool.subprocess.run")
    def test_nonzero_exit_returns_error(self, mock_run):
        """Verify non-zero exit code returns error."""
        mock_run.return_value = MagicMock(
            stdout="", stderr="NameError: name 'x' is not defined", returncode=1
        )
        tool = CodeExecTool()
        result = tool.execute({}, {"code": "def main(): return x"})
        assert "error" in result


# ---------------------------------------------------------------------------
# Tests: EmailTool
# ---------------------------------------------------------------------------


@_requires(EmailTool)
class TestEmailTool:
    """Tests for EmailTool SMTP email sending implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = EmailTool()
        assert tool.name == "email"

    def test_missing_credentials_returns_error(self):
        """Verify missing SMTP credentials returns error."""
        tool = EmailTool()
        result = tool.execute({"to_email": "test@example.com"}, {}, credentials=None)
        assert "error" in result

    def test_missing_recipient_returns_error(self):
        """Verify missing to_email returns error."""
        tool = EmailTool()
        result = tool.execute(
            {},
            {},
            credentials={"smtp_host": "smtp.test.com", "smtp_port": "587",
                         "username": "user", "password": "pass"},
        )
        assert "error" in result

    def test_incomplete_smtp_config_returns_error(self):
        """Verify incomplete SMTP credentials returns error."""
        tool = EmailTool()
        result = tool.execute(
            {"to_email": "test@example.com"},
            {},
            credentials={"smtp_host": "", "username": "", "password": ""},
        )
        assert "error" in result


# ---------------------------------------------------------------------------
# Tests: ExeSQLTool
# ---------------------------------------------------------------------------


@_requires(ExeSQLTool)
class TestExeSQLTool:
    """Tests for ExeSQLTool database query execution implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = ExeSQLTool()
        assert tool.name == "exesql"

    def test_missing_credentials_returns_error(self):
        """Verify missing credentials returns error."""
        tool = ExeSQLTool()
        result = tool.execute({"sql": "SELECT 1"}, {}, credentials=None)
        assert "error" in result

    def test_empty_sql_returns_error(self):
        """Verify empty SQL statement returns error."""
        tool = ExeSQLTool()
        result = tool.execute(
            {},
            {},
            credentials={"host": "localhost", "port": "5432",
                         "database": "testdb", "username": "user", "password": "pass"},
        )
        assert "error" in result

    def test_missing_database_returns_error(self):
        """Verify missing database name in credentials returns error."""
        tool = ExeSQLTool()
        result = tool.execute(
            {"sql": "SELECT 1"},
            {},
            credentials={"host": "localhost", "port": "5432",
                         "database": "", "username": "user", "password": "pass"},
        )
        assert "error" in result

    def test_unsupported_db_type_returns_error(self):
        """Verify unsupported database type returns error."""
        tool = ExeSQLTool()
        result = tool.execute(
            {"sql": "SELECT 1"},
            {"db_type": "oracle"},
            credentials={"host": "localhost", "port": "1521",
                         "database": "testdb", "username": "user", "password": "pass"},
        )
        assert "error" in result
        assert "Unsupported" in result["error"]


# ---------------------------------------------------------------------------
# Tests: GoogleTool
# ---------------------------------------------------------------------------


@_requires(GoogleTool)
class TestGoogleTool:
    """Tests for GoogleTool Custom Search API implementation."""

    def test_name_and_description_set(self):
        """Verify tool name and description are populated."""
        tool = GoogleTool()
        assert tool.name == "google"

    def test_missing_credentials_returns_error(self):
        """Verify missing api_key or cx returns error."""
        tool = GoogleTool()
        result = tool.execute({"query": "test"}, {}, credentials=None)
        assert "error" in result

    def test_missing_query_returns_error(self):
        """Verify empty query returns error."""
        tool = GoogleTool()
        result = tool.execute(
            {"query": ""},
            {},
            credentials={"api_key": "key", "cx": "cx"},
        )
        assert "error" in result

    @patch("rag.agent.tools.google_tool.httpx.get")
    def test_successful_search(self, mock_get):
        """Verify successful search returns formatted results."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "items": [
                {"title": "Result", "link": "https://example.com", "snippet": "Snippet text"}
            ]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        tool = GoogleTool()
        result = tool.execute(
            {"query": "test"},
            {"max_results": 5},
            credentials={"api_key": "key", "cx": "cx123"},
        )
        assert "result" in result
        assert len(result["result"]) == 1
        assert result["result"][0]["title"] == "Result"

    @patch("rag.agent.tools.google_tool.httpx.get")
    def test_max_results_capped_at_10(self, mock_get):
        """Verify max_results is capped at 10 per Google API limits."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"items": []}
        mock_resp.raise_for_status = MagicMock()
        mock_get.return_value = mock_resp

        tool = GoogleTool()
        tool.execute(
            {"query": "test"},
            {"max_results": 50},
            credentials={"api_key": "key", "cx": "cx"},
        )
        # Verify the num parameter is capped at 10
        call_params = mock_get.call_args[1]["params"]
        assert call_params["num"] <= 10


# ---------------------------------------------------------------------------
# Tests: All tools return dict with 'result' or 'error' key
# ---------------------------------------------------------------------------


class TestToolReturnFormat:
    """Tests verifying all tools return dicts with expected keys."""

    @pytest.mark.parametrize("tool_cls,input_data,config,creds", [
        (TavilyTool, {"query": "test"}, {}, None),
        (WikipediaTool, {"query": ""}, {}, None),
        (GoogleTool, {"query": "test"}, {}, None),
        (EmailTool, {}, {}, None),
        (ExeSQLTool, {"sql": "SELECT 1"}, {}, None),
        (CodeExecTool, {}, {"code": ""}, None),
    ])
    def test_returns_dict_with_result_or_error(self, tool_cls, input_data, config, creds):
        """Verify every tool returns a dict with 'result' or 'error'."""
        if tool_cls is None:
            pytest.skip("Tool class not importable")
        tool = tool_cls()
        result = tool.execute(input_data, config, creds)
        assert isinstance(result, dict)
        assert "result" in result or "error" in result
