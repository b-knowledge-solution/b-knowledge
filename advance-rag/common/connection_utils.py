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
Timeout decorator for synchronous and asynchronous functions.

Provides a ``timeout`` decorator that wraps both sync and async callables,
enforcing an execution time limit with configurable retry attempts and an
optional callback or custom exception on timeout.  Timeout enforcement is
controlled by the ``ENABLE_TIMEOUT_ASSERTION`` environment variable.
"""

import os
import queue
import threading
from typing import Any, Callable, Coroutine, Optional, Type, Union
import asyncio
from functools import wraps

# Type aliases for the decorator parameters
TimeoutException = Union[Type[BaseException], BaseException]
OnTimeoutCallback = Union[Callable[..., Any], Coroutine[Any, Any, Any]]


def timeout(seconds: float | int | str = None, attempts: int = 2, *, exception: Optional[TimeoutException] = None,
            on_timeout: Optional[OnTimeoutCallback] = None):
    """Decorator factory that adds a timeout to synchronous or async functions.

    For **sync** functions a daemon thread is used; for **async** functions
    ``asyncio.wait_for`` is used.  The timeout is only enforced when the
    ``ENABLE_TIMEOUT_ASSERTION`` environment variable is set (to any truthy
    value), allowing it to be disabled in development.

    Args:
        seconds: Maximum execution time in seconds (accepts str for env-driven config).
            If None, no timeout is applied to async functions.
        attempts: Number of attempts before giving up (default 2).
        exception: Custom exception type or instance to raise on timeout.
            If None, a standard ``TimeoutError`` is raised.
        on_timeout: Callback (sync or async) invoked when timeout is reached
            instead of raising an exception.  Its return value becomes the
            function's return value.

    Returns:
        A decorator that wraps the target function with timeout logic.

    Raises:
        TimeoutError: When the function exceeds *seconds* across all *attempts*
            and no *on_timeout* or *exception* override is provided.
    """
    if isinstance(seconds, str):
        seconds = float(seconds)

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            """Sync wrapper: runs *func* in a daemon thread with a timeout."""
            result_queue = queue.Queue(maxsize=1)

            def target():
                try:
                    result = func(*args, **kwargs)
                    result_queue.put(result)
                except Exception as e:
                    result_queue.put(e)

            thread = threading.Thread(target=target)
            thread.daemon = True
            thread.start()

            # Attempt to get the result within the timeout window
            for a in range(attempts):
                try:
                    if os.environ.get("ENABLE_TIMEOUT_ASSERTION"):
                        result = result_queue.get(timeout=seconds)
                    else:
                        result = result_queue.get()
                    if isinstance(result, Exception):
                        raise result
                    return result
                except queue.Empty:
                    pass
            raise TimeoutError(f"Function '{func.__name__}' timed out after {seconds} seconds and {attempts} attempts.")

        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            """Async wrapper: uses asyncio.wait_for with a timeout."""
            if seconds is None:
                return await func(*args, **kwargs)

            for a in range(attempts):
                try:
                    if os.environ.get("ENABLE_TIMEOUT_ASSERTION"):
                        return await asyncio.wait_for(func(*args, **kwargs), timeout=seconds)
                    else:
                        return await func(*args, **kwargs)
                except asyncio.TimeoutError:
                    if a < attempts - 1:
                        continue
                    # All attempts exhausted -- invoke callback or raise
                    if on_timeout is not None:
                        if callable(on_timeout):
                            result = on_timeout()
                            if isinstance(result, Coroutine):
                                return await result
                            return result
                        return on_timeout

                    if exception is None:
                        raise TimeoutError(f"Operation timed out after {seconds} seconds and {attempts} attempts.")

                    if isinstance(exception, BaseException):
                        raise exception

                    if isinstance(exception, type) and issubclass(exception, BaseException):
                        raise exception(f"Operation timed out after {seconds} seconds and {attempts} attempts.")

                    raise RuntimeError("Invalid exception type provided")

        # Return the appropriate wrapper based on whether func is async
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return wrapper

    return decorator
