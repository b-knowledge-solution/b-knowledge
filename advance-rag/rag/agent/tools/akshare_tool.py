"""AkShare Chinese financial data tool for agent workflows.

Retrieves Chinese stock news and financial data using the akshare library.
No credentials required -- akshare accesses public financial data sources.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class AkShareTool(BaseTool):
    """Chinese financial data tool via akshare library.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "akshare"
    description = "Chinese stock news and financial data via akshare"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Fetch Chinese stock news for a given symbol using akshare.

        Args:
            input_data: Must contain 'query' or 'output' with a stock symbol
                (e.g. '000001' for Ping An Bank).
            config: Optional 'max_results' (default 10).
            credentials: Not required for akshare.

        Returns:
            Dict with 'result' containing list of news articles with title,
            content, url, publish_time, and source.
        """
        try:
            import akshare as ak
        except ImportError:
            return {"error": "akshare not installed. Install with: pip install akshare"}

        # Extract stock symbol from input
        symbol = input_data.get("query", input_data.get("output", ""))
        if not symbol or not symbol.strip():
            return {"error": "No stock symbol provided"}

        max_results = config.get("max_results", 10)

        try:
            # Fetch stock news from East Money (eastmoney.com) via akshare
            df = ak.stock_news_em(symbol=symbol.strip())
            df = df.head(max_results)

            results = []
            for _, row in df.iterrows():
                results.append({
                    "title": row.get("\u65b0\u95fb\u6807\u9898", ""),       # News title
                    "content": row.get("\u65b0\u95fb\u5185\u5bb9", ""),     # News content
                    "url": row.get("\u65b0\u95fb\u94fe\u63a5", ""),         # News URL
                    "publish_time": row.get("\u53d1\u5e03\u65f6\u95f4", ""), # Publish time
                    "source": row.get("\u6587\u7ae0\u6765\u6e90", ""),       # Article source
                })

            logger.info(f"AkShare returned {len(results)} news items for symbol: {symbol}")

            return {"result": results}
        except Exception as e:
            logger.error(f"AkShare query failed: {e}")
            return {"error": f"AkShare query failed: {str(e)}"}
