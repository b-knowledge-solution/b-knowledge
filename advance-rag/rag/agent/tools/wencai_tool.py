"""Wencai Chinese stock screening tool for agent workflows.

Queries the iWenCai (Tonghuashun) platform for Chinese stock screening,
fund selection, and financial data analysis. Uses the pywencai library.
No credentials required.
"""

from typing import Any

from loguru import logger

from .base_tool import BaseTool


class WenCaiTool(BaseTool):
    """Chinese stock screening tool via iWenCai (Tonghuashun).

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "wencai"
    description = "Chinese stock screening and financial queries via iWenCai"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Query iWenCai for stock screening results.

        Args:
            input_data: Must contain 'query' with a natural language question
                about stocks (e.g. 'PE ratio below 10 and revenue growth above 20%').
            config: Optional 'max_results' (default 10), 'query_type'
                ('stock' | 'zhishu' | 'fund' | 'hkstock' | 'usstock' |
                'conbond' | 'futures', default 'stock').
            credentials: Not required for pywencai.

        Returns:
            Dict with 'result' containing screening results as a markdown table
            or structured data.
        """
        try:
            import pywencai
        except ImportError:
            return {"error": "pywencai not installed. Install with: pip install pywencai"}

        # Extract query parameters
        query = input_data.get("query", input_data.get("output", ""))
        if not query:
            return {"error": "No screening query provided"}

        max_results = config.get("max_results", 10)
        query_type = config.get("query_type", "stock")

        try:
            import pandas as pd

            # Call pywencai to execute the natural language stock query
            res = pywencai.get(query=query, query_type=query_type, perpage=max_results)

            # Parse the response into a consistent format
            report_parts = []
            if isinstance(res, pd.DataFrame):
                report_parts.append(res.to_markdown(index=False))
            elif isinstance(res, dict):
                for key, value in res.items():
                    if isinstance(value, pd.DataFrame):
                        # Skip image columns that cannot be serialized
                        if "image_url" in value.columns:
                            continue
                        report_parts.append(f"## {key}\n{value.to_markdown(index=False)}")
                    elif isinstance(value, list):
                        df = pd.DataFrame(value)
                        report_parts.append(f"## {key}\n{df.to_markdown(index=False)}")
                    elif isinstance(value, dict):
                        # Skip metadata entries
                        if "meta" in value:
                            continue
                        df = pd.DataFrame.from_dict(value, orient="index")
                        report_parts.append(f"## {key}\n{df.to_markdown()}")
                    elif isinstance(value, str):
                        report_parts.append(f"## {key}\n{value}")
                    else:
                        report_parts.append(f"## {key}\n{str(value)}")
            else:
                report_parts.append(str(res) if res else "No results found")

            report = "\n\n".join(report_parts)
            logger.info(f"WenCai returned results for query: {query[:50]}")

            return {"result": report}
        except Exception as e:
            logger.error(f"WenCai query failed: {e}")
            return {"error": f"WenCai query failed: {str(e)}"}
