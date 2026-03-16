#
#  Copyright 2025 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
"""
MCP (Model Context Protocol) tool-call connection management.

Provides ``MCPToolCallSession`` which maintains a long-lived connection to
an MCP server (via SSE or Streamable-HTTP transport), exposes synchronous
``tool_call`` / ``get_tools`` methods, and manages its own async event loop
in a background thread.  Helper functions handle batch cleanup and
conversion of MCP tool metadata to the OpenAI function-calling format.
"""

import asyncio
import logging
import threading
import weakref
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from string import Template
from typing import Any, Literal, Protocol

from typing_extensions import override

from common.constants import MCPServerType
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client
from mcp.client.streamable_http import streamablehttp_client
from mcp.types import CallToolResult, ListToolsResult, TextContent, Tool

# Type aliases for the internal task queue
MCPTaskType = Literal["list_tools", "tool_call"]
MCPTask = tuple[MCPTaskType, dict[str, Any], asyncio.Queue[Any]]


class ToolCallSession(Protocol):
    """Protocol defining the minimal interface for invoking remote tools."""

    def tool_call(self, name: str, arguments: dict[str, Any]) -> str: ...


class MCPToolCallSession(ToolCallSession):
    """Manages a persistent MCP server session with an internal async event loop.

    Each instance spawns a dedicated thread running an asyncio event loop that
    handles the MCP transport (SSE or Streamable-HTTP). Callers interact via
    the synchronous ``tool_call`` and ``get_tools`` methods, which schedule
    coroutines on the background loop and block for the result.

    All live instances are tracked via a class-level ``WeakSet`` so they can
    be batch-closed at shutdown time.

    Attributes:
        _ALL_INSTANCES: WeakSet tracking every active session for cleanup.
    """

    _ALL_INSTANCES: weakref.WeakSet["MCPToolCallSession"] = weakref.WeakSet()

    def __init__(self, mcp_server: Any, server_variables: dict[str, Any] | None = None, custom_header = None) -> None:
        """Initialise the session, start the background event loop, and begin the MCP server loop.

        Args:
            mcp_server: Server configuration object with ``url``, ``headers``, ``server_type``, and ``id`` attributes.
            server_variables: Template variables substituted into server URL and headers.
            custom_header: Additional headers to send with every MCP request.
        """
        self.__class__._ALL_INSTANCES.add(self)

        self._custom_header = custom_header
        self._mcp_server = mcp_server
        self._server_variables = server_variables or {}
        self._queue = asyncio.Queue()
        self._close = False

        # Spin up a dedicated event loop in a background thread
        self._event_loop = asyncio.new_event_loop()
        self._thread_pool = ThreadPoolExecutor(max_workers=1)
        self._thread_pool.submit(self._event_loop.run_forever)

        # Schedule the main MCP connection loop on the background event loop
        asyncio.run_coroutine_threadsafe(self._mcp_server_loop(), self._event_loop)

    async def _mcp_server_loop(self) -> None:
        """Connect to the MCP server using the configured transport and process tasks.

        Resolves template variables in headers, selects SSE or Streamable-HTTP
        transport based on ``mcp_server.server_type``, initialises the client
        session, and delegates to ``_process_mcp_tasks`` for the task loop.
        """
        url = self._mcp_server.url.strip()
        raw_headers: dict[str, str] = self._mcp_server.headers or {}
        custom_header: dict[str, str] = self._custom_header or {}
        headers: dict[str, str] = {}

        # Substitute template variables (e.g. $API_KEY) into header keys and values
        for h, v in raw_headers.items():
            nh = Template(h).safe_substitute(self._server_variables)
            nv = Template(v).safe_substitute(self._server_variables)
            # Skip headers with empty values (after stripping "Bearer" prefix)
            if nh.strip() and nv.strip().strip("Bearer"):
                headers[nh] = nv

        # Apply custom headers (overrides raw headers if keys collide)
        for h, v in custom_header.items():
            nh = Template(h).safe_substitute(custom_header)
            nv = Template(v).safe_substitute(custom_header)
            headers[nh] = nv

        if self._mcp_server.server_type == MCPServerType.SSE:
            # SSE transport
            try:
                async with sse_client(url, headers) as stream:
                    async with ClientSession(*stream) as client_session:
                        try:
                            await asyncio.wait_for(client_session.initialize(), timeout=5)
                            logging.info("client_session initialized successfully")
                            await self._process_mcp_tasks(client_session)
                        except asyncio.TimeoutError:
                            msg = f"Timeout initializing client_session for server {self._mcp_server.id}"
                            logging.error(msg)
                            await self._process_mcp_tasks(None, msg)
                        except asyncio.CancelledError:
                            logging.warning(f"SSE transport MCP session cancelled for server {self._mcp_server.id}")
                            return
            except Exception:
                msg = "Connection failed (possibly due to auth error). Please check authentication settings first"
                await self._process_mcp_tasks(None, msg)

        elif self._mcp_server.server_type == MCPServerType.STREAMABLE_HTTP:
            # Streamable HTTP transport
            try:
                async with streamablehttp_client(url, headers) as (read_stream, write_stream, _):
                    async with ClientSession(read_stream, write_stream) as client_session:
                        try:
                            await asyncio.wait_for(client_session.initialize(), timeout=5)
                            logging.info("client_session initialized successfully")
                            await self._process_mcp_tasks(client_session)
                        except asyncio.TimeoutError:
                            msg = f"Timeout initializing client_session for server {self._mcp_server.id}"
                            logging.error(msg)
                            await self._process_mcp_tasks(None, msg)
                        except asyncio.CancelledError:
                            logging.warning(f"STREAMABLE_HTTP MCP session cancelled for server {self._mcp_server.id}")
                            return
            except Exception as e:
                logging.exception(e)
                msg = "Connection failed (possibly due to auth error). Please check authentication settings first"
                await self._process_mcp_tasks(None, msg)

        else:
            await self._process_mcp_tasks(None,
                                          f"Unsupported MCP server type: {self._mcp_server.server_type}, id: {self._mcp_server.id}")

    async def _process_mcp_tasks(self, client_session: ClientSession | None, error_message: str | None = None) -> None:
        """Consume tasks from the internal queue and dispatch them to the MCP client session.

        Args:
            client_session: An initialised MCP ClientSession, or None if connection failed.
            error_message: Error message to return for every task when client_session is None.
        """
        while not self._close:
            try:
                mcp_task, arguments, result_queue = await asyncio.wait_for(self._queue.get(), timeout=1)
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

            logging.debug(f"Got MCP task {mcp_task} arguments {arguments}")

            r: Any = None

            # If session is unavailable, return the error for every task
            if not client_session or error_message:
                r = ValueError(error_message)
                try:
                    await result_queue.put(r)
                except asyncio.CancelledError:
                    break
                continue

            # Dispatch task to the appropriate MCP client method
            try:
                if mcp_task == "list_tools":
                    r = await client_session.list_tools()
                elif mcp_task == "tool_call":
                    r = await client_session.call_tool(**arguments)
                else:
                    r = ValueError(f"Unknown MCP task {mcp_task}")
            except Exception as e:
                r = e
            except asyncio.CancelledError:
                break

            try:
                await result_queue.put(r)
            except asyncio.CancelledError:
                break

    async def _call_mcp_server(self, task_type: MCPTaskType, request_timeout: float | int = 8, **kwargs) -> Any:
        """Enqueue a task and wait for its result with a timeout.

        Args:
            task_type: Either "list_tools" or "tool_call".
            request_timeout: Maximum seconds to wait for a result.
            **kwargs: Arguments forwarded to the MCP client method.

        Returns:
            The result from the MCP server.

        Raises:
            ValueError: If the session is closed.
            asyncio.TimeoutError: If the task does not complete within *request_timeout*.
        """
        if self._close:
            raise ValueError("Session is closed")

        results = asyncio.Queue()
        await self._queue.put((task_type, kwargs, results))

        try:
            result: CallToolResult | Exception = await asyncio.wait_for(results.get(), timeout=request_timeout)
            if isinstance(result, Exception):
                raise result
            return result
        except asyncio.TimeoutError:
            raise asyncio.TimeoutError(f"MCP task '{task_type}' timeout after {request_timeout}s")
        except Exception:
            raise

    async def _call_mcp_tool(self, name: str, arguments: dict[str, Any], request_timeout: float | int = 10) -> str:
        """Invoke a single tool on the MCP server and return the text result.

        Args:
            name: Tool name to invoke.
            arguments: Arguments to pass to the tool.
            request_timeout: Maximum seconds to wait.

        Returns:
            The text content returned by the tool, or an error description string.
        """
        result: CallToolResult = await self._call_mcp_server("tool_call", name=name, arguments=arguments,
                                                             request_timeout=request_timeout)

        if result.isError:
            return f"MCP server error: {result.content}"

        # For now, we only support text content
        if isinstance(result.content[0], TextContent):
            return result.content[0].text
        else:
            return f"Unsupported content type {type(result.content)}"

    async def _get_tools_from_mcp_server(self, request_timeout: float | int = 8) -> list[Tool]:
        """Fetch the list of available tools from the MCP server.

        Args:
            request_timeout: Maximum seconds to wait.

        Returns:
            List of MCP Tool metadata objects.
        """
        try:
            result: ListToolsResult = await self._call_mcp_server("list_tools", request_timeout=request_timeout)
            return result.tools
        except Exception:
            raise

    def get_tools(self, timeout: float | int = 10) -> list[Tool]:
        """Synchronously fetch tools from the MCP server.

        Args:
            timeout: Maximum seconds to wait for the response.

        Returns:
            List of MCP Tool metadata objects.

        Raises:
            ValueError: If the session is closed.
            RuntimeError: If the request times out.
        """
        if self._close:
            raise ValueError("Session is closed")

        future = asyncio.run_coroutine_threadsafe(self._get_tools_from_mcp_server(request_timeout=timeout), self._event_loop)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError:
            msg = f"Timeout when fetching tools from MCP server: {self._mcp_server.id} (timeout={timeout})"
            logging.error(msg)
            raise RuntimeError(msg)
        except Exception:
            logging.exception(f"Error fetching tools from MCP server: {self._mcp_server.id}")
            raise

    @override
    def tool_call(self, name: str, arguments: dict[str, Any], timeout: float | int = 10) -> str:
        """Synchronously invoke a tool on the MCP server.

        Args:
            name: Tool name to invoke.
            arguments: Arguments dict to pass to the tool.
            timeout: Maximum seconds to wait for the response.

        Returns:
            The text result from the tool, or an error description string.
        """
        if self._close:
            return "Error: Session is closed"

        future = asyncio.run_coroutine_threadsafe(self._call_mcp_tool(name, arguments), self._event_loop)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError:
            logging.error(f"Timeout calling tool '{name}' on MCP server: {self._mcp_server.id} (timeout={timeout})")
            return f"Timeout calling tool '{name}' (timeout={timeout})."
        except Exception as e:
            logging.exception(f"Error calling tool '{name}' on MCP server: {self._mcp_server.id}")
            return f"Error calling tool '{name}': {e}."

    async def close(self) -> None:
        """Asynchronously close this session, draining pending tasks and stopping the event loop."""
        if self._close:
            return

        self._close = True

        # Drain any pending tasks and notify them of cancellation
        while not self._queue.empty():
            try:
                _, _, result_queue = self._queue.get_nowait()
                try:
                    await result_queue.put(asyncio.CancelledError("Session is closing"))
                except Exception:
                    pass
            except asyncio.QueueEmpty:
                break
            except Exception:
                break

        # Stop the background event loop
        try:
            self._event_loop.call_soon_threadsafe(self._event_loop.stop)
        except Exception:
            pass

        # Shut down the thread pool
        try:
            self._thread_pool.shutdown(wait=True)
        except Exception:
            pass

        self.__class__._ALL_INSTANCES.discard(self)

    def close_sync(self, timeout: float | int = 5) -> None:
        """Synchronously close this session by scheduling the async close on the event loop.

        Args:
            timeout: Maximum seconds to wait for the close operation to complete.
        """
        if not self._event_loop.is_running():
            logging.warning(f"Event loop already stopped for {self._mcp_server.id}")
            return

        try:
            future = asyncio.run_coroutine_threadsafe(self.close(), self._event_loop)
            try:
                future.result(timeout=timeout)
            except FuturesTimeoutError:
                logging.error(f"Timeout while closing session for server {self._mcp_server.id} (timeout={timeout})")
            except Exception:
                logging.exception(f"Unexpected error during close_sync for {self._mcp_server.id}")
        except Exception:
            logging.exception(f"Exception while scheduling close for server {self._mcp_server.id}")


def close_multiple_mcp_toolcall_sessions(sessions: list[MCPToolCallSession]) -> None:
    """Close multiple MCP sessions concurrently using a temporary event loop.

    Args:
        sessions: List of MCPToolCallSession instances to close.
    """
    logging.info(f"Want to clean up {len(sessions)} MCP sessions")

    async def _gather_and_stop() -> None:
        try:
            await asyncio.gather(*[s.close() for s in sessions if s is not None], return_exceptions=True)
        except Exception:
            logging.exception("Exception during MCP session cleanup")
        finally:
            try:
                loop.call_soon_threadsafe(loop.stop)
            except Exception:
                pass

    try:
        loop = asyncio.new_event_loop()
        thread = threading.Thread(target=loop.run_forever, daemon=True)
        thread.start()

        asyncio.run_coroutine_threadsafe(_gather_and_stop(), loop).result()
        thread.join()
    except Exception:
        logging.exception("Exception during MCP session cleanup thread management")

    logging.info(
        f"{len(sessions)} MCP sessions has been cleaned up. {len(list(MCPToolCallSession._ALL_INSTANCES))} in global context.")


def shutdown_all_mcp_sessions():
    """Gracefully shutdown all active MCPToolCallSession instances."""
    sessions = list(MCPToolCallSession._ALL_INSTANCES)
    if not sessions:
        logging.info("No MCPToolCallSession instances to close.")
        return

    logging.info(f"Shutting down {len(sessions)} MCPToolCallSession instances...")
    close_multiple_mcp_toolcall_sessions(sessions)
    logging.info("All MCPToolCallSession instances have been closed.")


def mcp_tool_metadata_to_openai_tool(mcp_tool: Tool | dict) -> dict[str, Any]:
    """Convert MCP tool metadata into OpenAI function-calling format.

    Accepts either an MCP ``Tool`` object or a plain dict with the same shape.

    Args:
        mcp_tool: MCP tool definition (object or dict with name, description, inputSchema).

    Returns:
        Dict in the OpenAI ``{"type": "function", "function": {...}}`` format.
    """
    if isinstance(mcp_tool, dict):
        return {
            "type": "function",
            "function": {
                "name": mcp_tool["name"],
                "description": mcp_tool["description"],
                "parameters": mcp_tool["inputSchema"],
            },
        }

    return {
        "type": "function",
        "function": {
            "name": mcp_tool.name,
            "description": mcp_tool.description,
            "parameters": mcp_tool.inputSchema,
        },
    }
