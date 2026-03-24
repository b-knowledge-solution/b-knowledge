"""Agent external tools package.

Provides a base class for all tools and concrete implementations for
web search, academic search, financial data, code execution, translation,
email, database queries, weather, crawling, and RAG retrieval.

Exports:
    BaseTool: Abstract base class for tool implementations.
    ArxivTool: Search arXiv.org for academic papers.
    AkShareTool: Chinese stock news and financial data via akshare.
    BingTool: Web search via Bing Web Search API.
    CodeExecTool: Sandboxed Python code execution.
    CrawlerTool: URL content extraction.
    DeepLTool: Text translation via DeepL API.
    DuckDuckGoTool: Web search via DuckDuckGo.
    EmailTool: Send email via SMTP.
    ExeSQLTool: Execute SQL queries against a database.
    GitHubTool: GitHub repo search, file retrieval, issue listing.
    GoogleTool: Web search via Google Custom Search API.
    GoogleMapsTool: Place search and geocoding via Google Maps API.
    GoogleScholarTool: Academic paper search via Google Scholar.
    Jin10Tool: Chinese financial news and market data via Jin10 API.
    PubMedTool: Biomedical literature search via PubMed/NCBI.
    QWeatherTool: Weather data via QWeather API.
    RetrievalTool: RAG retrieval from B-Knowledge datasets.
    SearxNGTool: Privacy-focused metasearch via SearxNG.
    TavilyTool: Web search via Tavily API.
    TuShareTool: Chinese financial news via TuShare API.
    WenCaiTool: Chinese stock screening via iWenCai.
    WikipediaTool: Wikipedia article search and retrieval.
    YahooFinanceTool: Stock and financial data via Yahoo Finance.
"""

from .base_tool import BaseTool
from .akshare_tool import AkShareTool
from .arxiv_tool import ArxivTool
from .bing_tool import BingTool
from .code_exec_tool import CodeExecTool
from .crawler_tool import CrawlerTool
from .deepl_tool import DeepLTool
from .duckduckgo_tool import DuckDuckGoTool
from .email_tool import EmailTool
from .exesql_tool import ExeSQLTool
from .github_tool import GitHubTool
from .google_maps_tool import GoogleMapsTool
from .google_scholar_tool import GoogleScholarTool
from .google_tool import GoogleTool
from .jin10_tool import Jin10Tool
from .pubmed_tool import PubMedTool
from .qweather_tool import QWeatherTool
from .retrieval_tool import RetrievalTool
from .searxng_tool import SearxNGTool
from .tavily_tool import TavilyTool
from .tushare_tool import TuShareTool
from .wencai_tool import WenCaiTool
from .wikipedia_tool import WikipediaTool
from .yahoofinance_tool import YahooFinanceTool

__all__ = [
    "BaseTool",
    "AkShareTool",
    "ArxivTool",
    "BingTool",
    "CodeExecTool",
    "CrawlerTool",
    "DeepLTool",
    "DuckDuckGoTool",
    "EmailTool",
    "ExeSQLTool",
    "GitHubTool",
    "GoogleMapsTool",
    "GoogleScholarTool",
    "GoogleTool",
    "Jin10Tool",
    "PubMedTool",
    "QWeatherTool",
    "RetrievalTool",
    "SearxNGTool",
    "TavilyTool",
    "TuShareTool",
    "WenCaiTool",
    "WikipediaTool",
    "YahooFinanceTool",
]
