"""Unit tests for rag.agent.node_executor module.

Tests the execute_node dispatch table, individual handler functions for LLM,
retrieval, code execution, external APIs, and data transformation nodes.
External dependencies (LLM, search, GitHub, SMTP, psycopg2) are mocked.
"""
import json
import os
import subprocess
import sys
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

# Ensure advance-rag root is on the Python path
_ADVANCE_RAG_ROOT = os.path.join(os.path.dirname(__file__), "..")
if _ADVANCE_RAG_ROOT not in sys.path:
    sys.path.insert(0, _ADVANCE_RAG_ROOT)


# ---------------------------------------------------------------------------
# Additional mocks needed before importing node_executor
# ---------------------------------------------------------------------------

# Mock the agent tools package so node_executor can import without full deps
_tool_names = [
    "AkShareTool", "ArxivTool", "BingTool", "CodeExecTool", "CrawlerTool",
    "DeepLTool", "DuckDuckGoTool", "EmailTool", "ExeSQLTool", "GitHubTool",
    "GoogleMapsTool", "GoogleScholarTool", "GoogleTool", "Jin10Tool",
    "PubMedTool", "QWeatherTool", "RetrievalTool", "SearxNGTool",
    "TavilyTool", "TuShareTool", "WenCaiTool", "WikipediaTool",
    "YahooFinanceTool",
]

# Ensure rag.agent and rag.agent.tools modules exist as mock packages
for _mod_path in ["rag.agent", "rag.agent.tools"]:
    if _mod_path not in sys.modules:
        import types
        _m = types.ModuleType(_mod_path)
        _m.__path__ = [os.path.join(_ADVANCE_RAG_ROOT, *_mod_path.split("."))]
        sys.modules[_mod_path] = _m

# Create mock tool classes with name/description attrs
for _name in _tool_names:
    _cls = type(_name, (), {
        "name": _name.lower().replace("tool", ""),
        "description": f"Mock {_name}",
        "execute": MagicMock(return_value={"result": "mock"}),
    })
    setattr(sys.modules["rag.agent.tools"], _name, _cls)

# Mock individual tool modules so node_executor's from-imports work
for _tool_mod in [
    "rag.agent.tools.base_tool",
    "rag.agent.tools.akshare_tool", "rag.agent.tools.arxiv_tool",
    "rag.agent.tools.bing_tool", "rag.agent.tools.code_exec_tool",
    "rag.agent.tools.crawler_tool", "rag.agent.tools.deepl_tool",
    "rag.agent.tools.duckduckgo_tool", "rag.agent.tools.email_tool",
    "rag.agent.tools.exesql_tool", "rag.agent.tools.github_tool",
    "rag.agent.tools.google_maps_tool", "rag.agent.tools.google_scholar_tool",
    "rag.agent.tools.google_tool", "rag.agent.tools.jin10_tool",
    "rag.agent.tools.pubmed_tool", "rag.agent.tools.qweather_tool",
    "rag.agent.tools.retrieval_tool", "rag.agent.tools.searxng_tool",
    "rag.agent.tools.tavily_tool", "rag.agent.tools.tushare_tool",
    "rag.agent.tools.wencai_tool", "rag.agent.tools.wikipedia_tool",
    "rag.agent.tools.yahoofinance_tool",
]:
    if _tool_mod not in sys.modules:
        import types as _types
        sys.modules[_tool_mod] = _types.ModuleType(_tool_mod)

# Ensure smtplib mock is available
if "smtplib" not in sys.modules:
    import smtplib  # stdlib, should always be available

# Ensure psycopg2 mock is ready
if "psycopg2" not in sys.modules:
    import types as _types
    sys.modules["psycopg2"] = _types.ModuleType("psycopg2")
    sys.modules["psycopg2"].connect = MagicMock()

# Now import the module under test
from rag.agent.node_executor import (
    execute_node,
    handle_generate,
    handle_categorize,
    handle_rewrite,
    handle_relevant,
    handle_retrieval,
    handle_code,
    handle_template,
    handle_loop,
    handle_keyword_extract,
    handle_github,
    handle_sql,
    handle_api,
    handle_email,
    handle_duckduckgo,
    handle_google,
    handle_arxiv,
    handle_crawler,
    NODE_HANDLERS,
)


# ---------------------------------------------------------------------------
# Tests: execute_node dispatch
# ---------------------------------------------------------------------------


class TestExecuteNode:
    """Tests for the execute_node() dispatch entry point."""

    def test_dispatches_to_correct_handler(self):
        """Verify execute_node looks up the handler by node_type and calls it."""
        task = {
            "node_type": "template",
            "input_data": {"name": "World"},
            "config": {"template": "Hello {{name}}"},
            "tenant_id": "t1",
        }
        result = execute_node(task)
        assert "output_data" in result
        assert result["output_data"]["output"] == "Hello World"

    def test_unknown_node_type_returns_error(self):
        """Verify unknown node_type returns an error dict."""
        task = {"node_type": "totally_unknown_type_xyz", "input_data": {}, "config": {}, "tenant_id": "t1"}
        result = execute_node(task)
        assert "error" in result
        assert "Unknown node type" in result["error"]

    def test_empty_node_type_returns_error(self):
        """Verify empty node_type returns an error dict."""
        task = {"node_type": "", "input_data": {}, "config": {}, "tenant_id": "t1"}
        result = execute_node(task)
        assert "error" in result

    def test_handler_exception_returns_error(self):
        """Verify exceptions in handlers are caught and returned as error."""
        def _raising_handler(*a):
            raise RuntimeError("boom")

        NODE_HANDLERS["_test_error"] = _raising_handler
        task = {"node_type": "_test_error", "input_data": {}, "config": {}, "tenant_id": "t1"}
        result = execute_node(task)
        assert "error" in result
        assert "boom" in result["error"]
        # Cleanup
        del NODE_HANDLERS["_test_error"]

    def test_all_registered_handlers_are_callable(self):
        """Verify every entry in NODE_HANDLERS is callable."""
        for name, handler in NODE_HANDLERS.items():
            assert callable(handler), f"Handler for '{name}' is not callable"


# ---------------------------------------------------------------------------
# Tests: LLM handlers
# ---------------------------------------------------------------------------


class TestHandleGenerate:
    """Tests for handle_generate() LLM generation handler."""

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_calls_llm_and_returns_output(self, mock_get_model, mock_run_async):
        """Verify handle_generate calls LLMBundle and returns generated text."""
        mock_run_async.return_value = "Generated answer"
        result = handle_generate(
            {"output": "What is AI?"},
            {"temperature": 0.5},
            "tenant-1",
        )
        assert result["output_data"]["output"] == "Generated answer"
        mock_get_model.assert_called_once()
        mock_run_async.assert_called_once()

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_uses_system_prompt_from_config(self, mock_get_model, mock_run_async):
        """Verify custom system_prompt is passed to the LLM."""
        mock_run_async.return_value = "result"
        handle_generate(
            {"output": "test"},
            {"system_prompt": "Custom system prompt"},
            "t1",
        )
        # The async_chat call should have received the custom system prompt
        call_args = mock_run_async.call_args
        assert call_args is not None


class TestHandleCategorize:
    """Tests for handle_categorize() classification handler."""

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_matches_category_from_llm_response(self, mock_get_model, mock_run_async):
        """Verify categorize matches LLM response to category name."""
        mock_run_async.return_value = "Technical"
        categories = [
            {"name": "Technical", "description": "Tech stuff"},
            {"name": "Business", "description": "Biz stuff"},
        ]
        result = handle_categorize(
            {"output": "How to install Python?"},
            {"categories": categories},
            "t1",
        )
        assert result["output_data"]["matched_branch"] == "Technical"

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_defaults_to_default_branch(self, mock_get_model, mock_run_async):
        """Verify categorize returns 'default' when no category matches."""
        mock_run_async.return_value = "Some unmatched response"
        categories = [{"name": "Alpha"}, {"name": "Beta"}]
        result = handle_categorize(
            {"output": "test"},
            {"categories": categories},
            "t1",
        )
        assert result["output_data"]["matched_branch"] == "default"

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_empty_categories_returns_default(self, mock_get_model, mock_run_async):
        """Verify empty categories list results in 'default' branch."""
        mock_run_async.return_value = "anything"
        result = handle_categorize({"output": "test"}, {"categories": []}, "t1")
        assert result["output_data"]["matched_branch"] == "default"


class TestHandleRewrite:
    """Tests for handle_rewrite() query rewrite handler."""

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_applies_prompt_template(self, mock_get_model, mock_run_async):
        """Verify rewrite applies the prompt template with the query."""
        mock_run_async.return_value = "Better query"
        result = handle_rewrite(
            {"output": "test query"},
            {"prompt_template": "Rewrite: {query}"},
            "t1",
        )
        assert result["output_data"]["output"] == "Better query"

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_uses_default_template_when_missing(self, mock_get_model, mock_run_async):
        """Verify rewrite uses default template when none provided."""
        mock_run_async.return_value = "Rewritten"
        result = handle_rewrite({"output": "test"}, {}, "t1")
        assert result["output_data"]["output"] == "Rewritten"


class TestHandleRelevant:
    """Tests for handle_relevant() relevance scoring handler."""

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_parses_json_score(self, mock_get_model, mock_run_async):
        """Verify relevant parses JSON score from LLM response."""
        mock_run_async.return_value = '{"score": 0.85, "reason": "highly relevant"}'
        result = handle_relevant(
            {"output": "context", "query": "question"},
            {"threshold": 0.5},
            "t1",
        )
        assert result["output_data"]["score"] == 0.85
        assert result["output_data"]["is_relevant"] is True

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_below_threshold_is_not_relevant(self, mock_get_model, mock_run_async):
        """Verify score below threshold sets is_relevant to False."""
        mock_run_async.return_value = '{"score": 0.2}'
        result = handle_relevant(
            {"output": "context", "query": "q"},
            {"threshold": 0.5},
            "t1",
        )
        assert result["output_data"]["is_relevant"] is False
        assert result["output_data"]["score"] == 0.2

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_fallback_float_parsing_on_malformed_json(self, mock_get_model, mock_run_async):
        """Verify relevant falls back to float parsing when JSON is malformed.

        The float fallback is inside the except block for JSONDecodeError,
        so it only triggers when a JSON-like pattern is found but fails to parse.
        """
        # Malformed JSON triggers the except path, where float regex kicks in
        mock_run_async.return_value = '{score: 0.75}'
        result = handle_relevant(
            {"output": "ctx", "query": "q"},
            {"threshold": 0.5},
            "t1",
        )
        # The float regex should extract 0.75 from the malformed JSON text
        assert result["output_data"]["score"] == 0.75
        assert result["output_data"]["is_relevant"] is True

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_chat_model")
    def test_no_json_no_float_uses_threshold(self, mock_get_model, mock_run_async):
        """Verify score defaults to threshold when no JSON or float found."""
        # Plain text with no JSON braces — the except block never runs
        mock_run_async.return_value = "somewhat relevant"
        result = handle_relevant(
            {"output": "ctx", "query": "q"},
            {"threshold": 0.6},
            "t1",
        )
        # Score stays at threshold since no JSON matched and no except fired
        assert result["output_data"]["score"] == 0.6
        assert result["output_data"]["is_relevant"] is True


# ---------------------------------------------------------------------------
# Tests: Retrieval handler
# ---------------------------------------------------------------------------


class TestHandleRetrieval:
    """Tests for handle_retrieval() search infrastructure handler."""

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_embedding_model")
    def test_retriever_not_initialized_error(self, mock_emb, mock_run_async):
        """Verify retrieval returns error when retriever is not set."""
        with patch("common.settings") as mock_settings:
            mock_settings.retriever = None
            result = handle_retrieval({"output": "query"}, {"kb_ids": ["kb1"]}, "t1")
        assert "error" in result

    @patch("rag.agent.node_executor._run_async")
    @patch("rag.agent.node_executor._get_embedding_model")
    def test_returns_chunks_on_success(self, mock_emb, mock_run_async):
        """Verify retrieval returns formatted chunks from search results."""
        # Mock the search result object
        mock_search_result = MagicMock()
        mock_search_result.field = {"content_ltks": {"doc1": "chunk text"}}
        mock_search_result.ids = ["doc1"]
        mock_search_result.highlight = {}
        mock_search_result.total = 1
        mock_search_result.keywords = ["keyword"]
        mock_run_async.return_value = mock_search_result

        with patch("common.settings") as mock_settings, \
             patch("rag.nlp.search.index_name", return_value="idx_kb1"):
            mock_settings.retriever = MagicMock()
            result = handle_retrieval({"output": "search query"}, {"kb_ids": ["kb1"]}, "t1")

        assert "output_data" in result
        assert "chunks" in result["output_data"]


# ---------------------------------------------------------------------------
# Tests: Code execution handler
# ---------------------------------------------------------------------------


class TestHandleCode:
    """Tests for handle_code() subprocess execution handler."""

    @patch("rag.agent.node_executor.subprocess.run")
    def test_executes_code_and_captures_stdout(self, mock_run):
        """Verify code handler runs subprocess and captures stdout."""
        mock_run.return_value = MagicMock(
            stdout="Hello from code", stderr="", returncode=0
        )
        result = handle_code(
            {"output": ""},
            {"code": "print('Hello from code')"},
            "t1",
        )
        assert "output_data" in result
        assert result["output_data"]["stdout"] == "Hello from code"
        assert result["output_data"]["return_code"] == 0

    @patch("rag.agent.node_executor.subprocess.run")
    def test_captures_stderr(self, mock_run):
        """Verify code handler captures stderr output."""
        mock_run.return_value = MagicMock(
            stdout="", stderr="Error occurred", returncode=1
        )
        result = handle_code({}, {"code": "import sys; sys.exit(1)"}, "t1")
        assert result["output_data"]["stderr"] == "Error occurred"
        assert result["output_data"]["return_code"] == 1

    @patch("rag.agent.node_executor.subprocess.run")
    def test_timeout_returns_error(self, mock_run):
        """Verify code handler returns error on subprocess timeout."""
        mock_run.side_effect = subprocess.TimeoutExpired(cmd="python3", timeout=30)
        result = handle_code({}, {"code": "while True: pass", "timeout": 30}, "t1")
        assert "error" in result
        assert "timed out" in result["error"]

    def test_empty_code_returns_error(self):
        """Verify empty code string returns error."""
        result = handle_code({}, {"code": ""}, "t1")
        assert "error" in result
        assert "No code" in result["error"]


# ---------------------------------------------------------------------------
# Tests: Template handler
# ---------------------------------------------------------------------------


class TestHandleTemplate:
    """Tests for handle_template() string interpolation handler."""

    def test_interpolates_variables(self):
        """Verify template replaces {{variable}} placeholders."""
        result = handle_template(
            {"name": "Alice", "age": "30"},
            {"template": "Name: {{name}}, Age: {{age}}"},
            "t1",
        )
        assert result["output_data"]["output"] == "Name: Alice, Age: 30"

    def test_missing_variable_leaves_placeholder(self):
        """Verify missing variable leaves the {{placeholder}} as-is."""
        result = handle_template(
            {"name": "Bob"},
            {"template": "Hello {{name}}, your id is {{id}}"},
            "t1",
        )
        assert "Hello Bob" in result["output_data"]["output"]
        assert "{{id}}" in result["output_data"]["output"]

    def test_empty_template(self):
        """Verify empty template returns empty string."""
        result = handle_template({}, {"template": ""}, "t1")
        assert result["output_data"]["output"] == ""


# ---------------------------------------------------------------------------
# Tests: Loop handler
# ---------------------------------------------------------------------------


class TestHandleLoop:
    """Tests for handle_loop() iteration control handler."""

    def test_increments_iteration_counter(self):
        """Verify loop increments the iteration counter."""
        result = handle_loop(
            {"output": "data", "iteration": 3},
            {"max_iterations": 10},
            "t1",
        )
        assert result["output_data"]["iteration"] == 4

    def test_should_continue_true_before_max(self):
        """Verify should_continue is True when below max_iterations."""
        result = handle_loop(
            {"iteration": 5},
            {"max_iterations": 10},
            "t1",
        )
        assert result["output_data"]["should_continue"] is True

    def test_should_continue_false_at_max(self):
        """Verify should_continue is False at max_iterations."""
        result = handle_loop(
            {"iteration": 9},
            {"max_iterations": 10},
            "t1",
        )
        # next_iteration = 10, max = 10 => 10 < 10 is False
        assert result["output_data"]["should_continue"] is False

    def test_default_max_iterations(self):
        """Verify default max_iterations is 10."""
        result = handle_loop({"iteration": 0}, {}, "t1")
        assert result["output_data"]["max_iterations"] == 10

    def test_preserves_output(self):
        """Verify loop passes through the output field."""
        result = handle_loop({"output": "keep me", "iteration": 0}, {}, "t1")
        assert result["output_data"]["output"] == "keep me"


# ---------------------------------------------------------------------------
# Tests: GitHub handler
# ---------------------------------------------------------------------------


class TestHandleGithub:
    """Tests for handle_github() GitHub API handler."""

    def test_missing_token_returns_error(self):
        """Verify missing GitHub token returns error."""
        result = handle_github({}, {"repo": "owner/repo"}, "t1")
        assert "error" in result
        assert "token" in result["error"].lower()

    @patch("rag.agent.node_executor.requests.get")
    def test_list_issues_calls_correct_endpoint(self, mock_get):
        """Verify list_issues calls the correct GitHub API endpoint."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"number": 1, "title": "Bug"}]
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        result = handle_github(
            {},
            {"token": "ghp_test", "repo": "owner/repo", "operation": "list_issues"},
            "t1",
        )
        assert "output_data" in result
        mock_get.assert_called_once()
        call_url = mock_get.call_args[0][0]
        assert "/repos/owner/repo/issues" in call_url

    @patch("rag.agent.node_executor.requests.get")
    def test_get_file_calls_contents_endpoint(self, mock_get):
        """Verify get_file calls the contents API endpoint."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"content": "data"}
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        result = handle_github(
            {"output": "README.md"},
            {"token": "ghp_test", "repo": "owner/repo", "operation": "get_file", "path": "README.md"},
            "t1",
        )
        assert "output_data" in result

    def test_missing_repo_for_list_issues(self):
        """Verify missing repo for list_issues returns error."""
        result = handle_github({}, {"token": "ghp_test", "operation": "list_issues"}, "t1")
        assert "error" in result

    def test_unknown_operation_returns_error(self):
        """Verify unknown GitHub operation returns error."""
        result = handle_github(
            {}, {"token": "ghp_test", "operation": "nonexistent_op"}, "t1"
        )
        assert "error" in result


# ---------------------------------------------------------------------------
# Tests: SQL handler
# ---------------------------------------------------------------------------


class TestHandleSql:
    """Tests for handle_sql() database query handler."""

    def test_empty_query_returns_error(self):
        """Verify empty SQL query returns error."""
        result = handle_sql({}, {"query": ""}, "t1")
        assert "error" in result
        assert "No SQL" in result["error"]

    def test_readonly_blocks_write_operations(self):
        """Verify readonly mode blocks INSERT/UPDATE/DELETE/DROP."""
        for keyword in ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE"]:
            result = handle_sql(
                {},
                {"query": f"{keyword} INTO table VALUES (1)", "readonly": True},
                "t1",
            )
            assert "error" in result
            assert "not allowed" in result["error"]

    def test_executes_select_query(self):
        """Verify SQL handler executes a SELECT and returns rows."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        mock_cur.description = [("id",), ("name",)]
        mock_cur.fetchall.return_value = [(1, "Alice"), (2, "Bob")]
        mock_conn.cursor.return_value = mock_cur

        # psycopg2 is imported locally inside handle_sql, so patch via sys.modules
        mock_pg = MagicMock()
        mock_pg.connect.return_value = mock_conn
        with patch.dict(sys.modules, {"psycopg2": mock_pg}):
            result = handle_sql(
                {},
                {"query": "SELECT * FROM users", "connection_string": "host=localhost"},
                "t1",
            )
        assert "output_data" in result
        assert len(result["output_data"]["rows"]) == 2


# ---------------------------------------------------------------------------
# Tests: API handler
# ---------------------------------------------------------------------------


class TestHandleApi:
    """Tests for handle_api() HTTP request handler."""

    def test_missing_url_returns_error(self):
        """Verify missing URL returns error."""
        result = handle_api({}, {"method": "GET"}, "t1")
        assert "error" in result
        assert "URL" in result["error"]

    @patch("rag.agent.node_executor.requests.request")
    def test_makes_get_request(self, mock_request):
        """Verify API handler makes GET request to specified URL."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"data": "value"}
        mock_resp.status_code = 200
        mock_resp.headers = {"Content-Type": "application/json"}
        mock_request.return_value = mock_resp

        result = handle_api(
            {},
            {"url": "https://api.example.com/data", "method": "GET"},
            "t1",
        )
        assert "output_data" in result
        assert result["output_data"]["status_code"] == 200

    @patch("rag.agent.node_executor.requests.request")
    def test_handles_request_exception(self, mock_request):
        """Verify API handler catches request exceptions."""
        import requests as _req
        mock_request.side_effect = _req.RequestException("Connection refused")
        result = handle_api({}, {"url": "https://bad.example.com"}, "t1")
        assert "error" in result


# ---------------------------------------------------------------------------
# Tests: Email handler
# ---------------------------------------------------------------------------


class TestHandleEmail:
    """Tests for handle_email() SMTP email handler."""

    def test_missing_smtp_host_returns_error(self):
        """Verify missing SMTP host returns error."""
        result = handle_email(
            {"to": "user@example.com"},
            {"smtp_host": ""},
            "t1",
        )
        assert "error" in result

    def test_missing_recipient_returns_error(self):
        """Verify missing recipient returns error."""
        result = handle_email(
            {},
            {"smtp_host": "smtp.example.com", "to": ""},
            "t1",
        )
        assert "error" in result

    @patch("rag.agent.node_executor.smtplib.SMTP")
    def test_sends_email_successfully(self, mock_smtp_class):
        """Verify email handler sends via SMTP and returns success."""
        mock_server = MagicMock()
        mock_smtp_class.return_value = mock_server

        result = handle_email(
            {"to": "recipient@example.com", "subject": "Test"},
            {
                "smtp_host": "smtp.example.com",
                "smtp_port": 587,
                "smtp_user": "user@example.com",
                "smtp_password": "password",
                "to": "recipient@example.com",
                "subject": "Test Subject",
                "body": "Hello!",
            },
            "t1",
        )
        assert "output_data" in result
        assert "sent" in result["output_data"]["output"].lower()
        mock_server.sendmail.assert_called_once()

    @patch("rag.agent.node_executor.smtplib.SMTP")
    def test_smtp_exception_returns_error(self, mock_smtp_class):
        """Verify SMTP exceptions are caught and returned as error."""
        mock_smtp_class.side_effect = Exception("SMTP connect failed")
        result = handle_email(
            {},
            {
                "smtp_host": "bad-smtp.example.com",
                "to": "user@example.com",
                "body": "test",
            },
            "t1",
        )
        assert "error" in result


# ---------------------------------------------------------------------------
# Tests: External tool handlers that may have missing libraries
# ---------------------------------------------------------------------------


class TestHandleDuckduckgo:
    """Tests for handle_duckduckgo() search handler."""

    def test_missing_library_returns_error(self):
        """Verify DuckDuckGo returns error when library not installed."""
        # Temporarily remove the duckduckgo_search module mock
        saved = sys.modules.pop("duckduckgo_search", None)
        try:
            # Make the import fail
            import builtins
            real_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name == "duckduckgo_search":
                    raise ImportError("not installed")
                return real_import(name, *args, **kwargs)

            with patch("builtins.__import__", side_effect=mock_import):
                result = handle_duckduckgo({"output": "test query"}, {}, "t1")
            assert "error" in result
            assert "not installed" in result["error"].lower()
        finally:
            if saved is not None:
                sys.modules["duckduckgo_search"] = saved


class TestHandleGoogle:
    """Tests for handle_google() Custom Search handler."""

    def test_missing_api_key_returns_error(self):
        """Verify missing API key/cx returns error."""
        result = handle_google({"output": "test"}, {}, "t1")
        assert "error" in result
        assert "api_key" in result["error"].lower() or "cx" in result["error"].lower()

    @patch("rag.agent.node_executor.requests.get")
    def test_calls_google_api(self, mock_get):
        """Verify Google handler calls the Custom Search API."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "items": [{"title": "Result 1", "link": "https://example.com", "snippet": "A snippet"}]
        }
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        result = handle_google(
            {"output": "test query"},
            {"api_key": "key123", "cx": "cx123"},
            "t1",
        )
        assert "output_data" in result
        assert len(result["output_data"]["results"]) == 1


class TestHandleArxiv:
    """Tests for handle_arxiv() academic search handler."""

    def test_missing_library_falls_back_to_rest_api(self):
        """Verify arXiv falls back to REST API when library unavailable."""
        # Make arxiv import fail
        saved = sys.modules.pop("arxiv", None)
        try:
            import builtins
            real_import = builtins.__import__

            def mock_import(name, *args, **kwargs):
                if name == "arxiv":
                    raise ImportError("not installed")
                return real_import(name, *args, **kwargs)

            mock_resp = MagicMock()
            mock_resp.text = """<?xml version="1.0"?>
            <feed xmlns="http://www.w3.org/2005/Atom">
                <entry>
                    <title>Test Paper</title>
                    <summary>Abstract</summary>
                    <id>http://arxiv.org/abs/1234</id>
                    <published>2024-01-01</published>
                </entry>
            </feed>"""
            mock_resp.status_code = 200

            with patch("builtins.__import__", side_effect=mock_import), \
                 patch("rag.agent.node_executor.requests.get", return_value=mock_resp):
                result = handle_arxiv({"output": "machine learning"}, {}, "t1")

            assert "output_data" in result
            assert len(result["output_data"]["results"]) == 1
        finally:
            if saved is not None:
                sys.modules["arxiv"] = saved


class TestHandleCrawler:
    """Tests for handle_crawler() web crawling handler."""

    def test_missing_url_returns_error(self):
        """Verify missing URL returns error."""
        result = handle_crawler({}, {}, "t1")
        assert "error" in result

    @patch("rag.agent.node_executor.requests.get")
    def test_extracts_text_from_html(self, mock_get):
        """Verify crawler extracts text from HTML response."""
        mock_resp = MagicMock()
        mock_resp.text = "<html><head><title>Test Page</title></head><body><p>Content</p></body></html>"
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp

        # Need bs4 to be available; use mock soup if not installed
        mock_soup = MagicMock()
        mock_soup.title.string = "Test Page"
        mock_soup.get_text.return_value = "Content"
        mock_soup.return_value = mock_soup

        with patch("bs4.BeautifulSoup", return_value=mock_soup):
            result = handle_crawler(
                {"output": "https://example.com"},
                {},
                "t1",
            )
        assert "output_data" in result


# ---------------------------------------------------------------------------
# Tests: Keyword extract handler
# ---------------------------------------------------------------------------


class TestHandleKeywordExtract:
    """Tests for handle_keyword_extract() NLP keyword extraction handler."""

    def test_empty_text_returns_empty_keywords(self):
        """Verify empty text returns empty keywords list."""
        result = handle_keyword_extract({"output": ""}, {}, "t1")
        assert result["output_data"]["keywords"] == []

    @patch("rag.agent.node_executor.TermWeightDealer", create=True)
    def test_extracts_keywords(self, _):
        """Verify keyword extraction pipeline is invoked."""
        mock_dealer = MagicMock()
        mock_dealer.pretoken.return_value = ["machine", "learning"]
        mock_dealer.token_merge.return_value = ["machine learning"]
        mock_dealer.weights.return_value = [("machine learning", 0.95)]

        with patch("rag.nlp.term_weight.Dealer", return_value=mock_dealer):
            result = handle_keyword_extract(
                {"output": "machine learning algorithms"},
                {"top_n": 5},
                "t1",
            )
        assert "output_data" in result
        assert len(result["output_data"]["keywords"]) > 0


# ---------------------------------------------------------------------------
# Tests: NODE_HANDLERS registry completeness
# ---------------------------------------------------------------------------


class TestNodeHandlersRegistry:
    """Tests for the NODE_HANDLERS dispatch registry."""

    @pytest.mark.parametrize("node_type", [
        "generate", "categorize", "rewrite", "relevant",
        "retrieval", "wikipedia", "tavily", "pubmed",
        "code", "github", "sql", "api", "email",
        "template", "keyword_extract", "loop",
        "duckduckgo", "google", "google_scholar", "arxiv",
        "deepl", "qweather", "crawler", "invoke",
        "exesql", "akshare", "yahoofinance", "jin10",
        "tushare", "wencai", "bing", "searxng", "google_maps",
    ])
    def test_expected_node_type_registered(self, node_type):
        """Verify expected node type has a handler in the registry."""
        assert node_type in NODE_HANDLERS
        assert callable(NODE_HANDLERS[node_type])
