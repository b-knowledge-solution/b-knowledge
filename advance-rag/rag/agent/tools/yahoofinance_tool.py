"""Yahoo Finance stock data tool for agent workflows.

Retrieves stock information, historical prices, financials, and news from
Yahoo Finance using the yfinance library. No credentials required.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class YahooFinanceTool(BaseTool):
    """Stock and financial data tool via Yahoo Finance.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "yahoofinance"
    description = "Stock quotes, financials, and news via Yahoo Finance"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Fetch stock data from Yahoo Finance.

        Args:
            input_data: Must contain 'query' or 'output' with a stock ticker
                symbol (e.g. 'AAPL', 'MSFT').
            config: Optional boolean flags to control which data sections to include:
                'info' (default True), 'history' (default False),
                'financials' (default False), 'balance_sheet' (default False),
                'cash_flow' (default False), 'news' (default True).
            credentials: Not required for Yahoo Finance.

        Returns:
            Dict with 'result' containing a markdown-formatted report of the
            requested stock data sections.
        """
        try:
            import yfinance as yf
        except ImportError:
            return {"error": "yfinance not installed. Install with: pip install yfinance"}

        # Extract stock ticker symbol
        stock_code = input_data.get("query", input_data.get("stock_code", input_data.get("output", "")))
        if not stock_code or not stock_code.strip():
            return {"error": "No stock ticker symbol provided"}

        # Parse configuration flags for which data sections to fetch
        show_info = config.get("info", True)
        show_history = config.get("history", False)
        show_financials = config.get("financials", False)
        show_balance_sheet = config.get("balance_sheet", False)
        show_cash_flow = config.get("cash_flow", False)
        show_news = config.get("news", True)

        try:
            import pandas as pd

            ticker = yf.Ticker(stock_code.strip())
            report_parts = []

            # Fetch each requested data section
            if show_info:
                info = ticker.info
                if info:
                    report_parts.append("# Information\n" + pd.Series(info).to_markdown())

            if show_history:
                hist = ticker.history()
                if hist is not None and not hist.empty:
                    report_parts.append("# Price History\n" + hist.to_markdown())

            if show_financials:
                fin = ticker.financials
                if fin is not None and not fin.empty:
                    report_parts.append("# Financials\n" + fin.to_markdown())

            if show_balance_sheet:
                bs = ticker.balance_sheet
                if bs is not None and not bs.empty:
                    report_parts.append("# Balance Sheet\n" + bs.to_markdown())

            if show_cash_flow:
                cf = ticker.cashflow
                if cf is not None and not cf.empty:
                    report_parts.append("# Cash Flow\n" + cf.to_markdown())

            if show_news:
                news = ticker.news
                if news:
                    report_parts.append("# News\n" + pd.DataFrame(news).to_markdown(index=False))

            if not report_parts:
                return {"result": f"No data found for ticker: {stock_code}"}

            report = "\n\n".join(report_parts)
            logger.info(f"YahooFinance returned data for ticker: {stock_code}")

            return {"result": report}
        except Exception as e:
            logger.error(f"YahooFinance query failed: {e}")
            return {"error": f"YahooFinance query failed: {str(e)}"}
