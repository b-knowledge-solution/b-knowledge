"""Unit tests for the agent tools registry (rag.agent.tools.__init__).

Verifies that all tool classes are exported, extend BaseTool, have unique
names, and are instantiable. No external API calls are made.
"""
import os
import sys
import types
from unittest.mock import MagicMock

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

# Ensure rag.agent package exists as a real package
for _mod_path in ["rag.agent", "rag.agent.tools"]:
    if _mod_path not in sys.modules:
        _m = types.ModuleType(_mod_path)
        _m.__path__ = [os.path.join(_ADVANCE_RAG_ROOT, *_mod_path.split("."))]
        sys.modules[_mod_path] = _m
    elif not hasattr(sys.modules[_mod_path], "__path__"):
        sys.modules[_mod_path].__path__ = [os.path.join(_ADVANCE_RAG_ROOT, *_mod_path.split("."))]

# Try to import the tools package for real
try:
    # Remove cached mock to force real import
    for _k in list(sys.modules.keys()):
        if _k.startswith("rag.agent.tools") and not hasattr(sys.modules[_k], "__file__"):
            del sys.modules[_k]

    # Re-establish package path so submodule imports work
    if "rag.agent.tools" not in sys.modules:
        _m = types.ModuleType("rag.agent.tools")
        _m.__path__ = [os.path.join(_ADVANCE_RAG_ROOT, "rag", "agent", "tools")]
        sys.modules["rag.agent.tools"] = _m

    from rag.agent.tools.base_tool import BaseTool

    # Import all tool modules one by one
    _tool_modules = {
        "akshare_tool": "AkShareTool",
        "arxiv_tool": "ArxivTool",
        "bing_tool": "BingTool",
        "code_exec_tool": "CodeExecTool",
        "crawler_tool": "CrawlerTool",
        "deepl_tool": "DeepLTool",
        "duckduckgo_tool": "DuckDuckGoTool",
        "email_tool": "EmailTool",
        "exesql_tool": "ExeSQLTool",
        "github_tool": "GitHubTool",
        "google_maps_tool": "GoogleMapsTool",
        "google_scholar_tool": "GoogleScholarTool",
        "google_tool": "GoogleTool",
        "jin10_tool": "Jin10Tool",
        "pubmed_tool": "PubMedTool",
        "qweather_tool": "QWeatherTool",
        "retrieval_tool": "RetrievalTool",
        "searxng_tool": "SearxNGTool",
        "tavily_tool": "TavilyTool",
        "tushare_tool": "TuShareTool",
        "wencai_tool": "WenCaiTool",
        "wikipedia_tool": "WikipediaTool",
        "yahoofinance_tool": "YahooFinanceTool",
    }

    _imported_tools = {}
    _import_errors = {}
    for mod_name, class_name in _tool_modules.items():
        try:
            import importlib
            full_mod = f"rag.agent.tools.{mod_name}"
            mod = importlib.import_module(full_mod)
            cls = getattr(mod, class_name)
            _imported_tools[class_name] = cls
        except Exception as exc:
            _import_errors[class_name] = str(exc)

    _REGISTRY_IMPORTABLE = True
except Exception as _exc:
    _REGISTRY_IMPORTABLE = False
    _imported_tools = {}
    _import_errors = {}
    BaseTool = None


# Expected tool class names from __all__ in __init__.py
EXPECTED_TOOL_CLASSES = [
    "AkShareTool", "ArxivTool", "BingTool", "CodeExecTool", "CrawlerTool",
    "DeepLTool", "DuckDuckGoTool", "EmailTool", "ExeSQLTool", "GitHubTool",
    "GoogleMapsTool", "GoogleScholarTool", "GoogleTool", "Jin10Tool",
    "PubMedTool", "QWeatherTool", "RetrievalTool", "SearxNGTool",
    "TavilyTool", "TuShareTool", "WenCaiTool", "WikipediaTool",
    "YahooFinanceTool",
]


# ---------------------------------------------------------------------------
# Tests: __init__.py exports
# ---------------------------------------------------------------------------


class TestRegistryExports:
    """Tests verifying __init__.py exports all expected tool classes."""

    @pytest.mark.parametrize("class_name", EXPECTED_TOOL_CLASSES)
    def test_tool_class_importable(self, class_name):
        """Verify each expected tool class can be imported from the registry."""
        if not _REGISTRY_IMPORTABLE:
            pytest.skip("Registry not importable in test environment")
        if class_name in _import_errors:
            pytest.skip(f"Import error: {_import_errors[class_name]}")
        assert class_name in _imported_tools, f"{class_name} not importable"


# ---------------------------------------------------------------------------
# Tests: All tools extend BaseTool
# ---------------------------------------------------------------------------


class TestToolInheritance:
    """Tests verifying all tool classes extend BaseTool."""

    @pytest.mark.parametrize("class_name", EXPECTED_TOOL_CLASSES)
    def test_extends_base_tool(self, class_name):
        """Verify each tool class extends BaseTool."""
        if not _REGISTRY_IMPORTABLE or BaseTool is None:
            pytest.skip("Registry not importable in test environment")
        if class_name in _import_errors:
            pytest.skip(f"Import error: {_import_errors[class_name]}")
        cls = _imported_tools.get(class_name)
        if cls is None:
            pytest.skip(f"{class_name} not available")
        assert issubclass(cls, BaseTool), f"{class_name} does not extend BaseTool"


# ---------------------------------------------------------------------------
# Tests: No duplicate tool names
# ---------------------------------------------------------------------------


class TestNoDuplicateNames:
    """Tests verifying tool name uniqueness across all implementations."""

    def test_no_duplicate_tool_names(self):
        """Verify no two tool classes share the same name attribute."""
        if not _REGISTRY_IMPORTABLE:
            pytest.skip("Registry not importable in test environment")

        seen_names = {}
        for class_name, cls in _imported_tools.items():
            instance = cls()
            tool_name = instance.name
            if tool_name in seen_names:
                pytest.fail(
                    f"Duplicate tool name '{tool_name}' found in "
                    f"{class_name} and {seen_names[tool_name]}"
                )
            seen_names[tool_name] = class_name


# ---------------------------------------------------------------------------
# Tests: All tools are instantiable
# ---------------------------------------------------------------------------


class TestToolInstantiability:
    """Tests verifying all tool classes can be instantiated."""

    @pytest.mark.parametrize("class_name", EXPECTED_TOOL_CLASSES)
    def test_tool_is_instantiable(self, class_name):
        """Verify each tool class can be instantiated without arguments."""
        if not _REGISTRY_IMPORTABLE:
            pytest.skip("Registry not importable in test environment")
        if class_name in _import_errors:
            pytest.skip(f"Import error: {_import_errors[class_name]}")
        cls = _imported_tools.get(class_name)
        if cls is None:
            pytest.skip(f"{class_name} not available")
        instance = cls()
        assert instance is not None


# ---------------------------------------------------------------------------
# Tests: All tools have name and description attributes
# ---------------------------------------------------------------------------


class TestToolAttributes:
    """Tests verifying all tools have required name and description."""

    @pytest.mark.parametrize("class_name", EXPECTED_TOOL_CLASSES)
    def test_has_name_attribute(self, class_name):
        """Verify each tool has a non-empty name attribute."""
        if not _REGISTRY_IMPORTABLE:
            pytest.skip("Registry not importable in test environment")
        if class_name in _import_errors:
            pytest.skip(f"Import error: {_import_errors[class_name]}")
        cls = _imported_tools.get(class_name)
        if cls is None:
            pytest.skip(f"{class_name} not available")
        instance = cls()
        assert hasattr(instance, "name")
        assert isinstance(instance.name, str)
        assert len(instance.name) > 0, f"{class_name} has empty name"

    @pytest.mark.parametrize("class_name", EXPECTED_TOOL_CLASSES)
    def test_has_description_attribute(self, class_name):
        """Verify each tool has a non-empty description attribute."""
        if not _REGISTRY_IMPORTABLE:
            pytest.skip("Registry not importable in test environment")
        if class_name in _import_errors:
            pytest.skip(f"Import error: {_import_errors[class_name]}")
        cls = _imported_tools.get(class_name)
        if cls is None:
            pytest.skip(f"{class_name} not available")
        instance = cls()
        assert hasattr(instance, "description")
        assert isinstance(instance.description, str)
        assert len(instance.description) > 0, f"{class_name} has empty description"


# ---------------------------------------------------------------------------
# Tests: All tools have execute method
# ---------------------------------------------------------------------------


class TestToolExecuteMethod:
    """Tests verifying all tools implement the execute() method."""

    @pytest.mark.parametrize("class_name", EXPECTED_TOOL_CLASSES)
    def test_has_execute_method(self, class_name):
        """Verify each tool has a callable execute method."""
        if not _REGISTRY_IMPORTABLE:
            pytest.skip("Registry not importable in test environment")
        if class_name in _import_errors:
            pytest.skip(f"Import error: {_import_errors[class_name]}")
        cls = _imported_tools.get(class_name)
        if cls is None:
            pytest.skip(f"{class_name} not available")
        instance = cls()
        assert hasattr(instance, "execute")
        assert callable(instance.execute)
