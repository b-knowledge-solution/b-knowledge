"""Unit tests for memory_read and memory_write node handlers.

Tests handle_memory_read and handle_memory_write from rag.agent.node_executor,
verifying HTTP dispatch to the backend memory API, result formatting, and
error handling for missing/empty inputs.
"""
import json
import os
import sys
from unittest.mock import MagicMock, patch

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
    handle_memory_read,
    handle_memory_write,
    NODE_HANDLERS,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def memory_config():
    """Standard memory node config with memory_id and API base URL."""
    return {
        "memory_id": "mem-pool-001",
        "api_base_url": "http://localhost:3001",
        "auth_token": "test-token-abc",
        "top_k": 3,
    }


@pytest.fixture
def write_config():
    """Standard memory write node config."""
    return {
        "memory_id": "mem-pool-001",
        "api_base_url": "http://localhost:3001",
        "auth_token": "test-token-abc",
        "message_type": 1,
    }


# ---------------------------------------------------------------------------
# Tests: handle_memory_read
# ---------------------------------------------------------------------------


class TestHandleMemoryRead:
    """Tests for handle_memory_read() memory search handler."""

    @patch("rag.agent.node_executor.requests.post")
    def test_dispatches_to_memory_search_api(self, mock_post, memory_config):
        """Verify handle_memory_read calls the correct backend search endpoint."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            {"content": "Previous conversation about AI", "score": 0.9},
        ]
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        handle_memory_read({"query": "What is AI?"}, memory_config, "t1")

        # Verify the correct URL and payload were sent
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "/api/memory/mem-pool-001/search" in call_args[0][0]
        assert call_args[1]["json"]["query"] == "What is AI?"
        assert call_args[1]["json"]["top_k"] == 3

    @patch("rag.agent.node_executor.requests.post")
    def test_returns_formatted_results(self, mock_post, memory_config):
        """Verify handle_memory_read formats search results into memories list and joined output."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = [
            {"content": "Memory one about topic A", "score": 0.95},
            {"content": "Memory two about topic B", "score": 0.80},
        ]
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = handle_memory_read({"query": "Tell me about topics"}, memory_config, "t1")

        assert "output_data" in result
        assert len(result["output_data"]["memories"]) == 2
        assert result["output_data"]["memories"][0] == "Memory one about topic A"
        assert result["output_data"]["memories"][1] == "Memory two about topic B"
        # Output is newline-joined content strings
        assert "Memory one about topic A" in result["output_data"]["output"]
        assert "Memory two about topic B" in result["output_data"]["output"]
        # Raw results preserved for downstream processing
        assert len(result["output_data"]["raw_results"]) == 2

    def test_with_empty_query_returns_error(self, memory_config):
        """Verify handle_memory_read returns error when no query text is found."""
        result = handle_memory_read({"output": ""}, memory_config, "t1")

        assert "error" in result
        assert "No query" in result["error"]

    def test_missing_memory_id_returns_error(self):
        """Verify handle_memory_read returns error when memory_id is not configured."""
        config = {"api_base_url": "http://localhost:3001"}
        result = handle_memory_read({"query": "test"}, config, "t1")

        assert "error" in result
        assert "memory_id" in result["error"]

    @patch("rag.agent.node_executor.requests.post")
    def test_extracts_query_from_input_field(self, mock_post, memory_config):
        """Verify handle_memory_read tries 'input' field when 'query' is absent."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = [{"content": "Found memory", "score": 0.7}]
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = handle_memory_read({"input": "Search this text"}, memory_config, "t1")

        assert "output_data" in result
        # The query sent should be from the 'input' field
        call_json = mock_post.call_args[1]["json"]
        assert call_json["query"] == "Search this text"

    @patch("rag.agent.node_executor.requests.post")
    def test_extracts_query_from_message_field(self, mock_post, memory_config):
        """Verify handle_memory_read tries 'message' field as fallback."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = []
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = handle_memory_read({"message": "Fallback query"}, memory_config, "t1")

        assert "output_data" in result
        call_json = mock_post.call_args[1]["json"]
        assert call_json["query"] == "Fallback query"

    @patch("rag.agent.node_executor.requests.post")
    def test_handles_empty_search_results(self, mock_post, memory_config):
        """Verify handle_memory_read handles empty result set gracefully."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = []
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = handle_memory_read({"query": "no matches"}, memory_config, "t1")

        assert "output_data" in result
        assert result["output_data"]["memories"] == []
        assert result["output_data"]["output"] == ""

    @patch("rag.agent.node_executor.requests.post")
    def test_request_exception_returns_error(self, mock_post, memory_config):
        """Verify handle_memory_read catches HTTP errors and returns error dict."""
        import requests as _req
        mock_post.side_effect = _req.RequestException("Connection refused")

        result = handle_memory_read({"query": "test"}, memory_config, "t1")

        assert "error" in result
        assert "Memory read failed" in result["error"]

    @patch("rag.agent.node_executor.requests.post")
    def test_sends_auth_header(self, mock_post, memory_config):
        """Verify handle_memory_read sends the Authorization header."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = []
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        handle_memory_read({"query": "test"}, memory_config, "t1")

        call_headers = mock_post.call_args[1]["headers"]
        assert call_headers["Authorization"] == "Bearer test-token-abc"


# ---------------------------------------------------------------------------
# Tests: handle_memory_write
# ---------------------------------------------------------------------------


class TestHandleMemoryWrite:
    """Tests for handle_memory_write() memory storage handler."""

    @patch("rag.agent.node_executor.requests.post")
    def test_stores_message_via_api(self, mock_post, write_config):
        """Verify handle_memory_write POSTs content to the memory messages endpoint."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"message_id": "msg-123"}
        mock_resp.status_code = 200
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        handle_memory_write({"content": "Remember this fact"}, write_config, "t1")

        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "/api/memory/mem-pool-001/messages" in call_args[0][0]
        assert call_args[1]["json"]["content"] == "Remember this fact"
        assert call_args[1]["json"]["message_type"] == 1

    @patch("rag.agent.node_executor.requests.post")
    def test_returns_stored_status(self, mock_post, write_config):
        """Verify handle_memory_write returns status and message_id on success."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"message_id": "msg-456"}
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = handle_memory_write({"content": "Store this"}, write_config, "t1")

        assert "output_data" in result
        assert result["output_data"]["status"] == "stored"
        assert result["output_data"]["memory_id"] == "mem-pool-001"
        assert result["output_data"]["message_id"] == "msg-456"
        assert "msg-456" in result["output_data"]["output"]

    def test_missing_content_returns_error(self, write_config):
        """Verify handle_memory_write returns error when no content is provided."""
        result = handle_memory_write({"output": ""}, write_config, "t1")

        assert "error" in result
        assert "No content" in result["error"]

    def test_missing_memory_id_returns_error(self):
        """Verify handle_memory_write returns error when memory_id is absent."""
        config = {"api_base_url": "http://localhost:3001"}
        result = handle_memory_write({"content": "test"}, config, "t1")

        assert "error" in result
        assert "memory_id" in result["error"]

    @patch("rag.agent.node_executor.requests.post")
    def test_extracts_content_from_output_field(self, mock_post, write_config):
        """Verify handle_memory_write falls back to 'output' field for content."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"message_id": "msg-789"}
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = handle_memory_write({"output": "Content from output field"}, write_config, "t1")

        assert "output_data" in result
        call_json = mock_post.call_args[1]["json"]
        assert call_json["content"] == "Content from output field"

    @patch("rag.agent.node_executor.requests.post")
    def test_extracts_content_from_message_field(self, mock_post, write_config):
        """Verify handle_memory_write falls back to 'message' field for content."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"message_id": "msg-abc"}
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        result = handle_memory_write({"message": "Content from message"}, write_config, "t1")

        assert "output_data" in result
        call_json = mock_post.call_args[1]["json"]
        assert call_json["content"] == "Content from message"

    @patch("rag.agent.node_executor.requests.post")
    def test_request_exception_returns_error(self, mock_post, write_config):
        """Verify handle_memory_write catches HTTP errors and returns error dict."""
        import requests as _req
        mock_post.side_effect = _req.RequestException("Timeout")

        result = handle_memory_write({"content": "test"}, write_config, "t1")

        assert "error" in result
        assert "Memory write failed" in result["error"]

    @patch("rag.agent.node_executor.requests.post")
    def test_sends_auth_header(self, mock_post, write_config):
        """Verify handle_memory_write sends the Authorization header."""
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"message_id": "msg-999"}
        mock_resp.raise_for_status = MagicMock()
        mock_post.return_value = mock_resp

        handle_memory_write({"content": "test"}, write_config, "t1")

        call_headers = mock_post.call_args[1]["headers"]
        assert call_headers["Authorization"] == "Bearer test-token-abc"


# ---------------------------------------------------------------------------
# Tests: NODE_HANDLERS registry for memory handlers
# ---------------------------------------------------------------------------


class TestMemoryHandlersRegistry:
    """Tests for memory handler registration in NODE_HANDLERS."""

    def test_memory_read_registered(self):
        """Verify memory_read is registered in NODE_HANDLERS dispatch table."""
        assert "memory_read" in NODE_HANDLERS
        assert callable(NODE_HANDLERS["memory_read"])

    def test_memory_write_registered(self):
        """Verify memory_write is registered in NODE_HANDLERS dispatch table."""
        assert "memory_write" in NODE_HANDLERS
        assert callable(NODE_HANDLERS["memory_write"])

    def test_memory_read_handler_is_correct_function(self):
        """Verify memory_read maps to handle_memory_read function."""
        assert NODE_HANDLERS["memory_read"] is handle_memory_read

    def test_memory_write_handler_is_correct_function(self):
        """Verify memory_write maps to handle_memory_write function."""
        assert NODE_HANDLERS["memory_write"] is handle_memory_write
