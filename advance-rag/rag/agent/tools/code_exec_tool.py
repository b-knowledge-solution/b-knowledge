"""Python code execution tool for agent workflows.

Executes Python code snippets in an isolated subprocess with a configurable
timeout. The code must define a main() function that returns a dict.
No external credentials required.
"""

import subprocess
import sys
import textwrap
from typing import Any

from loguru import logger

from .base_tool import BaseTool


class CodeExecTool(BaseTool):
    """Sandboxed Python code execution tool.

    Attributes:
        name: Tool identifier used in NODE_HANDLERS registry.
        description: Human-readable tool purpose.
    """

    name = "code_exec"
    description = "Execute Python code in a sandboxed subprocess"

    def execute(
        self,
        input_data: dict[str, Any],
        config: dict[str, Any],
        credentials: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Execute a Python code snippet via subprocess.

        The code should define a ``main()`` function returning a dict.
        A wrapper is appended that calls ``main()`` and prints the JSON result.

        Args:
            input_data: May contain 'code' key with Python source, or 'output'
                with the code string from an upstream node.
            config: Optional 'timeout' in seconds (default 30), 'code' override.
            credentials: Not required for local code execution.

        Returns:
            Dict with 'result' containing the JSON-parsed output of main(),
            or 'error' if execution failed or timed out.
        """
        # Resolve the code string from config or input_data
        code = config.get("code", input_data.get("code", input_data.get("output", "")))
        timeout_seconds = config.get("timeout", 30)

        if not code or not code.strip():
            return {"error": "No code provided for execution"}

        # Append a runner that calls main() and prints JSON to stdout
        runner = textwrap.dedent("""
            import json as _json, sys as _sys
            try:
                _result = main()
                print(_json.dumps(_result, ensure_ascii=False, default=str))
            except Exception as _e:
                print(_json.dumps({"error": str(_e)}), file=_sys.stderr)
                _sys.exit(1)
        """)
        full_code = code + "\n" + runner

        try:
            # Run in a subprocess to isolate from the main process
            proc = subprocess.run(
                [sys.executable, "-c", full_code],
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )

            if proc.returncode != 0:
                stderr_msg = proc.stderr.strip() or "Code execution returned non-zero exit code"
                logger.warning(f"Code execution failed: {stderr_msg[:200]}")
                return {"error": stderr_msg[:2000]}

            # Parse the JSON output from stdout
            import json
            stdout = proc.stdout.strip()
            if not stdout:
                return {"result": None}

            try:
                parsed = json.loads(stdout)
            except json.JSONDecodeError:
                # Return raw stdout if not valid JSON
                parsed = stdout

            logger.info(f"Code execution succeeded, output length={len(stdout)}")
            return {"result": parsed}

        except subprocess.TimeoutExpired:
            logger.warning(f"Code execution timed out after {timeout_seconds}s")
            return {"error": f"Code execution timed out after {timeout_seconds} seconds"}
        except Exception as e:
            logger.error(f"Code execution error: {e}")
            return {"error": f"Code execution error: {str(e)}"}
