"""Agent external tools package.

Provides a base class for all tools and concrete implementations for
web search (Tavily), knowledge lookup (Wikipedia), and more to come.

Exports:
    BaseTool: Abstract base class for tool implementations.
    TavilyTool: Web search via Tavily API.
    WikipediaTool: Wikipedia article search and retrieval.
"""

from .base_tool import BaseTool
from .tavily_tool import TavilyTool
from .wikipedia_tool import WikipediaTool

__all__ = [
    "BaseTool",
    "TavilyTool",
    "WikipediaTool",
]
