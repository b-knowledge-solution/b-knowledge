"""Abstract base class for all agent external tools.

Every concrete tool must extend BaseTool and implement the execute() method.
Tools receive input data from upstream nodes, tool-specific configuration,
and optionally decrypted credentials for external API access.
"""

from abc import ABC, abstractmethod
from typing import Any


class BaseTool(ABC):
    """Abstract base class for agent external tools.

    Attributes:
        name: Unique identifier for the tool (e.g., 'tavily', 'wikipedia').
        description: Human-readable description of the tool's purpose.
    """

    name: str = ""
    description: str = ""

    @abstractmethod
    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute the tool with given input and configuration.

        Args:
            input_data: Input from upstream nodes (e.g., {'query': '...'}).
            config: Tool-specific configuration (e.g., max_results, language).
            credentials: Decrypted credentials (API keys, tokens). None if not needed.

        Returns:
            Dict with 'result' key containing tool output, or 'error' key on failure.
        """
        ...
